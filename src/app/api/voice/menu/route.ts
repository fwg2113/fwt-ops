import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// IVR menu categories
const CATEGORY_MAP: Record<string, { key: string; label: string }> = {
  '1': { key: 'auto-tint', label: 'Automotive Window Tint' },
  '2': { key: 'flat-glass', label: 'Residential and Commercial' },
  '3': { key: 'ppf', label: 'Paint Protection Film' },
  '4': { key: 'wraps-graphics', label: 'Wraps and Graphics' },
  '5': { key: 'apparel', label: 'Custom Apparel' },
  '6': { key: 'general', label: 'General Inquiry' },
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Check if a team member is available right now based on their schedule + shop timezone
function isAvailableNow(schedule: Record<string, { start: string; end: string } | null> | null, timezone: string): boolean {
  // No schedule = always available (backwards compatible)
  if (!schedule) return true;

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_KEYS[now.getDay()];
  const daySchedule = schedule[dayKey];

  // null for this day = off
  if (!daySchedule) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = daySchedule.start.split(':').map(Number);
  const [endH, endM] = daySchedule.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// POST /api/voice/menu
// Twilio webhook: handles digit selection from IVR menu
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const digits = form.get('Digits') as string;
  const url = new URL(request.url);
  const callSid = url.searchParams.get('callSid') || (form.get('CallSid') as string);

  const category = CATEGORY_MAP[digits] || CATEGORY_MAP['6']; // default to general

  // Update call record with category
  if (callSid) {
    await supabaseAdmin.from('calls').update({ category: category.key }).eq('call_sid', callSid);
  }

  // Fetch shop timezone
  const { data: shopConfig } = await supabaseAdmin
    .from('shop_config')
    .select('shop_timezone')
    .eq('id', 1)
    .single();
  const timezone = shopConfig?.shop_timezone || 'America/New_York';

  // Fetch enabled team members ordered by ring_order
  const { data: allMembers } = await supabaseAdmin
    .from('call_settings')
    .select('*')
    .eq('shop_id', 1)
    .eq('enabled', true)
    .order('ring_order', { ascending: true });

  // Filter by schedule availability
  const teamMembers = (allMembers || []).filter(m => isAvailableNow(m.schedule, timezone));

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
  const statusUrl = `${origin}/api/voice/status`;
  const completeUrl = `${origin}/api/voice/complete?callSid=${callSid}&amp;category=${category.key}`;

  // Check for category-specific greeting
  const { data: catGreeting } = await supabaseAdmin
    .from('greeting_recordings')
    .select('url')
    .eq('shop_id', 1)
    .eq('is_active', true)
    .eq('greeting_type', category.key)
    .single();

  // Build dial targets
  const sipEndpoints = (teamMembers || [])
    .filter(m => m.sip_uri)
    .map(m => `<Sip statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${m.sip_uri}</Sip>`)
    .join('\n        ');

  // XML-safe escape for TwiML attributes
  const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Browser client (dashboard)
  const clientIdentity = 'fwt-dashboard';
  const clientParams = `<Parameter name="categoryKey" value="${xmlEsc(category.key)}" /><Parameter name="categoryLabel" value="${xmlEsc(category.label)}" />`;

  const greetingTwiml = catGreeting?.url
    ? `<Play>${catGreeting.url}</Play>`
    : '';

  // Use caller's number as callerId so SIP phones show who's calling
  const from = form.get('From') as string || '';
  const to = form.get('To') as string || '';
  const dialCallerId = from || to;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}
  <Dial callerId="${dialCallerId}" timeout="40" action="${completeUrl}" method="POST">
    <Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">
      <Identity>${clientIdentity}</Identity>
      ${clientParams}
    </Client>
    ${sipEndpoints}
  </Dial>
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
