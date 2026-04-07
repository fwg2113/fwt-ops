import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// IVR menu categories
const CATEGORY_MAP: Record<string, { key: string; label: string }> = {
  '1': { key: 'auto-tint', label: 'Automotive Window Tint' },
  '2': { key: 'flat-glass', label: 'Residential & Commercial' },
  '3': { key: 'ppf', label: 'Paint Protection Film' },
  '4': { key: 'wraps-graphics', label: 'Wraps & Graphics' },
  '5': { key: 'apparel', label: 'Custom Apparel' },
  '6': { key: 'general', label: 'General Inquiry' },
};

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

  // Fetch enabled team members ordered by ring_order
  const { data: teamMembers } = await supabaseAdmin
    .from('call_settings')
    .select('*')
    .eq('shop_id', 1)
    .eq('enabled', true)
    .order('ring_order', { ascending: true });

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

  // Browser client (dashboard)
  const clientIdentity = 'ops-dashboard';
  const clientParams = `<Parameter name="categoryKey" value="${category.key}" /><Parameter name="categoryLabel" value="${category.label}" />`;

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
  <Dial callerId="${dialCallerId}" timeout="40" answerOnBridge="true" action="${completeUrl}" method="POST">
    <Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">
      <Identity>${clientIdentity}</Identity>
      ${clientParams}
    </Client>
    ${sipEndpoints}
  </Dial>
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
