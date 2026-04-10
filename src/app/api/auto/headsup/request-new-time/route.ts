import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/headsup/request-new-time
// Public endpoint -- customer's slots expired, they want the team to send new ones.
// Resets the offer to expired + clears headsup_notified_at so the team can re-send.
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const { data: offer, error: lookupErr } = await supabaseAdmin
      .from('headsup_offers')
      .select('id, status, booking_id')
      .eq('token', token)
      .single();

    if (lookupErr || !offer) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    }

    // Mark this offer as expired (it's done -- team will create a new one)
    await supabaseAdmin
      .from('headsup_offers')
      .update({ status: 'expired' })
      .eq('id', offer.id);

    // Clear headsup_notified_at on the booking so the team sees them
    // as needing a new notification in the Heads Up modal
    await supabaseAdmin
      .from('auto_bookings')
      .update({
        headsup_notified_at: null,
        headsup_message: null,
      })
      .eq('id', offer.booking_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Headsup request-new-time error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
