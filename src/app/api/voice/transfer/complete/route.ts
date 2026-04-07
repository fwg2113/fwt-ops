import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { holdParticipant, removeParticipant, setEndConferenceOnExit } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/complete
// Complete warm transfer: unhold caller, remove agent, let target stay
export async function POST(request: NextRequest) {
  const { callSid } = await request.json();

  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('call_sid', callSid)
    .single();

  if (!call || !call.conference_sid) {
    return NextResponse.json({ error: 'Call not in conference' }, { status: 400 });
  }

  if (!['connecting', 'briefing'].includes(call.transfer_status || '')) {
    return NextResponse.json({ error: 'Transfer not in progress' }, { status: 400 });
  }

  try {
    // Unhold caller
    await holdParticipant(call.conference_sid, call.call_sid, false);

    // Set target to end conference on exit
    if (call.transfer_target_call_sid) {
      await setEndConferenceOnExit(call.conference_sid, call.transfer_target_call_sid, true);
    }

    // Remove agent from conference
    if (call.agent_call_sid) {
      await removeParticipant(call.conference_sid, call.agent_call_sid);
    }

    await supabaseAdmin.from('calls').update({
      transfer_status: 'completed',
      answered_by: call.transfer_target_name || 'Transferred',
    }).eq('id', call.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transfer complete error:', error);
    return NextResponse.json({ error: 'Failed to complete transfer' }, { status: 500 });
  }
}
