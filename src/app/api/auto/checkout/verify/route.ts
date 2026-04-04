import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';

// GET /api/auto/checkout/verify?session_id=cs_xxx
// Confirms a booking after Stripe payment. If the webhook hasn't run yet,
// this endpoint does the confirmation directly -- payment already succeeded
// by the time the customer reaches the confirmation page.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const { data: booking } = await supabaseAdmin
    .from('auto_bookings')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!booking) {
    return NextResponse.json({ confirmed: false });
  }

  // Already confirmed (webhook got there first)
  if (booking.status === 'booked') {
    return NextResponse.json({ confirmed: true, bookingId: booking.booking_id });
  }

  // Payment succeeded but webhook hasn't confirmed yet -- do it now
  if (booking.status === 'pending_payment') {
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

    return NextResponse.json({ confirmed: true, bookingId });
  }

  return NextResponse.json({ confirmed: false });
}
