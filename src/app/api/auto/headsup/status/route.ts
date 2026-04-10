import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/headsup/status?date=2026-04-10
// Dashboard: get heads-up pool + offer statuses for a date
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get any pools for this date
    const { data: pools } = await supabase
      .from('headsup_pools')
      .select('*')
      .eq('shop_id', shopId)
      .eq('pool_date', date)
      .order('created_at', { ascending: false });

    // Get all offers for today's bookings
    const { data: offers } = await supabase
      .from('headsup_offers')
      .select(`
        id, booking_id, token, mode, offered_slots, claimed_time, claimed_at,
        reschedule_requested, status, notice_minutes, sent_at, pool_id,
        auto_bookings!inner(customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_type, appointment_date)
      `)
      .eq('shop_id', shopId)
      .eq('auto_bookings.appointment_date', date)
      .order('sent_at', { ascending: false });

    return NextResponse.json({
      date,
      pools: pools || [],
      offers: (offers || []).map(o => ({
        id: o.id,
        bookingId: o.booking_id,
        mode: o.mode,
        status: o.status,
        claimedTime: o.claimed_time,
        claimedAt: o.claimed_at,
        rescheduleRequested: o.reschedule_requested,
        sentAt: o.sent_at,
        noticeMinutes: o.notice_minutes,
        poolId: o.pool_id,
        customerName: (o.auto_bookings as unknown as Record<string, unknown>)?.customer_name,
        vehicle: `${(o.auto_bookings as unknown as Record<string, unknown>)?.vehicle_year || ''} ${(o.auto_bookings as unknown as Record<string, unknown>)?.vehicle_make || ''} ${(o.auto_bookings as unknown as Record<string, unknown>)?.vehicle_model || ''}`.trim(),
        appointmentType: (o.auto_bookings as unknown as Record<string, unknown>)?.appointment_type,
      })),
    });
  } catch (err) {
    console.error('Headsup status error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
