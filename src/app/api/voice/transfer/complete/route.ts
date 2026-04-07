import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { holdParticipant, removeParticipant, setEndConferenceOnExit } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/complete
// Complete warm transfer: unhold caller, remove agent, let target stay
export async function POST(request: NextRequest) {
  try {
    const { callSid } = await request.json();

    if (!callSid) {
      return NextResponse.json({ error: 'callSid is required' }, { status: 400 });
    }

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('conference_sid, agent_call_sid, call_sid, transfer_status, transfer_target_name, transfer_target_call_sid')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (error || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!call.conference_sid) {
      return NextResponse.json({ error: 'No active conference for this call' }, { status: 400 });
    }

    if (!['connecting', 'briefing'].includes(call.transfer_status || '')) {
      return NextResponse.json({ error: `Cannot complete transfer in state: ${call.transfer_status}` }, { status: 400 });
    }

    // 1. Unhold the caller -- they can now hear the transfer target
    await holdParticipant(call.conference_sid, call.call_sid, false);

    // 2. Remove the agent from the conference (agent is done)
    if (call.agent_call_sid) {
      try {
        await removeParticipant(call.conference_sid, call.agent_call_sid);
      } catch (e) {
        // Agent may have already hung up
        console.log('Agent may have already left:', e);
      }
    }

    // 3. Let the transfer target end the conference when they hang up
    if (call.transfer_target_call_sid) {
      try {
        await setEndConferenceOnExit(call.conference_sid, call.transfer_target_call_sid, true);
      } catch (e) {
        console.log('Could not set endConferenceOnExit on target:', e);
      }
    }

    // 4. Update the call record
    await supabaseAdmin
      .from('calls')
      .update({
        transfer_status: 'completed',
        answered_by: call.transfer_target_name || 'Transferred',
      })
      .eq('call_sid', callSid);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transfer complete error:', error);
    return NextResponse.json({ error: 'Failed to complete transfer' }, { status: 500 });
  }
}
