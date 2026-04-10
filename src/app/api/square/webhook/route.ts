// ============================================================================
// SQUARE WEBHOOK
// Handles payment.completed events from Square.
// Confirms pending bookings when payment is successful.
// Backup to the verify endpoint (which confirms immediately on redirect).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { notifyNewBooking } from '@/app/lib/notifications';
import { syncBookingToCalendar } from '@/app/lib/google-calendar';

// ----------------------------------------------------------------------------
// Square Webhook Signature Verification
// ----------------------------------------------------------------------------
// Square signs every webhook with HMAC-SHA256 over (notification_url + body),
// keyed by the signature key from the webhook subscription. Without this
// check, anyone can POST a fake `payment.completed` event and confirm a
// pending booking without paying.
//
// Set SQUARE_WEBHOOK_SIGNATURE_KEY in env from:
//   Square Developer Dashboard → your app → Webhooks → Subscriptions → Signature Key
// ----------------------------------------------------------------------------
function verifySquareSignature(
  body: string,
  signatureHeader: string | null,
  notificationUrl: string,
): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) {
    // Fail-closed: if the secret isn't configured, reject everything.
    // This is intentional — better to drop legit webhooks (the verify
    // endpoint is the primary confirm path on redirect anyway) than to
    // accept forged ones.
    console.error('Square webhook: SQUARE_WEBHOOK_SIGNATURE_KEY not set, rejecting');
    return false;
  }
  if (!signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', key);
  hmac.update(notificationUrl + body);
  const expected = hmac.digest('base64');

  // Constant-time comparison to avoid timing attacks
  try {
    const sigBuf = Buffer.from(signatureHeader, 'base64');
    const expBuf = Buffer.from(expected, 'base64');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// Handle remote invoice payments (customer paid via Square Payment Link)
async function handleInvoicePayment(payment: any): Promise<boolean> {
  const orderId = payment.order_id;
  const amountCents = payment.amountMoney?.amount;
  const amount = amountCents ? Number(amountCents) / 100 : 0;
  if (!amount) return false;

  // Try to find a document by the Square session key stored in stripe_checkout_session_id
  // or by the order's referenceId (which we set to the document ID)
  let doc = null;

  // First try: look for document with matching session key
  if (orderId) {
    const { data } = await supabaseAdmin
      .from('documents')
      .select('id, shop_id, balance_due, total_paid, status, doc_number, customer_name, vehicle_make, vehicle_model')
      .eq('stripe_checkout_session_id', orderId)
      .not('status', 'in', '("paid","void")')
      .single();
    doc = data;
  }

  // Second try: match by referenceId on the Square order (set to document ID)
  if (!doc && payment.orderId) {
    try {
      // The referenceId is the document UUID
      const { data } = await supabaseAdmin
        .from('documents')
        .select('id, shop_id, balance_due, total_paid, status, doc_number, customer_name, vehicle_make, vehicle_model')
        .eq('id', payment.orderId)
        .not('status', 'in', '("paid","void")')
        .single();
      doc = data;
    } catch {
      // Not a UUID match, skip
    }
  }

  if (!doc) return false;

  const shopId = doc.shop_id || 1;

  // Record the payment in document_payments
  await supabaseAdmin
    .from('document_payments')
    .insert({
      document_id: doc.id,
      shop_id: shopId,
      amount,
      payment_method: 'credit_card',
      processor: 'square',
      reference_id: payment.id || orderId,
      status: 'confirmed',
      notes: 'Remote payment via Square',
    });

  // Update document totals
  const newTotalPaid = (doc.total_paid || 0) + amount;
  const newBalanceDue = Math.max(0, (doc.balance_due || 0) - amount);
  const newStatus = newBalanceDue <= 0 ? 'paid' : 'partial';

  await supabaseAdmin
    .from('documents')
    .update({
      total_paid: newTotalPaid,
      balance_due: newBalanceDue,
      status: newStatus,
      payment_method: 'credit_card',
      ...(newStatus === 'paid' ? { paid_at: new Date().toISOString(), payment_confirmed_at: new Date().toISOString() } : {}),
    })
    .eq('id', doc.id);

  // Auto-post revenue transaction to bookkeeping
  try {
    const { data: txnId } = await supabaseAdmin
      .rpc('generate_transaction_id', { p_shop_id: shopId });

    await supabaseAdmin
      .from('transactions')
      .insert({
        shop_id: shopId,
        transaction_id: txnId || `TXN-${Date.now()}`,
        txn_date: new Date().toISOString().split('T')[0],
        brand: 'default',
        direction: 'IN',
        event_type: 'SALE',
        amount,
        account: 'Square',
        category: 'Auto Tint Revenue',
        vendor_or_customer: doc.customer_name || null,
        invoice_id: doc.doc_number || null,
        payment_method: 'credit_card',
        processor: 'square',
        memo: [doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ') || null,
        posted_by: 'system',
      });
  } catch (txnErr) {
    console.error('Revenue auto-post error:', txnErr);
  }

  console.log(`Square invoice payment confirmed: ${doc.doc_number}, $${amount}`);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Verify HMAC signature before parsing or trusting any field of the body.
    // Square sends `x-square-hmacsha256-signature` keyed over (URL + body).
    // The notification_url MUST match exactly what's registered in the Square
    // Developer Dashboard for the webhook subscription.
    const signatureHeader = request.headers.get('x-square-hmacsha256-signature');
    const protoHeader = request.headers.get('x-forwarded-proto') || 'https';
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const notificationUrl = `${protoHeader}://${hostHeader}${request.nextUrl.pathname}`;

    if (!verifySquareSignature(body, signatureHeader, notificationUrl)) {
      console.error('Square webhook: signature verification failed', {
        hasSignature: !!signatureHeader,
        notificationUrl,
      });
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);

    // Handle payment.completed event
    if (event.type === 'payment.completed') {
      const payment = event.data?.object?.payment;
      if (!payment) return NextResponse.json({ received: true });

      const orderId = payment.order_id;
      if (!orderId) return NextResponse.json({ received: true });

      // Find the pending booking by the Square order/payment link ID
      // We stored the payment link ID in stripe_checkout_session_id (reused field)
      const { data: pendingBooking } = await supabaseAdmin
        .from('auto_bookings')
        .select('*')
        .eq('stripe_checkout_session_id', orderId)
        .eq('status', 'pending_payment')
        .single();

      if (!pendingBooking) {
        // Not a booking deposit -- check if this is a remote invoice payment
        const handled = await handleInvoicePayment(payment);
        if (handled) {
          return NextResponse.json({ received: true });
        }
        console.log('Square webhook: no pending booking or invoice found for order', orderId);
        return NextResponse.json({ received: true });
      }

      // Generate real booking ID
      const { data: bookingIdResult } = await supabaseAdmin.rpc('generate_auto_booking_id');
      const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

      const depositAmount = payment.amountMoney
        ? Number(payment.amountMoney.amount) / 100
        : 50;

      // Upsert customer
      let customerId: string | null = null;
      const phone = pendingBooking.customer_phone;
      if (phone) {
        const { data: existing } = await supabaseAdmin
          .from('customers').select('id').eq('phone', phone).single();

        if (existing) {
          customerId = existing.id;
        } else {
          const nameParts = (pendingBooking.customer_name || '').split(' ');
          const { data: newCust } = await supabaseAdmin
            .from('customers')
            .insert({
              phone,
              first_name: nameParts[0] || '',
              last_name: nameParts.slice(1).join(' ') || '',
              email: pendingBooking.customer_email || null,
            })
            .select('id').single();
          customerId = newCust?.id || null;
        }
      }

      // Confirm the booking
      await supabaseAdmin
        .from('auto_bookings')
        .update({
          booking_id: bookingId,
          status: 'booked',
          deposit_paid: depositAmount,
          balance_due: (pendingBooking.subtotal || 0) - (pendingBooking.discount_amount || 0) - depositAmount,
          customer_id: customerId,
          booking_source: 'online',
        })
        .eq('id', pendingBooking.id);

      // Create backing quote document
      const services = Array.isArray(pendingBooking.services_json) ? pendingBooking.services_json : [];
      const quoteResult = await createQuoteForAppointment({
        shopId: pendingBooking.shop_id || 1,
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
        depositPaid: depositAmount,
        balanceDue: (pendingBooking.subtotal || 0) - (pendingBooking.discount_amount || 0) - depositAmount,
        module: pendingBooking.module || 'auto_tint',
        bookingId: pendingBooking.id,
      });

      if (quoteResult) {
        await supabaseAdmin
          .from('auto_bookings')
          .update({ document_id: quoteResult.documentId })
          .eq('id', pendingBooking.id);
      }

      // Send team + customer notifications
      notifyNewBooking(pendingBooking.shop_id || 1, {
        customer_name: pendingBooking.customer_name || '',
        customer_phone: pendingBooking.customer_phone || null,
        customer_email: pendingBooking.customer_email || null,
        vehicle_year: pendingBooking.vehicle_year,
        vehicle_make: pendingBooking.vehicle_make,
        vehicle_model: pendingBooking.vehicle_model,
        appointment_date: pendingBooking.appointment_date,
        appointment_time: pendingBooking.appointment_time,
        services_json: Array.isArray(pendingBooking.services_json) ? pendingBooking.services_json : [],
        subtotal: pendingBooking.subtotal || 0,
        deposit_paid: depositAmount,
        balance_due: (pendingBooking.subtotal || 0) - (pendingBooking.discount_amount || 0) - depositAmount,
        module: pendingBooking.module || 'auto_tint',
      }).catch(err => console.error('Notification error:', err));

      // Sync to Google Calendar
      syncBookingToCalendar(pendingBooking.shop_id || 1, {
        id: pendingBooking.id,
        customer_name: pendingBooking.customer_name || '',
        customer_phone: pendingBooking.customer_phone || null,
        vehicle_year: pendingBooking.vehicle_year,
        vehicle_make: pendingBooking.vehicle_make,
        vehicle_model: pendingBooking.vehicle_model,
        appointment_date: pendingBooking.appointment_date,
        appointment_time: pendingBooking.appointment_time,
        appointment_type: pendingBooking.appointment_type || 'dropoff',
        services_json: Array.isArray(pendingBooking.services_json) ? pendingBooking.services_json : [],
        subtotal: pendingBooking.subtotal || 0,
        deposit_paid: depositAmount,
        balance_due: (pendingBooking.subtotal || 0) - (pendingBooking.discount_amount || 0) - depositAmount,
        duration_minutes: pendingBooking.duration_minutes || 60,
        notes: pendingBooking.notes || null,
      }).catch(err => console.error('Calendar sync error:', err));

      console.log(`Square payment confirmed: booking ${bookingId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Square webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
