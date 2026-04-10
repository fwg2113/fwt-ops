import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/status
// Twilio webhook: child call status (SIP/Client endpoints in Dial)
// Tracks who answered the call
//
// SECURITY: verifies X-Twilio-Signature. Audit C5.
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (verified instanceof NextResponse) return verified;
  const form = verified;
  const callStatus = form.get('CallStatus') as string;
  const parentCallSid = form.get('ParentCallSid') as string;
  const childCallSid = form.get('CallSid') as string;
  const to = form.get('To') as string;
  const duration = form.get('CallDuration') as string;

  if (!parentCallSid) return NextResponse.json({ ok: true });

  if (callStatus === 'in-progress' || callStatus === 'answered') {
    // Determine who answered
    let answeredBy = 'Dashboard';
    if (to && to.startsWith('sip:')) {
      // Look up team member by SIP URI
      const { data: member } = await supabaseAdmin
        .from('call_settings')
        .select('name')
        .eq('sip_uri', to)
        .single();
      if (member) answeredBy = member.name;
    } else if (to && !to.startsWith('client:')) {
      // Look up by phone
      const cleanTo = to.replace(/\D/g, '').slice(-10);
      const { data: member } = await supabaseAdmin
        .from('call_settings')
        .select('name')
        .ilike('phone', `%${cleanTo}%`)
        .single();
      if (member) answeredBy = member.name;
    }

    await supabaseAdmin.from('calls').update({
      answered_by: answeredBy,
      agent_call_sid: childCallSid,
      status: 'in-progress',
    }).eq('call_sid', parentCallSid);
  }

  if (callStatus === 'completed' && duration) {
    // Only update duration if call was answered (don't overwrite missed status)
    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('status')
      .eq('call_sid', parentCallSid)
      .single();

    if (call && call.status === 'in-progress') {
      await supabaseAdmin.from('calls').update({
        status: 'completed',
        duration: parseInt(duration || '0'),
      }).eq('call_sid', parentCallSid);
    }
  }

  return NextResponse.json({ ok: true });
}
