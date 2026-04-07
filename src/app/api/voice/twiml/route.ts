import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/voice/twiml
// TwiML App Voice URL: handles outbound calls from browser client.
// When the dashboard PhoneWidget initiates a call via Twilio Device.connect(),
// Twilio hits this URL to get TwiML for how to handle the call.
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const to = params.get('To');
    const callSid = params.get('CallSid');
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!to) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>No number specified.</Say></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    if (!twilioNumber) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Phone system is not configured.</Say></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Log outbound call
    supabaseAdmin.from('calls').insert({
      shop_id: 1,
      direction: 'outbound',
      caller_phone: twilioNumber,
      receiver_phone: to,
      status: 'initiated',
      call_sid: callSid || null,
      read: true,
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioNumber}" answerOnBridge="true">
    <Number>${to}</Number>
  </Dial>
</Response>`;

    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } catch (error) {
    console.error('TwiML generation error:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
}

export async function GET() {
  return new NextResponse('TwiML endpoint active', { status: 200 });
}
