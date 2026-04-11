import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/headsup/slots?token=xxx
// Public endpoint -- token is the auth. Customer fetches available slots.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    // Look up offer
    const { data: offer, error: offerErr } = await supabaseAdmin
      .from('headsup_offers')
      .select('*, headsup_pools(*)')
      .eq('token', token)
      .single();

    if (offerErr || !offer) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Look up booking + shop
    const { data: booking } = await supabaseAdmin
      .from('auto_bookings')
      .select('customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_type')
      .eq('id', offer.booking_id)
      .single();

    const { data: shop } = await supabaseAdmin
      .from('shop_config')
      .select('shop_name, shop_phone, shop_address, shop_timezone, directions_link')
      .eq('id', 1)
      .single();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const shopTz = shop?.shop_timezone || 'America/New_York';
    // Get current time in the shop's timezone for slot expiry comparison
    const nowInShopTz = new Date(new Date().toLocaleString('en-US', { timeZone: shopTz }));
    const nowMinutes = nowInShopTz.getHours() * 60 + nowInShopTz.getMinutes();

    const aptDate = booking.appointment_date;
    const noticeMin = offer.notice_minutes || 30;
    const firstName = (booking.customer_name || '').split(' ')[0];

    // Check if appointment date is today (in shop timezone)
    const todayInShopTz = new Date().toLocaleDateString('en-CA', { timeZone: shopTz }); // YYYY-MM-DD
    const isToday = aptDate === todayInShopTz;

    function isSlotPast(time: string): boolean {
      if (!isToday) return false; // future date slots never expired
      const [h, m] = time.split(':').map(Number);
      return nowMinutes > h * 60 + m;
    }

    const HOLD_TTL_MS = 90 * 1000; // 90 seconds
    const nowMs = Date.now();

    // Build slot list
    let slots: { time: string; display: string; status: string; holdSecondsLeft?: number }[] = [];

    if (offer.mode === 'pool' && offer.headsup_pools) {
      const poolSlots = offer.headsup_pools.slots || [];
      slots = poolSlots.map((s: { time: string; claimed_by: string | null; held_by?: string | null; held_at?: string | null }) => {
        let status = 'available';
        let holdSecondsLeft: number | undefined;
        if (s.claimed_by && s.claimed_by !== 'null') {
          status = s.claimed_by === offer.booking_id ? 'yours' : 'taken';
        } else if (isSlotPast(s.time)) {
          status = 'expired';
        } else if (s.held_by && s.held_by !== 'null') {
          const heldAt = s.held_at ? new Date(s.held_at).getTime() : 0;
          const remaining = HOLD_TTL_MS - (nowMs - heldAt);
          if (remaining > 0) {
            status = s.held_by === offer.booking_id ? 'your_hold' : 'held';
            holdSecondsLeft = Math.ceil(remaining / 1000);
          }
        }
        return {
          time: s.time,
          display: formatTimeDisplay(s.time),
          status,
          holdSecondsLeft,
        };
      });
    } else {
      const offeredSlots = offer.offered_slots || [];
      slots = offeredSlots.map((s: { time: string; status: string; held?: string; held_at?: string | null }) => {
        let status = s.status;
        let holdSecondsLeft: number | undefined;
        if (status === 'available' && isSlotPast(s.time)) {
          status = 'expired';
        } else if (status === 'available' && s.held === 'true') {
          const heldAt = s.held_at ? new Date(s.held_at).getTime() : 0;
          const remaining = HOLD_TTL_MS - (nowMs - heldAt);
          if (remaining > 0) {
            status = 'your_hold';
            holdSecondsLeft = Math.ceil(remaining / 1000);
          }
        }
        return {
          time: s.time,
          display: formatTimeDisplay(s.time),
          status,
          holdSecondsLeft,
        };
      });
    }

    return NextResponse.json({
      shopName: shop?.shop_name || '',
      shopPhone: shop?.shop_phone || '',
      customerFirstName: firstName,
      vehicle: booking.vehicle_year
        ? `${booking.vehicle_year} ${booking.vehicle_make} ${booking.vehicle_model}`
        : null,
      appointmentDate: aptDate,
      appointmentDateDisplay: new Date(aptDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      }),
      noticeMinutes: noticeMin,
      offerStatus: offer.status,
      claimedTime: offer.claimed_time ? formatTimeDisplay(offer.claimed_time) : null,
      directionsLink: shop?.directions_link || null,
      slots,
    });
  } catch (err) {
    console.error('Headsup slots error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}
