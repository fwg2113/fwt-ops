import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/greeting?type=main
// Get active greeting URL for a greeting type
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'main';

  const { data } = await supabaseAdmin
    .from('greeting_recordings')
    .select('url, name, id')
    .eq('shop_id', 1)
    .eq('is_active', true)
    .eq('greeting_type', type)
    .single();

  return NextResponse.json({ greeting: data || null });
}

// POST /api/voice/greeting
// Save greeting metadata (after presigned upload or direct URL)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url, r2Key, name, greeting_type } = body;

  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  const type = greeting_type || 'main';

  // Deactivate existing active greeting of same type
  await supabaseAdmin
    .from('greeting_recordings')
    .update({ is_active: false })
    .eq('shop_id', 1)
    .eq('greeting_type', type)
    .eq('is_active', true);

  // Insert new recording
  const { data, error } = await supabaseAdmin
    .from('greeting_recordings')
    .insert({
      shop_id: 1,
      name: name || 'Greeting',
      url,
      r2_key: r2Key || null,
      is_active: true,
      greeting_type: type,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url, recording: data });
}

// DELETE /api/voice/greeting?type=main
// Deactivate greeting for a type
export async function DELETE(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'main';

  await supabaseAdmin
    .from('greeting_recordings')
    .update({ is_active: false })
    .eq('shop_id', 1)
    .eq('greeting_type', type)
    .eq('is_active', true);

  return NextResponse.json({ success: true });
}
