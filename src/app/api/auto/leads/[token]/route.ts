import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/leads/[token]
// Public endpoint — looks up a lead by token for booking page pre-fill
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const { data, error } = await supabaseAdmin
      .from('auto_leads')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Mark as opened if not already
    if (!data.link_opened_at) {
      await supabaseAdmin
        .from('auto_leads')
        .update({ link_opened_at: new Date().toISOString(), status: 'opened' })
        .eq('id', data.id);
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    console.error('Lead lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
