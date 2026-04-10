import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/incoming
// Twilio webhook: incoming call entry point. Plays IVR greeting + menu.
//
// SECURITY: verifies X-Twilio-Signature. Audit C5.
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (verified instanceof NextResponse) return verified;
  const form = verified;
  const callSid = form.get('CallSid') as string;
  const from = form.get('From') as string;
  const to = form.get('To') as string;
  const callerCity = form.get('CallerCity') as string;
  const callerState = form.get('CallerState') as string;

  // Check retry count
  const url = new URL(request.url);
  const retry = parseInt(url.searchParams.get('retry') || '0');

  if (retry === 0) {
    // First attempt -- insert call record
    await supabaseAdmin.from('calls').insert({
      shop_id: 1,
      call_sid: callSid,
      direction: 'inbound',
      caller_phone: from,
      receiver_phone: to,
      status: 'ringing',
      read: false,
      caller_city: callerCity || null,
      caller_state: callerState || null,
    });
  }

  // Max retries
  if (retry >= 3) {
    await supabaseAdmin.from('calls').update({ status: 'missed' }).eq('call_sid', callSid);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, we missed your call. Please try again later or leave a message after the beep.</Say><Record maxLength="120" transcribe="true" action="/api/voice/voicemail?callSid=${callSid}&amp;from=${encodeURIComponent(from)}" /></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }

  // PHONE MENU KILL SWITCH
  // When shop_config.voice_menu_enabled is FALSE, skip the IVR entirely and
  // ring the dashboard browser client directly. Used for Google Voice and
  // other third-party verification calls that can't press keys, or any time
  // the owner wants direct ringthrough without the menu.
  const { data: cfg } = await supabaseAdmin
    .from('shop_config')
    .select('voice_menu_enabled')
    .eq('id', 1)
    .single();

  if (cfg?.voice_menu_enabled === false) {
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
    const statusUrl = `${origin}/api/voice/status`;
    const completeUrl = `${origin}/api/voice/complete?callSid=${callSid}&amp;category=bypass`;
    const dialCallerId = from || to || '';
    const bypassTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${dialCallerId}" timeout="40" action="${completeUrl}" method="POST">
    <Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">
      <Identity>fwt-dashboard</Identity>
      <Parameter name="categoryKey" value="bypass" />
      <Parameter name="categoryLabel" value="Direct (menu off)" />
    </Client>
  </Dial>
</Response>`;
    return new NextResponse(bypassTwiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Fetch active greeting
  const { data: greeting } = await supabaseAdmin
    .from('greeting_recordings')
    .select('url')
    .eq('shop_id', 1)
    .eq('is_active', true)
    .eq('greeting_type', 'main')
    .single();

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
  const menuUrl = `${origin}/api/voice/menu?callSid=${callSid}`;
  const retryUrl = `${origin}/api/voice/incoming?retry=${retry + 1}`;

  let twiml: string;
  if (greeting?.url) {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${menuUrl}" method="POST" timeout="7" actionOnEmptyResult="false">
    <Play>${greeting.url}</Play>
  </Gather>
  <Redirect method="POST">${retryUrl}</Redirect>
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${menuUrl}" method="POST" timeout="7" actionOnEmptyResult="false">
    <Say voice="Polly.Joanna">Thank you for calling Frederick Window Tinting.
      For automotive window tint, press 1.
      For residential and commercial window tint, press 2.
      For paint protection film, press 3.
      For wraps and graphics, press 4.
      For custom apparel, press 5.
      For all other inquiries, press 6.</Say>
  </Gather>
  <Redirect method="POST">${retryUrl}</Redirect>
</Response>`;
  }

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
