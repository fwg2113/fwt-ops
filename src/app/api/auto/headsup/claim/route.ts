import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/headsup/claim
// Public endpoint -- atomic slot claim via Postgres function
export async function POST(request: NextRequest) {
  try {
    const { token, time } = await request.json();
    if (!token || !time) {
      return NextResponse.json({ error: 'Missing token or time' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('claim_headsup_slot', {
      p_token: token,
      p_time: time,
    });

    if (error) {
      console.error('Headsup claim RPC error:', error);
      return NextResponse.json({ error: 'Failed to claim slot' }, { status: 500 });
    }

    // data is the jsonb result from the function
    return NextResponse.json(data);
  } catch (err) {
    console.error('Headsup claim error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
