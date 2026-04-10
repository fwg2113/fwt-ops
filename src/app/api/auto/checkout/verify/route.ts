import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { notifyNewBooking } from '@/app/lib/notifications';
import { syncBookingToCalendar } from '@/app/lib/google-calendar';
import { createTenantSquareClient } from '@/app/lib/square';

// GET /api/auto/checkout/verify?session_id=xxx
// Confirms a booking after Square payment.
//
// SECURITY (audit C7): Previously this endpoint confirmed bookings purely on
// the presence of a session_id in the database, with no actual verification
// that the customer paid. Combined with weak Math.random() session keys, an
// attacker who guessed a session_id could mark a pending booking as paid
// without ever paying. Now, before confirming, we query Square's Orders API
// to verify the order's state == 'COMPLETED'. The signed webhook is the
// primary confirm path; this endpoint is a redundant fallback for when
// Square redirects the customer back before the webhook arrives.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  // session_id is the Square order_id (post-2026-04-09 fix). Look up the
  // booking by it. The webhook uses the same key, so this lookup matches
  // whichever path created/confirmed the booking.
  const { data: booking } = await supabaseAdmin
    .from('auto_bookings')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!booking) {
    return NextResponse.json({ confirmed: false });
  }

  // Fetch shop config for confirmation page
  const { data: shopConfig } = await supabaseAdmin
    .from('shop_config')
    .select('shop_name, shop_phone, shop_address')
    .eq('id', 1)
    .single();

  const bookingDetails = {
    customerName: booking.customer_name,
    vehicleYear: booking.vehicle_year,
    vehicleMake: booking.vehicle_make,
    vehicleModel: booking.vehicle_model,
    appointmentDate: booking.appointment_date,
    appointmentTime: booking.appointment_time,
    appointmentType: booking.appointment_type,
    services: booking.services_json,
    subtotal: booking.subtotal,
    discountAmount: booking.discount_amount,
    depositPaid: booking.deposit_paid,
    balanceDue: booking.balance_due ?? ((booking.subtotal || 0) - (booking.discount_amount || 0) - (booking.deposit_paid || 0)),
    shopName: shopConfig?.shop_name || '',
    shopPhone: shopConfig?.shop_phone || '',
    shopAddress: shopConfig?.shop_address || '',
  };

  // Already confirmed (webhook got there first)
  if (booking.status === 'booked') {
    return NextResponse.json({ confirmed: true, bookingId: booking.booking_id, details: bookingDetails });
  }

  // Payment may have succeeded but webhook hasn't fired yet — but we MUST
  // verify directly with Square that the order is paid before confirming.
  // Without this check, an attacker who guesses a session_id could mark the
  // pending booking as paid without ever paying.
  if (booking.status === 'pending_payment') {
    // Fetch the shop's Square access token to query the order
    const { data: shopRow } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token, square_connected')
      .eq('id', booking.shop_id || 1)
      .single();

    if (!shopRow?.square_connected || !shopRow.square_access_token) {
      console.error('Verify: Square not connected, cannot verify order', { sessionId });
      return NextResponse.json({ confirmed: false, reason: 'Square not connected' });
    }

    // Use the stored Square order_id (new column) with a fallback to
    // stripe_checkout_session_id (where legacy/broken-flow rows stored it).
    const squareOrderId = booking.square_order_id || booking.stripe_checkout_session_id;
    if (!squareOrderId) {
      console.error('Verify: no Square order_id on booking', { sessionId, bookingId: booking.id });
      return NextResponse.json({ confirmed: false, reason: 'Missing Square order reference' });
    }

    try {
      const tenantSquare = createTenantSquareClient(shopRow.square_access_token);
      const orderResp: any = await tenantSquare.orders.get({ orderId: squareOrderId });
      const order = orderResp.order || orderResp.data?.order || orderResp.data;

      // Square Payment Link orders stay in state OPEN after payment — COMPLETED
      // only happens when an order is explicitly closed (e.g. via a POS flow).
      // The authoritative "paid" signal is an order tender with status CAPTURED
      // (card) or a non-empty tenders array for cash/other.
      const tenders = order?.tenders || [];
      const state = order?.state;

      // Canceled orders are definitively not paid.
      if (state === 'CANCELED') {
        return NextResponse.json({ confirmed: false, reason: 'Order was canceled' });
      }

      // Check that at least one tender is captured/completed.
      const paid = Array.isArray(tenders) && tenders.some((t: any) => {
        if (!t) return false;
        // CARD tenders: card_details.status must be CAPTURED
        if (t.type === 'CARD') {
          const status = t.card_details?.status || t.cardDetails?.status;
          return status === 'CAPTURED';
        }
        // Non-card tenders (CASH, OTHER): presence of an amount is enough,
        // Square wouldn't record them if they weren't collected.
        const amt = t.amount_money?.amount || t.amountMoney?.amount;
        return amt && Number(amt) > 0;
      });

      if (!paid) {
        console.log('Verify: order has no captured tenders yet', { sessionId, state, tenderCount: tenders.length });
        return NextResponse.json({ confirmed: false, reason: 'Payment not yet confirmed' });
      }

      // Compute actual amount paid from tenders (for deposit_paid field below).
      // We handle this as a side-effect by updating booking.deposit_paid from
      // the sum of captured tenders, so whatever the customer actually paid
      // (including any processing fee) gets reflected — but for now we trust
      // the configured deposit_amount downstream.
    } catch (err) {
      console.error('Verify: Square order lookup failed', err);
      return NextResponse.json({ confirmed: false, reason: 'Could not verify with Square' });
    }

    // Generate real booking ID
    const { data: bookingIdResult } = await supabaseAdmin.rpc('generate_auto_booking_id');
    const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

    // Read deposit from Stripe metadata or booking data
    const depositAmount = booking.deposit_paid || 50;

    // Upsert customer
    let customerId: string | null = booking.customer_id;
    if (!customerId && booking.customer_phone) {
      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('phone', booking.customer_phone)
        .single();

      if (existing) {
        customerId = existing.id;
      } else {
        const nameParts = (booking.customer_name || '').split(' ');
        const { data: newCust } = await supabaseAdmin
          .from('customers')
          .insert({
            phone: booking.customer_phone,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            email: booking.customer_email || null,
          })
          .select('id')
          .single();
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
        balance_due: (booking.subtotal || 0) - (booking.discount_amount || 0) - depositAmount,
        customer_id: customerId,
        booking_source: 'online',
      })
      .eq('id', booking.id);

    // Create backing quote document
    const services = Array.isArray(booking.services_json) ? booking.services_json : [];
    const quoteResult = await createQuoteForAppointment({
      shopId: 1,
      customerId,
      customerName: booking.customer_name || '',
      customerEmail: booking.customer_email,
      customerPhone: booking.customer_phone,
      vehicleYear: booking.vehicle_year,
      vehicleMake: booking.vehicle_make,
      vehicleModel: booking.vehicle_model,
      classKeys: booking.class_keys,
      services,
      subtotal: booking.subtotal || 0,
      discountCode: booking.discount_code,
      discountType: booking.discount_type,
      discountPercent: booking.discount_percent || 0,
      discountAmount: booking.discount_amount || 0,
      depositPaid: depositAmount,
      balanceDue: (booking.subtotal || 0) - (booking.discount_amount || 0) - depositAmount,
      module: booking.module || 'auto_tint',
      bookingId: booking.id,
    });

    if (quoteResult) {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ document_id: quoteResult.documentId })
        .eq('id', booking.id);
    }

    // Update details with confirmed amounts
    bookingDetails.depositPaid = depositAmount;
    bookingDetails.balanceDue = (booking.subtotal || 0) - (booking.discount_amount || 0) - depositAmount;

    // Send team + customer notifications
    notifyNewBooking(booking.shop_id || 1, {
      customer_name: booking.customer_name || '',
      customer_phone: booking.customer_phone || null,
      customer_email: booking.customer_email || null,
      vehicle_year: booking.vehicle_year,
      vehicle_make: booking.vehicle_make,
      vehicle_model: booking.vehicle_model,
      appointment_date: booking.appointment_date,
      appointment_time: booking.appointment_time,
      services_json: Array.isArray(booking.services_json) ? booking.services_json : [],
      subtotal: booking.subtotal || 0,
      deposit_paid: depositAmount,
      balance_due: (booking.subtotal || 0) - (booking.discount_amount || 0) - depositAmount,
      module: booking.module || 'auto_tint',
    }).catch(err => console.error('Notification error:', err));

    // Sync to Google Calendar
    syncBookingToCalendar(booking.shop_id || 1, {
      id: booking.id,
      customer_name: booking.customer_name || '',
      customer_phone: booking.customer_phone || null,
      vehicle_year: booking.vehicle_year,
      vehicle_make: booking.vehicle_make,
      vehicle_model: booking.vehicle_model,
      appointment_date: booking.appointment_date,
      appointment_time: booking.appointment_time,
      appointment_type: booking.appointment_type || 'dropoff',
      services_json: Array.isArray(booking.services_json) ? booking.services_json : [],
      subtotal: booking.subtotal || 0,
      deposit_paid: depositAmount,
      balance_due: (booking.subtotal || 0) - (booking.discount_amount || 0) - depositAmount,
      duration_minutes: booking.duration_minutes || 60,
      notes: booking.notes || null,
    }).catch(err => console.error('Calendar sync error:', err));

    return NextResponse.json({ confirmed: true, bookingId, details: bookingDetails });
  }

  return NextResponse.json({ confirmed: false });
}
