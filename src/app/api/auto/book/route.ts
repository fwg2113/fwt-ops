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
      warrantyForBookingId, // For warranty appointments — links to the original appointment being redone
    } = body;

    // SECURITY (audit H1/H2): basic sanity check on the total math.
    // Stop-gap until full server-side price recompute is in place.
    const sub = Number(subtotal) || 0;
    const disc = Number(discountAmount) || 0;
    const dep = Number(depositPaid) || 0;
    const bal = Number(balanceDue) || 0;

    // Reject obviously bogus values
    if (sub < 0 || disc < 0 || dep < 0 || bal < 0 || sub > 100000) {
      console.error('Booking rejected: invalid amounts', { sub, disc, dep, bal });
      return NextResponse.json({ error: 'Invalid booking amounts' }, { status: 400 });
    }
    // Math must reconcile within $1 (NFW fees + percent rounding)
    const expectedTotal = sub - disc;
    const reportedTotal = dep + bal;
    if (Math.abs(expectedTotal - reportedTotal) > 1.01) {
      console.error('Booking rejected: total mismatch', { sub, disc, dep, bal });
      return NextResponse.json({ error: 'Booking total mismatch — please refresh and try again' }, { status: 400 });
    }
    // Discount may not exceed subtotal
    if (disc > sub) {
      console.error('Booking rejected: discount > subtotal', { sub, disc });
      return NextResponse.json({ error: 'Invalid discount amount' }, { status: 400 });
    }
    // Any non-trivial discount MUST be backed by a discountCode (gift cert,
    // promo). Without this rule, an attacker can POST a $999 subtotal with
    // a $999 discount and book a free appointment — the math reconciles to 0
    // but no actual GC was used. Real GC validation happens further down.
    if (disc > 0 && !discountCode) {
      console.error('Booking rejected: discount with no code', { disc });
      return NextResponse.json({ error: 'Discount code required for any discount' }, { status: 400 });
    }
    // Discount-via-code: re-validate the GC server-side so the client can't
    // claim a $999 GC for a code that's actually worth $50.
    if (disc > 0 && discountCode) {
      const codeUpper = String(discountCode).toUpperCase().trim();
      const { data: gc } = await supabaseAdmin
        .from('auto_gift_certificates')
        .select('id, amount, discount_type, discount_value, redeemed, expires_at')
        .ilike('gc_code', codeUpper)
        .single();
      if (!gc) {
        return NextResponse.json({ error: 'Invalid discount code' }, { status: 400 });
      }
      if (gc.redeemed) {
        return NextResponse.json({ error: 'Discount code already used' }, { status: 400 });
      }
      if (gc.expires_at && new Date(gc.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Discount code expired' }, { status: 400 });
      }
      // Compute the maximum allowed discount based on the GC type
      let maxDiscount = 0;
      if (gc.discount_type === 'dollar') {
        maxDiscount = Math.min(Number(gc.amount) || 0, sub);
      } else if (gc.discount_type === 'percent') {
        maxDiscount = sub * ((Number(gc.discount_value) || 0) / 100);
      }
      // Allow $1 tolerance for rounding
      if (disc > maxDiscount + 1.01) {
        console.error('Booking rejected: discount > max for code', { disc, maxDiscount, code: codeUpper });
        return NextResponse.json({ error: 'Discount amount exceeds code value' }, { status: 400 });
      }
    }

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
        vehicle_year: vehicleYear ? parseInt(vehicleYear) || null : null,
        vehicle_make: vehicleMake || null,
        vehicle_model: vehicleModel || null,
        class_keys: classKeys || null,
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
        warranty_for_booking_id: warrantyForBookingId || null,
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

      // Lock the upsell baseline at booking time. The price the customer
      // ACTUALLY agreed to in this booking (subtotal) becomes the immutable
      // starting_total — any future upsell at counter checkout is measured
      // against this. We only set it if it isn't already locked (preserving
      // any earlier value from quote creation, in case of re-booking).
      const { data: existingDocRow } = await supabaseAdmin
        .from('documents')
        .select('starting_total')
        .eq('id', existingDocumentId)
        .single();

      const docUpdate: Record<string, unknown> = {
        status: 'approved',
        booking_id: booking.id,
        // Sync subtotal so the doc reflects the customer's actual chosen price
        // (in options_mode they may pick a different option than the lead default).
        subtotal: subtotal || 0,
      };
      if (existingDocRow?.starting_total == null) {
        docUpdate.starting_total = subtotal || 0;
      }

      await supabaseAdmin
        .from('documents')
        .update(docUpdate)
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
