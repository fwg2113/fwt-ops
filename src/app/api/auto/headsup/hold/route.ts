import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/headsup/hold
// Public endpoint -- soft-lock a slot for 90 seconds (like Ticketmaster seat selection)
export async function POST(request: NextRequest) {
  try {
    const { token, time } = await request.json();
    if (!token || !time) {
      return NextResponse.json({ error: 'Missing token or time' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('hold_headsup_slot', {
      p_token: token,
      p_time: time,
    });

    if (error) {
      console.error('Headsup hold RPC error:', error);
      return NextResponse.json({ error: 'Failed to hold slot' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Headsup hold error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
