import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/greeting/recordings -- list all recordings
export async function GET() {
  const { data } = await supabaseAdmin
    .from('greeting_recordings')
    .select('*')
    .eq('shop_id', 1)
    .order('created_at', { ascending: false });

  return NextResponse.json({ recordings: data || [] });
}

// PUT /api/voice/greeting/recordings -- activate or rename
export async function PUT(request: NextRequest) {
  const { id, is_active, name } = await request.json();

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  if (is_active) {
    // Get the recording to find its greeting_type
    const { data: rec } = await supabaseAdmin
      .from('greeting_recordings')
      .select('greeting_type')
      .eq('id', id)
      .single();

    if (rec) {
      // Deactivate others of same type
      await supabaseAdmin
        .from('greeting_recordings')
        .update({ is_active: false })
        .eq('shop_id', 1)
        .eq('greeting_type', rec.greeting_type)
        .eq('is_active', true);
    }
  }

  const updates: Record<string, unknown> = {};
  if (is_active !== undefined) updates.is_active = is_active;
  if (name !== undefined) updates.name = name;

  await supabaseAdmin
    .from('greeting_recordings')
    .update(updates)
    .eq('id', id);

  return NextResponse.json({ success: true });
}

// DELETE /api/voice/greeting/recordings?id=xxx -- delete recording
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  // TODO: delete R2 file if r2_key exists
  await supabaseAdmin
    .from('greeting_recordings')
    .delete()
    .eq('id', id)
    .eq('shop_id', 1);

  return NextResponse.json({ success: true });
}
