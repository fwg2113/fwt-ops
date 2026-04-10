import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

/**
 * Handle outbound calls from SIP softphone app (Oiga/Linphone).
 * When someone dials a number from their SIP app, Twilio sends a webhook here.
 * We return TwiML to connect the call using the business number as caller ID.
 *
 * NOTE: answerOnBridge is intentionally NOT used for SIP outbound calls.
 * With answerOnBridge="true", Twilio delays the 200 OK until the callee answers,
 * which causes the SIP client's NAT mapping to expire. The ACK never arrives
 * back at Twilio, triggering Error 32022 and dropping the call after ~32 seconds.
 *
 * SECURITY: Verifies X-Twilio-Signature on every request. Without this,
 * any attacker can POST `To=sip:+234...@...` and trigger international toll
 * fraud calls billed to your Twilio account. Audit C4.
 */
export async function POST(request: NextRequest) {
  try {
    const verified = await verifyTwilioRequest(request);
    if (verified instanceof NextResponse) return verified;
    const formData = verified;
    const callSid = formData.get('CallSid') as string;
    const to = formData.get('To') as string; // e.g. sip:+15551234567@fwt.sip.twilio.com

    // Extract phone number from SIP URI
    let dialNumber = to;
    const sipMatch = to.match(/^sip:([^@]+)@/);
    if (sipMatch) dialNumber = sipMatch[1];

    // Normalize to E.164
    dialNumber = dialNumber.replace(/[^+\d]/g, '');
    if (!dialNumber.startsWith('+')) {
      if (dialNumber.startsWith('1') && dialNumber.length === 11) dialNumber = '+' + dialNumber;
      else if (dialNumber.length === 10) dialNumber = '+1' + dialNumber;
      else dialNumber = '+' + dialNumber;
    }

    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';

    // Log outbound call
    await supabaseAdmin.from('calls').insert({
      shop_id: 1,
      direction: 'outbound',
      caller_phone: twilioNumber,
      receiver_phone: dialNumber,
      status: 'initiated',
      call_sid: callSid,
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioNumber}">
    <Number>${dialNumber}</Number>
  </Dial>
</Response>`;

    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } catch (error) {
    console.error('SIP outbound error:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
}

export async function GET() {
  return new NextResponse('SIP outbound webhook active', { status: 200 });
}
