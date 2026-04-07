import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/customers/lookup?q=8186
// Quick customer lookup by phone digits (last 4, or any partial phone match)
// Returns customers with their vehicles, jobs, and bookings inline
export const GET = withShopAuth(async ({ shopId, req }) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').replace(/\D/g, '');

  if (q.length < 3) {
    return NextResponse.json({ error: 'At least 3 digits required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Find customers whose phone contains these digits
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone, email, company_name, visit_count, lifetime_spend, last_visit_date')
    .eq('shop_id', shopId)
    .ilike('phone', `%${q}%`)
    .order('last_visit_date', { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error('Lookup error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json({ customers: [] });
  }

  const customerIds = customers.map(c => c.id);

  // Fetch all vehicles, jobs, and bookings for matched customers in parallel
  const [vehiclesRes, jobsRes, bookingsRes] = await Promise.all([
    supabase.from('customer_vehicles')
      .select('id, customer_id, vehicle_year, vehicle_make, vehicle_model, job_count, last_seen')
      .eq('shop_id', shopId)
      .in('customer_id', customerIds)
      .order('last_seen', { ascending: false, nullsFirst: false }),
    supabase.from('customer_jobs')
      .select('id, customer_id, job_date, vehicle_desc, services_summary, total, deposit, balance_due, payment_method, gc_code, notes, invoice_num')
      .eq('shop_id', shopId)
      .in('customer_id', customerIds)
      .order('job_date', { ascending: false })
      .limit(100),
    supabase.from('auto_bookings')
      .select('id, customer_id, appointment_date, appointment_time, appointment_type, vehicle_year, vehicle_make, vehicle_model, services_json, subtotal, deposit_paid, balance_due, discount_code, status, module')
      .eq('shop_id', shopId)
      .in('customer_id', customerIds)
      .order('appointment_date', { ascending: false })
      .limit(100),
  ]);

  // Group by customer
  const vehiclesByCustomer = new Map<string, typeof vehiclesRes.data>();
  const jobsByCustomer = new Map<string, typeof jobsRes.data>();
  const bookingsByCustomer = new Map<string, typeof bookingsRes.data>();

  for (const v of (vehiclesRes.data || [])) {
    if (!vehiclesByCustomer.has(v.customer_id)) vehiclesByCustomer.set(v.customer_id, []);
    vehiclesByCustomer.get(v.customer_id)!.push(v);
  }
  for (const j of (jobsRes.data || [])) {
    if (!jobsByCustomer.has(j.customer_id)) jobsByCustomer.set(j.customer_id, []);
    jobsByCustomer.get(j.customer_id)!.push(j);
  }
  for (const b of (bookingsRes.data || [])) {
    if (!bookingsByCustomer.has(b.customer_id)) bookingsByCustomer.set(b.customer_id, []);
    bookingsByCustomer.get(b.customer_id)!.push(b);
  }

  const results = customers.map(c => {
    const jobs = jobsByCustomer.get(c.id) || [];
    const bookings = bookingsByCustomer.get(c.id) || [];

    // Compute live stats from actual data (don't rely on stale columns)
    const jobSpend = jobs.reduce((s, j) => s + (Number(j.total) || 0), 0);
    const bookingSpend = bookings
      .filter(b => b.status !== 'cancelled')
      .reduce((s, b) => s + (Number(b.subtotal) || 0), 0);
    const liveVisitCount = jobs.length + bookings.filter(b => b.status !== 'cancelled').length;
    const liveLifetimeSpend = jobSpend + bookingSpend;

    // Find most recent date across both sources
    const allDates = [
      ...jobs.map(j => j.job_date).filter(Boolean),
      ...bookings.filter(b => b.status !== 'cancelled').map(b => b.appointment_date).filter(Boolean),
    ].sort().reverse();

    return {
      ...c,
      visit_count: liveVisitCount || c.visit_count || 0,
      lifetime_spend: liveLifetimeSpend || c.lifetime_spend || 0,
      last_visit_date: allDates[0] || c.last_visit_date || null,
      vehicles: vehiclesByCustomer.get(c.id) || [],
      jobs,
      bookings,
    };
  });

  return NextResponse.json({ customers: results });
});
