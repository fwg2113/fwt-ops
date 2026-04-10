import { NextRequest, NextResponse } from 'next/server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/outbound
// TwiML App Voice URL: handles outbound calls from browser/SIP
//
// SECURITY: verifies X-Twilio-Signature. Without it, anyone can POST `To=+234...`
// and trigger international toll fraud calls billed to your account. Audit C4/C5.
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (verified instanceof NextResponse) return verified;
  const form = verified;
  const to = form.get('To') as string;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';

  // If "To" is a phone number, dial it
  if (to && (to.startsWith('+') || to.match(/^\d{10,}/))) {
    const formatted = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioNumber}">
    <Number>${formatted}</Number>
  </Dial>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // If "To" is a SIP URI
  if (to && to.startsWith('sip:')) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioNumber}">
    <Sip>${to}</Sip>
  </Dial>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination specified.</Say></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  );
}
