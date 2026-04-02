import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/inquiry
// Submits a vehicle inquiry for vehicles not in the database
export async function POST(request: NextRequest) {
  try {
    const { year, make, model, name, email, phone, services, notes } = await request.json();

    if (!year || !make || !model || !name || !phone) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // Store in a simple inquiries approach — insert as a booking with special source
    // For now, we'll store it in a notes-based approach
    // Future: dedicated inquiries table

    // Upsert customer
    const cleanPhone = phone.replace(/\D/g, '');
    let customerId: string | null = null;

    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('phone', cleanPhone)
      .single();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCustomer } = await supabaseAdmin
        .from('customers')
        .insert({
          phone: cleanPhone,
          first_name: name,
          email,
        })
        .select('id')
        .single();
      customerId = newCustomer?.id || null;
    }

    // For now, create a booking with 'phone' source to flag it as an inquiry
    const { data: bookingIdResult } = await supabaseAdmin
      .rpc('generate_auto_booking_id');

    const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

    const { error } = await supabaseAdmin
      .from('auto_bookings')
      .insert({
        booking_id: bookingId,
        customer_id: customerId,
        booking_source: 'phone',
        appointment_type: 'dropoff',
        service_type: 'tint',
        customer_name: name,
        customer_email: email,
        customer_phone: cleanPhone,
        vehicle_year: parseInt(year) || null,
        vehicle_make: make,
        vehicle_model: model,
        appointment_date: new Date().toISOString().split('T')[0],
        services_json: JSON.stringify(services || []),
        subtotal: 0,
        balance_due: 0,
        status: 'booked',
        notes: `VEHICLE INQUIRY — Not in database.\nServices interested: ${(services || []).join(', ')}\nNotes: ${notes || 'None'}`,
      });

    if (error) {
      console.error('Inquiry insert error:', error);
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, bookingId });
  } catch (error) {
    console.error('Inquiry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
