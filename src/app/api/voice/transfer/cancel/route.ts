import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { hangupCall, holdParticipant } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/cancel
// Cancel warm transfer: hang up target, unhold caller, reconnect agent
export async function POST(request: NextRequest) {
  try {
    const { callSid } = await request.json();

    if (!callSid) {
      return NextResponse.json({ error: 'callSid is required' }, { status: 400 });
    }

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('conference_sid, call_sid, transfer_target_call_sid, transfer_status')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (error || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!call.conference_sid) {
      return NextResponse.json({ error: 'No active conference for this call' }, { status: 400 });
    }

    // 1. Hang up the transfer target if they're on the line
    if (call.transfer_target_call_sid) {
      try {
        await hangupCall(call.transfer_target_call_sid);
      } catch (e) {
        console.log('Target hangup error (may be expected):', e);
      }
    }

    // 2. Unhold the caller -- reconnect with the agent
    try {
      await holdParticipant(call.conference_sid, call.call_sid, false);
    } catch (e) {
      console.error('Failed to unhold caller:', e);
    }

    // 3. Clear transfer state
    await supabaseAdmin
      .from('calls')
      .update({
        transfer_status: null,
        transfer_target_phone: null,
        transfer_target_name: null,
        transfer_target_call_sid: null,
      })
      .eq('call_sid', callSid);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transfer cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel transfer' }, { status: 500 });
  }
}
