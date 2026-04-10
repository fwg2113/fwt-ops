import { NextRequest, NextResponse } from 'next/server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/conference/join
// Returns TwiML to join a named conference (used in warm transfers)
//
// SECURITY: verifies X-Twilio-Signature. Audit C5.
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (verified instanceof NextResponse) return verified;
  const url = new URL(request.url);
  const conf = url.searchParams.get('conf') || 'default';
  const role = url.searchParams.get('role') || 'agent';
  const whisper = url.searchParams.get('whisper') || '';

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
  const eventsUrl = `${origin}/api/voice/conference/events?conf=${encodeURIComponent(conf)}`;

  // Caller has endConferenceOnExit=true (conference ends when they hang up)
  const endOnExit = role === 'caller' ? 'true' : 'false';

  // XML-escape whisper text to prevent malformed TwiML
  const safeWhisper = whisper
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const whisperTwiml = safeWhisper ? `<Say voice="Polly.Joanna">${safeWhisper}</Say>` : '';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${whisperTwiml}
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="${endOnExit}"
      beep="false"
      statusCallback="${eventsUrl}"
      statusCallbackEvent="join leave end"
      statusCallbackMethod="POST">
      ${conf}
    </Conference>
  </Dial>
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
