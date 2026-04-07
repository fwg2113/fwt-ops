import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { notifyNewBooking } from '@/app/lib/notifications';
import { syncBookingToCalendar } from '@/app/lib/google-calendar';

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
