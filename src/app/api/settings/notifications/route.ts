import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

const SETTINGS_KEY = 'notification_settings';

const DEFAULT_SETTINGS = {
  sound_enabled: true,
  sound_key: 'chime',
  message_sound_key: 'chime',
  email_sound_key: 'bell',
  payment_sound_key: 'cascade',
  call_sound_key: 'doorbell',
  start_hour: 9,
  end_hour: 17,
  message_repeat_interval: 60,
  email_repeat_interval: 60,
  email_alerts_enabled: true,
  email_alert_address: '',
};

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return NextResponse.json({ ...DEFAULT_SETTINGS, ...parsed });
    }
    return NextResponse.json(DEFAULT_SETTINGS);
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const settings = {
      sound_enabled: body.sound_enabled ?? DEFAULT_SETTINGS.sound_enabled,
      sound_key: body.sound_key ?? DEFAULT_SETTINGS.sound_key,
      message_sound_key: body.message_sound_key ?? DEFAULT_SETTINGS.message_sound_key,
      email_sound_key: body.email_sound_key ?? DEFAULT_SETTINGS.email_sound_key,
      payment_sound_key: body.payment_sound_key ?? DEFAULT_SETTINGS.payment_sound_key,
      call_sound_key: body.call_sound_key ?? DEFAULT_SETTINGS.call_sound_key,
      start_hour: body.start_hour ?? DEFAULT_SETTINGS.start_hour,
      end_hour: body.end_hour ?? DEFAULT_SETTINGS.end_hour,
      message_repeat_interval: body.message_repeat_interval ?? DEFAULT_SETTINGS.message_repeat_interval,
      email_repeat_interval: body.email_repeat_interval ?? DEFAULT_SETTINGS.email_repeat_interval,
      email_alerts_enabled: body.email_alerts_enabled ?? DEFAULT_SETTINGS.email_alerts_enabled,
      email_alert_address: body.email_alert_address ?? DEFAULT_SETTINGS.email_alert_address,
    };

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(settings) }, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
