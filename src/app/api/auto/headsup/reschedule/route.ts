import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/headsup/reschedule
// Public endpoint -- customer requests to reschedule
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

    if (offer.status !== 'pending') {
      return NextResponse.json({ error: 'Cannot reschedule -- already ' + offer.status }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('headsup_offers')
      .update({
        status: 'reschedule_requested',
        reschedule_requested: true,
        reschedule_requested_at: new Date().toISOString(),
      })
      .eq('id', offer.id);

    if (updateErr) {
      console.error('Headsup reschedule error:', updateErr);
      return NextResponse.json({ error: 'Failed to submit reschedule request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Headsup reschedule error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
