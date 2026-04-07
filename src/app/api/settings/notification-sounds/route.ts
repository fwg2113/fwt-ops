import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

const SETTINGS_KEY = 'custom_notification_sounds';

// GET - list custom sounds
export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const sounds = data?.value
      ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)
      : [];

    return NextResponse.json({ sounds });
  } catch {
    return NextResponse.json({ sounds: [] });
  }
}

// POST - upload a new custom sound (stored as base64 data URL)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const label = (formData.get('label') as string) || file?.name?.replace(/\.[^.]+$/, '') || 'Sound';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'audio/mp4', 'audio/aac'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm|m4a|aac)$/i)) {
      return NextResponse.json({ error: 'Invalid file type. Use MP3, WAV, OGG, M4A, or AAC.' }, { status: 400 });
    }

    if (file.size > 500 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 500KB. Use a short clip (1-5 seconds).' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'audio/mpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const fileId = `sound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data: existing } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const currentSounds = existing?.value
      ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
      : [];

    const newSound = { id: fileId, label, dataUrl, fileName: file.name, size: file.size, uploadedAt: new Date().toISOString() };
    const updatedSounds = [...currentSounds, newSound];

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(updatedSounds) }, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: 'Save failed: ' + error.message }, { status: 500 });
    return NextResponse.json({ success: true, sound: newSound });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE - remove a custom sound
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    const { data: existing } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const currentSounds = existing?.value
      ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
      : [];

    const updatedSounds = currentSounds.filter((s: { id: string }) => s.id !== id);

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(updatedSounds) }, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
