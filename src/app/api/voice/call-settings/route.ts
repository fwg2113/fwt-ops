import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/call-settings -- list all team phone settings
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('call_settings')
    .select('*')
    .eq('shop_id', 1)
    .order('ring_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data || [] });
}

// POST /api/voice/call-settings -- add new team phone
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, phone, sip_uri, enabled, ring_order } = body;

  if (!name || !phone) {
    return NextResponse.json({ error: 'Name and phone required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('call_settings')
    .insert({
      shop_id: 1,
      name,
      phone,
      sip_uri: sip_uri || null,
      enabled: enabled ?? true,
      ring_order: ring_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setting: data });
}

// PATCH /api/voice/call-settings -- update team phone
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('call_settings')
    .update(updates)
    .eq('id', id)
    .eq('shop_id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/voice/call-settings -- remove team phone
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('call_settings')
    .delete()
    .eq('id', id)
    .eq('shop_id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
