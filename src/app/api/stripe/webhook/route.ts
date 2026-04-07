import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { notifyNewBooking } from '@/app/lib/notifications';
import Stripe from 'stripe';

// Stripe sends the raw body, not JSON — we need to read it as-is for signature verification
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    // In development without a webhook secret, parse directly
    // In production, verify signature with STRIPE_WEBHOOK_SECRET
    let event: Stripe.Event;

    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          body,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } else {
      // Development: parse without signature verification
      event = JSON.parse(body) as Stripe.Event;
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const sessionId = session.id;
  const meta = session.metadata || {};

  // Find the pending booking by stripe_session_id
  const { data: pendingBooking } = await supabaseAdmin
    .from('auto_bookings')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!pendingBooking) {
    console.error('No pending booking found for session:', sessionId);
    return;
  }

  // Generate the real booking ID
  const { data: bookingIdResult } = await supabaseAdmin
    .rpc('generate_auto_booking_id');

  const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

  const depositAmount = parseFloat(meta.deposit_amount || '50');

  // Upsert customer
  let customerId: string | null = null;
  const phone = pendingBooking.customer_phone;
  if (phone) {
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existing) {
      customerId = existing.id;
      await supabaseAdmin
        .from('customers')
        .update({
          first_name: meta.first_name,
          last_name: meta.last_name,
          email: meta.email || undefined,
        })
        .eq('id', customerId);
    } else {
      const { data: newCustomer } = await supabaseAdmin
        .from('customers')
        .insert({
          phone,
          first_name: meta.first_name,
          last_name: meta.last_name,
          email: meta.email,
        })
        .select('id')
        .single();
      customerId = newCustomer?.id || null;
    }
  }

  // Update the pending booking to confirmed
  await supabaseAdmin
    .from('auto_bookings')
    .update({
      booking_id: bookingId,
      status: 'booked',
      deposit_paid: depositAmount,
      balance_due: pendingBooking.subtotal - pendingBooking.discount_amount - depositAmount,
      customer_id: customerId,
      stripe_payment_intent_id: session.payment_intent as string,
      booking_source: 'online',
    })
    .eq('id', pendingBooking.id);

  // If a GC was used (dollar type), mark it as redeemed
  if (pendingBooking.discount_code && pendingBooking.discount_type === 'dollar') {
    await supabaseAdmin
      .from('auto_gift_certificates')
      .update({
        redeemed: true,
        redeemed_at: new Date().toISOString(),
        redeemed_booking_id: bookingId,
      })
      .ilike('gc_code', pendingBooking.discount_code);
  }

  // Auto-create a backing quote document for this appointment
  const services = Array.isArray(pendingBooking.services_json) ? pendingBooking.services_json : [];
  const quoteResult = await createQuoteForAppointment({
    shopId: 1,
    customerId,
    customerName: pendingBooking.customer_name || '',
    customerEmail: pendingBooking.customer_email,
    customerPhone: pendingBooking.customer_phone,
    vehicleYear: pendingBooking.vehicle_year,
    vehicleMake: pendingBooking.vehicle_make,
    vehicleModel: pendingBooking.vehicle_model,
    classKeys: pendingBooking.class_keys,
    services,
    subtotal: pendingBooking.subtotal || 0,
    discountCode: pendingBooking.discount_code,
    discountType: pendingBooking.discount_type,
    discountPercent: pendingBooking.discount_percent || 0,
    discountAmount: pendingBooking.discount_amount || 0,
    depositPaid: depositAmount,
    balanceDue: pendingBooking.subtotal - pendingBooking.discount_amount - depositAmount,
    module: pendingBooking.module || 'auto_tint',
    bookingId: pendingBooking.id,
  });

  if (quoteResult) {
    await supabaseAdmin
      .from('auto_bookings')
      .update({ document_id: quoteResult.documentId })
      .eq('id', pendingBooking.id);
  }

  // Auto-post deposit as revenue transaction
  try {
    const { data: txnId } = await supabaseAdmin
      .rpc('generate_transaction_id', { p_shop_id: 1 });

    await supabaseAdmin
      .from('transactions')
      .insert({
        shop_id: 1,
        transaction_id: txnId || `TXN-${Date.now()}`,
        txn_date: new Date().toISOString().split('T')[0],
        brand: 'default',
        direction: 'IN',
        event_type: 'SALE',
        amount: depositAmount,
        account: 'Stripe',
        category: 'Auto Tint Revenue',
        vendor_or_customer: pendingBooking.customer_name || null,
        invoice_id: bookingId,
        payment_method: 'Credit Card',
        processor: 'Stripe',
        memo: `Deposit - ${pendingBooking.vehicle_make || ''} ${pendingBooking.vehicle_model || ''}`.trim(),
        posted_by: 'stripe_webhook',
      });
  } catch (txnErr) {
    console.error('Revenue auto-post error:', txnErr);
  }

  console.log(`Booking confirmed: ${bookingId} (session: ${sessionId})`);

  // Send team + customer notifications (fire and forget -- don't block webhook response)
  notifyNewBooking(1, {
    customer_name: pendingBooking.customer_name || '',
    customer_phone: pendingBooking.customer_phone,
    customer_email: pendingBooking.customer_email || meta.email || null,
    vehicle_year: pendingBooking.vehicle_year,
    vehicle_make: pendingBooking.vehicle_make,
    vehicle_model: pendingBooking.vehicle_model,
    appointment_date: pendingBooking.appointment_date,
    appointment_time: pendingBooking.appointment_time,
    services_json: Array.isArray(pendingBooking.services_json) ? pendingBooking.services_json : [],
    subtotal: pendingBooking.subtotal || 0,
    deposit_paid: depositAmount,
    balance_due: pendingBooking.subtotal - pendingBooking.discount_amount - depositAmount,
    module: pendingBooking.module || 'auto_tint',
  }).catch(err => console.error('Notification error:', err));
}
