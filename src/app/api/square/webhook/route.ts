// ============================================================================
// SQUARE WEBHOOK
// Handles payment.completed events from Square.
// Confirms pending bookings when payment is successful.
// Backup to the verify endpoint (which confirms immediately on redirect).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
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
        // Try finding by payment link ID in case orderId doesn't match
        console.log('Square webhook: no pending booking found for order', orderId);
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

      console.log(`Square payment confirmed: booking ${bookingId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Square webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
