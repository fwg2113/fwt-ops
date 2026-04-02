import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/dashboard
// Returns Command Center data — today's appointments, MTD metrics, recent inquiries
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Parallel fetch all dashboard data
    const [
      todayAppointmentsRes,
      mtdBookingsRes,
      recentInquiriesRes,
      pendingGCsRes,
    ] = await Promise.all([
      // Today's auto appointments
      supabase
        .from('auto_bookings')
        .select('id, booking_id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_type, appointment_time, duration_minutes, services_json, subtotal, balance_due, status, work_order_time')
        .eq('shop_id', shopId)
        .eq('appointment_date', today)
        .order('appointment_time', { ascending: true, nullsFirst: false }),

      // MTD bookings for metrics
      supabase
        .from('auto_bookings')
        .select('subtotal, balance_due, status, appointment_date')
        .eq('shop_id', shopId)
        .gte('appointment_date', monthStart)
        .lte('appointment_date', today)
        .neq('status', 'cancelled'),

      // Recent inquiries (phone source = vehicle inquiry)
      supabase
        .from('auto_bookings')
        .select('id, booking_id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, notes, created_at')
        .eq('shop_id', shopId)
        .eq('booking_source', 'phone')
        .order('created_at', { ascending: false })
        .limit(10),

      // Unredeemed GCs count
      supabase
        .from('auto_gift_certificates')
        .select('id', { count: 'exact' })
        .eq('shop_id', shopId)
        .eq('discount_type', 'dollar')
        .eq('redeemed', false),
    ]);

    // Today's appointments
    const todayAppointments = todayAppointmentsRes.data || [];
    const activeToday = todayAppointments.filter(a => a.status !== 'cancelled');
    const dropoffsToday = activeToday.filter(a => a.appointment_type === 'dropoff').length;
    const waitingToday = activeToday.filter(a => a.appointment_type === 'waiting').length;
    const headsupToday = activeToday.filter(a => a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60').length;
    const checkedInToday = activeToday.filter(a => a.status === 'in_progress' || a.status === 'completed' || a.status === 'invoiced').length;
    const todayRevenue = activeToday.reduce((sum, a) => sum + Number(a.subtotal || 0), 0);

    // MTD metrics
    const mtdBookings = mtdBookingsRes.data || [];
    const mtdTotalSales = mtdBookings.reduce((sum, b) => sum + Number(b.subtotal || 0), 0);
    const mtdCompletedCount = mtdBookings.filter(b => b.status === 'completed' || b.status === 'invoiced').length;
    const mtdBookedCount = mtdBookings.length;

    // Working days so far this month (Mon-Sat)
    const daysInMonth = now.getDate();
    let workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const day = date.getDay();
      if (day >= 1 && day <= 6) workingDays++;
    }

    // Total working days in the month (for projection)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let totalWorkingDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const day = date.getDay();
      if (day >= 1 && day <= 6) totalWorkingDays++;
    }

    const dailyAvg = workingDays > 0 ? mtdTotalSales / workingDays : 0;
    const projectedSales = Math.round(dailyAvg * totalWorkingDays);

    return NextResponse.json({
      today: {
        date: today,
        appointments: todayAppointments,
        total: activeToday.length,
        dropoffs: dropoffsToday,
        waiting: waitingToday,
        headsups: headsupToday,
        checkedIn: checkedInToday,
        revenue: todayRevenue,
      },
      mtd: {
        totalSales: mtdTotalSales,
        projectedSales,
        completedCount: mtdCompletedCount,
        bookedCount: mtdBookedCount,
        workingDaysSoFar: workingDays,
        totalWorkingDays,
        dailyAvg: Math.round(dailyAvg),
      },
      inquiries: recentInquiriesRes.data || [],
      pendingGCCount: pendingGCsRes.count || 0,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
