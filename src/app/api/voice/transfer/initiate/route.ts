import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { redirectCall } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/initiate
// Start a warm transfer: redirect agent to conference, caller follows
export async function POST(request: NextRequest) {
  const { callSid, targetPhone, targetName } = await request.json();

  if (!callSid || !targetPhone) {
    return NextResponse.json({ error: 'callSid and targetPhone required' }, { status: 400 });
  }

  // Get the call
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('call_sid', callSid)
    .single();

  if (!call || !call.agent_call_sid) {
    return NextResponse.json({ error: 'Call not found or not in progress' }, { status: 404 });
  }

  // Format target -- could be a phone number or SIP URI
  const formatted = targetPhone.startsWith('sip:') ? targetPhone
    : targetPhone.startsWith('+') ? targetPhone
    : `+1${targetPhone.replace(/\D/g, '')}`;
  const conferenceName = `call-${callSid}`;

  // Set transfer state
  await supabaseAdmin.from('calls').update({
    transfer_status: 'initiating',
    transfer_target_phone: formatted,
    transfer_target_name: targetName || null,
    conference_name: conferenceName,
  }).eq('id', call.id);

  // Redirect agent's call leg to conference
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
  const confJoinUrl = `${origin}/api/voice/conference/join?conf=${encodeURIComponent(conferenceName)}&role=agent&callSid=${callSid}`;

  try {
    await redirectCall(call.agent_call_sid, confJoinUrl);
    return NextResponse.json({ success: true, conferenceName });
  } catch (error) {
    console.error('Transfer initiate error:', error);
    // Clean up
    await supabaseAdmin.from('calls').update({
      transfer_status: null,
      transfer_target_phone: null,
      transfer_target_name: null,
      conference_name: null,
    }).eq('id', call.id);
    return NextResponse.json({ error: 'Failed to initiate transfer' }, { status: 500 });
  }
}
