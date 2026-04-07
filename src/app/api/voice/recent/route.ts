import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/recent
// Returns last 10 calls for call history
export async function GET() {
  const { data } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('shop_id', 1)
    .in('status', ['ringing', 'completed', 'missed', 'in-progress', 'voicemail'])
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ calls: data || [] });
}
