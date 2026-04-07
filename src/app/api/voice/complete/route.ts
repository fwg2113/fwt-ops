import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/voice/complete
// Twilio webhook: Dial action -- called when Dial ends (no answer, hangup, or transfer)
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const dialCallStatus = form.get('DialCallStatus') as string;
  const dialCallDuration = form.get('DialCallDuration') as string;
  const callSid = form.get('CallSid') as string;

  const url = new URL(request.url);
  const paramCallSid = url.searchParams.get('callSid') || callSid;
  const category = url.searchParams.get('category') || '';

  // Check if this is part of a warm transfer
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('id, transfer_status, conference_name')
    .eq('call_sid', paramCallSid)
    .single();

  // If transfer is initiating, put caller into the conference
  if (call?.transfer_status === 'initiating' && call.conference_name) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com';
    const confJoinUrl = `${origin}/api/voice/conference/join?conf=${encodeURIComponent(call.conference_name)}&role=caller&callSid=${paramCallSid}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${confJoinUrl}</Redirect>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Normal flow: check if call was answered
  if (dialCallStatus === 'answered' || dialCallStatus === 'completed') {
    const dur = parseInt(dialCallDuration || '0');
    if (dur > 0 && call) {
      await supabaseAdmin.from('calls').update({
        status: 'completed',
        duration: dur,
      }).eq('id', call.id);
    }
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }

  // No answer -- send to voicemail
  const from = form.get('From') as string || '';

  // Look up customer name
  const cleanPhone = from.replace(/\D/g, '').slice(-10);
  let customerName = '';
  if (cleanPhone) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('first_name, last_name')
      .or(`phone.ilike.%${cleanPhone}%`)
      .eq('shop_id', 1)
      .single();
    if (customer) customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  }

  if (call) {
    await supabaseAdmin.from('calls').update({
      status: 'missed',
      customer_name: customerName || null,
    }).eq('id', call.id);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com';
  const vmUrl = `${origin}/api/voice/voicemail?callSid=${paramCallSid}&from=${encodeURIComponent(from)}&customerName=${encodeURIComponent(customerName)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry we missed your call. Please leave a message after the beep and we will get back to you as soon as possible.</Say>
  <Record maxLength="120" transcribe="true" action="${vmUrl}" method="POST" />
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
