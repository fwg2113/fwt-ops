import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { createQuoteForAppointment } from '@/app/lib/invoice-utils';
import { randomUUID } from 'crypto';

// POST /api/auto/appointments/create
// Creates a generic appointment (any module). Can link to existing group.
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();

    const {
      module,
      customer_name,
      customer_phone,
      customer_email,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      appointment_date,
      appointment_time,
      duration_minutes,
      appointment_type,
      notes,
      linked_group_id,
      scheduling_mode,
      assigned_team_member_id,
      calendar_title,
      services_json,
    } = body;

    if (!module || !customer_name || !appointment_date) {
      return NextResponse.json({ error: 'module, customer_name, and appointment_date are required' }, { status: 400 });
    }

    // Generate booking ID
    const { data: bookingIdResult } = await supabase.rpc('generate_auto_booking_id');
    const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

    // If linking to existing group, verify the group exists
    let finalGroupId = linked_group_id || null;
    if (finalGroupId) {
      const { data: existing } = await supabase
        .from('auto_bookings')
        .select('id')
        .eq('linked_group_id', finalGroupId)
        .eq('shop_id', shopId)
        .limit(1);

      if (!existing || existing.length === 0) {
        return NextResponse.json({ error: 'Linked group not found' }, { status: 404 });
      }
    }

    // If no linked_group_id provided but this should start a new group,
    // the caller should handle that. This endpoint just creates a single slot.

    // Upsert customer by phone
    let customerId: string | null = null;
    if (customer_phone) {
      const cleanPhone = customer_phone.replace(/\D/g, '');
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', cleanPhone)
        .eq('shop_id', shopId)
        .single();

      if (existing) {
        customerId = existing.id;
      } else {
        const nameParts = (customer_name || '').split(' ');
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            shop_id: shopId,
            phone: cleanPhone,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            email: customer_email || null,
          })
          .select('id')
          .single();
        customerId = newCustomer?.id || null;
      }
    }

    const { data: booking, error } = await supabase
      .from('auto_bookings')
      .insert({
        shop_id: shopId,
        booking_id: bookingId,
        customer_id: customerId,
        booking_source: 'internal',
        appointment_type: appointment_type || 'dropoff',
        service_type: module,
        module,
        linked_group_id: finalGroupId,
        scheduling_mode: scheduling_mode || 'sequential',
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone?.replace(/\D/g, '') || null,
        vehicle_year: vehicle_year ? parseInt(vehicle_year) : null,
        vehicle_make: vehicle_make || null,
        vehicle_model: vehicle_model || null,
        appointment_date,
        appointment_time: appointment_time || null,
        duration_minutes: duration_minutes || 60,
        subtotal: 0,
        deposit_paid: 0,
        balance_due: 0,
        status: 'booked',
        calendar_title: calendar_title || null,
        services_json: services_json || null,
        notes: notes || null,
        assigned_team_member_id: assigned_team_member_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Appointment creation error:', error);
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Auto-create a backing quote for standalone appointments (not linked slots).
    // Linked slots share the original document from the quote that spawned them.
    let documentId: string | null = null;
    if (!finalGroupId) {
      const serviceItems = Array.isArray(services_json) ? services_json : [];
      const quoteResult = await createQuoteForAppointment({
        shopId,
        customerId,
        customerName: customer_name,
        customerEmail: customer_email || null,
        customerPhone: customer_phone?.replace(/\D/g, '') || null,
        vehicleYear: vehicle_year ? parseInt(vehicle_year) : null,
        vehicleMake: vehicle_make || null,
        vehicleModel: vehicle_model || null,
        classKeys: null,
        services: serviceItems,
        subtotal: 0,
        balanceDue: 0,
        module,
        bookingId: booking.id,
        notes: notes || null,
      });

      if (quoteResult) {
        documentId = quoteResult.documentId;
        await supabase
          .from('auto_bookings')
          .update({ document_id: documentId })
          .eq('id', booking.id);
      }
    }

    return NextResponse.json({
      success: true,
      appointment: { ...booking, document_id: documentId },
      bookingId,
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
