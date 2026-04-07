import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/voice/complete
// Twilio webhook: Dial action -- called when Dial ends (no answer, hangup, or transfer)
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const callSid = url.searchParams.get('callSid');

    const form = await request.formData();
    const dialCallStatus = form.get('DialCallStatus') as string;
    const dialCallDuration = form.get('DialCallDuration') as string;

    // Check if this call is in transfer mode
    const { data: callRecord } = await supabaseAdmin
      .from('calls')
      .select('transfer_status')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (callRecord?.transfer_status === 'initiating') {
      // Transfer in progress: put the caller into the Conference directly
      // DO NOT use <Redirect> -- must return <Dial><Conference> inline
      const conferenceName = `call-${callSid}`;
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
      const eventsUrl = `${origin}/api/voice/conference/events?conf=${encodeURIComponent(conferenceName)}`;

      await supabaseAdmin
        .from('calls')
        .update({ conference_name: conferenceName })
        .eq('call_sid', callSid);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      beep="false"
      statusCallback="${eventsUrl}"
      statusCallbackEvent="join leave end">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`;

      return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    const duration = parseInt(dialCallDuration || '0');

    // Only treat as answered if someone actually picked up
    if (dialCallStatus === 'answered' || (dialCallStatus === 'completed' && duration > 0)) {
      await supabaseAdmin
        .from('calls')
        .update({ status: 'completed', duration })
        .eq('call_sid', callSid);

      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // No answer -- go to voicemail
    await supabaseAdmin
      .from('calls')
      .update({ status: 'missed' })
      .eq('call_sid', callSid);

    const from = form.get('From') as string || '';
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
    const vmUrl = `${origin}/api/voice/voicemail?callSid=${callSid}&amp;from=${encodeURIComponent(from)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">No one is available. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="${vmUrl}" />
</Response>`;

    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } catch (error) {
    console.error('Complete webhook error:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
}
