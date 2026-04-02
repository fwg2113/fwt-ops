import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/customers/[id]
// Full customer profile: contact info + vehicles + job history + live bookings/invoices
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch customer, vehicles, jobs, and live bookings in parallel
    const [customerRes, vehiclesRes, jobsRes, bookingsRes, documentsRes] = await Promise.all([
      supabaseAdmin
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('shop_id', 1)
        .single(),
      supabaseAdmin
        .from('customer_vehicles')
        .select('*')
        .eq('customer_id', id)
        .eq('shop_id', 1)
        .order('last_seen', { ascending: false }),
      supabaseAdmin
        .from('customer_jobs')
        .select('*')
        .eq('customer_id', id)
        .eq('shop_id', 1)
        .order('job_date', { ascending: false }),
      supabaseAdmin
        .from('auto_bookings')
        .select('id, booking_id, appointment_date, appointment_time, appointment_type, vehicle_year, vehicle_make, vehicle_model, services_json, subtotal, balance_due, status, created_at')
        .eq('customer_id', id)
        .eq('shop_id', 1)
        .order('appointment_date', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('documents')
        .select('id, doc_number, doc_type, status, subtotal, balance_due, created_at, public_token')
        .eq('customer_id', id)
        .eq('shop_id', 1)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (customerRes.error || !customerRes.data) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({
      customer: customerRes.data,
      vehicles: vehiclesRes.data || [],
      jobs: jobsRes.data || [],
      bookings: bookingsRes.data || [],
      documents: documentsRes.data || [],
    });
  } catch (error) {
    console.error('Customer detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
