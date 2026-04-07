import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/team-members
// Returns enabled team members for transfer selection
export async function GET() {
  const { data } = await supabaseAdmin
    .from('call_settings')
    .select('id, name, phone, enabled')
    .eq('shop_id', 1)
    .eq('enabled', true)
    .order('ring_order', { ascending: true });

  return NextResponse.json({ members: data || [] });
}
