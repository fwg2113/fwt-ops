import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { notifyNewBooking } from '@/app/lib/notifications';
import { syncBookingToCalendar } from '@/app/lib/google-calendar';

// POST /api/auto/book
// Creates a new booking — customer upsert + booking insert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      firstName, lastName, phone, email,
      vehicleYear, vehicleMake, vehicleModel, classKeys,
      serviceType, appointmentType,
      servicesJson, subtotal,
      discountCode, discountType, discountPercent, discountAmount,
      depositPaid, balanceDue,
      appointmentDate, appointmentTime, durationMinutes,
      windowStatus, hasAftermarketTint,
      additionalInterests, notes,
      emojiMarker, calendarTitle,
      existingDocumentId, // If a quote document already exists (e.g., from FLQA lead), skip creating a new one
    } = body;

    // Upsert customer by phone
    let customerId: string | null = null;
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');

      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('phone', cleanPhone)
        .single();

      if (existing) {
        customerId = existing.id;
        // Update name/email if provided
        await supabaseAdmin
          .from('customers')
          .update({
            first_name: firstName,
            last_name: lastName,
            email: email || undefined,
          })
          .eq('id', customerId);
      } else {
        const { data: newCustomer } = await supabaseAdmin
          .from('customers')
          .insert({
            shop_id: 1,
            phone: cleanPhone,
            first_name: firstName,
            last_name: lastName,
            email,
          })
          .select('id')
          .single();

        customerId = newCustomer?.id || null;
      }
    }

    // Generate booking ID
    const { data: bookingIdResult } = await supabaseAdmin
      .rpc('generate_auto_booking_id');

    const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

    // Insert booking
    const { data: booking, error } = await supabaseAdmin
      .from('auto_bookings')
      .insert({
        shop_id: 1,
        booking_id: bookingId,
        customer_id: customerId,
        booking_source: discountCode ? 'gc' : 'online',
        appointment_type: appointmentType,
        service_type: serviceType,
        emoji_marker: emojiMarker,
        customer_name: `${firstName} ${lastName}`.trim(),
        customer_email: email,
        customer_phone: phone?.replace(/\D/g, ''),
        vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
        vehicle_make: vehicleMake,
        vehicle_model: vehicleModel,
        class_keys: classKeys,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        duration_minutes: durationMinutes,
        services_json: servicesJson,
        subtotal,
        discount_code: discountCode || null,
        discount_type: discountType || null,
        discount_percent: discountPercent || 0,
        discount_amount: discountAmount || 0,
        deposit_paid: depositPaid || 0,
        balance_due: balanceDue,
        calendar_title: calendarTitle,
        status: 'booked',
        window_status: windowStatus || null,
        has_aftermarket_tint: hasAftermarketTint || null,
        additional_interests: additionalInterests || null,
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error('Booking insert error:', error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    // Link existing document or auto-create a backing quote
    if (existingDocumentId) {
      // A quote document already exists (e.g., from FLQA lead) -- just link it
      await supabaseAdmin
        .from('auto_bookings')
        .update({ document_id: existingDocumentId })
        .eq('id', booking.id);

      // Update the document status to approved and link the booking
      await supabaseAdmin
        .from('documents')
        .update({ status: 'approved', booking_id: booking.id })
        .eq('id', existingDocumentId);
    } else {

    // Auto-create a backing quote document for this appointment
    const quoteResult = await createQuoteForAppointment({
      shopId: 1,
      customerId,
      customerName: `${firstName} ${lastName}`.trim(),
      customerEmail: email,
      customerPhone: phone?.replace(/\D/g, '') || null,
      vehicleYear: vehicleYear ? parseInt(vehicleYear) : null,
      vehicleMake: vehicleMake,
      vehicleModel: vehicleModel,
      classKeys: classKeys,
      services: servicesJson || [],
      subtotal: subtotal || 0,
      discountCode: discountCode || null,
      discountType: discountType || null,
      discountPercent: discountPercent || 0,
      discountAmount: discountAmount || 0,
      depositPaid: depositPaid || 0,
      balanceDue: balanceDue || 0,
      module: serviceType === 'tint' ? 'auto_tint' : serviceType,
      bookingId: booking.id,
      notes: notes || null,
    });

    if (quoteResult) {
      // Link the appointment back to the document
      await supabaseAdmin
        .from('auto_bookings')
        .update({ document_id: quoteResult.documentId })
        .eq('id', booking.id);
    }
    } // end else (no existingDocumentId)

    // If GC was used (dollar type), mark it as redeemed
    if (discountCode && discountType === 'dollar') {
      await supabaseAdmin
        .from('auto_gift_certificates')
        .update({
          redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_booking_id: bookingId,
        })
        .ilike('gc_code', discountCode);
    }

    // Send team + customer notifications (fire and forget)
    notifyNewBooking(1, {
      customer_name: `${firstName} ${lastName}`.trim(),
      customer_phone: phone?.replace(/\D/g, '') || null,
      customer_email: email || null,
      vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      services_json: servicesJson || [],
      subtotal: subtotal || 0,
      deposit_paid: depositPaid || 0,
      balance_due: balanceDue || 0,
      module: 'auto_tint',
    }).catch(err => console.error('Notification error:', err));

    // Sync to Google Calendar (fire and forget)
    if (booking) {
      syncBookingToCalendar(1, {
        id: booking.id,
        customer_name: `${firstName} ${lastName}`.trim(),
        customer_phone: phone?.replace(/\D/g, '') || null,
        vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
        vehicle_make: vehicleMake,
        vehicle_model: vehicleModel,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        appointment_type: appointmentType || 'dropoff',
        services_json: servicesJson || [],
        subtotal: subtotal || 0,
        deposit_paid: depositPaid || 0,
        balance_due: balanceDue || 0,
        duration_minutes: durationMinutes || 60,
        notes: notes || null,
      }).catch(err => console.error('Calendar sync error:', err));
    }

    return NextResponse.json({
      success: true,
      bookingId,
      booking,
    });
  } catch (error) {
    console.error('Booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
