import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// Helper: is a team member available right now per their schedule + shop tz?
// Mirrors the implementation in /api/voice/menu/route.ts.
function isAvailableNow(
  schedule: Record<string, { start: string; end: string } | null> | null,
  timezone: string,
): boolean {
  if (!schedule) return true; // null = always available
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAYS[now.getDay()];
  const day = schedule[dayKey];
  if (!day) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = day.start.split(':').map(Number);
  const [eh, em] = day.end.split(':').map(Number);
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

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
  // ring the dashboard browser client + all enabled SIP endpoints directly,
  // mirroring what the menu route does after a digit is pressed (minus the
  // category-specific greeting). Used for Google Voice / third-party
  // verification calls that can't press keys.
  const { data: cfg } = await supabaseAdmin
    .from('shop_config')
    .select('voice_menu_enabled, shop_timezone')
    .eq('id', 1)
    .single();

  if (cfg?.voice_menu_enabled === false) {
    // Fetch enabled team members (same query the menu route uses)
    const { data: allMembers } = await supabaseAdmin
      .from('call_settings')
      .select('*')
      .eq('shop_id', 1)
      .eq('enabled', true)
      .order('ring_order', { ascending: true });

    // Filter by schedule availability so off-hours members don't ring
    const timezone = cfg.shop_timezone || 'America/New_York';
    const teamMembers = (allMembers || []).filter((m: { schedule: Record<string, { start: string; end: string } | null> | null }) =>
      isAvailableNow(m.schedule, timezone)
    );

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
    const statusUrl = `${origin}/api/voice/status`;
    const completeUrl = `${origin}/api/voice/complete?callSid=${callSid}&amp;category=bypass`;
    const dialCallerId = from || to || '';

    // Build <Sip> endpoints for every available team member with a sip_uri
    const sipEndpoints = teamMembers
      .filter((m: { sip_uri: string | null }) => m.sip_uri)
      .map((m: { sip_uri: string }) =>
        `<Sip statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${m.sip_uri}</Sip>`
      )
      .join('\n        ');

    const bypassTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${dialCallerId}" timeout="40" action="${completeUrl}" method="POST">
    <Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">
      <Identity>fwt-dashboard</Identity>
      <Parameter name="categoryKey" value="bypass" />
      <Parameter name="categoryLabel" value="Direct (menu off)" />
    </Client>
    ${sipEndpoints}
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
