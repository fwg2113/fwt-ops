import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { hangupCall, holdParticipant } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/cancel
// Cancel warm transfer: hang up target, unhold caller, reconnect agent
export async function POST(request: NextRequest) {
  const { callSid } = await request.json();

  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('call_sid', callSid)
    .single();

  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  try {
    // Hang up transfer target
    if (call.transfer_target_call_sid) {
      try { await hangupCall(call.transfer_target_call_sid); } catch {}
    }

    // Unhold caller
    if (call.conference_sid && call.call_sid) {
      try { await holdParticipant(call.conference_sid, call.call_sid, false); } catch {}
    }

    // Clear transfer state
    await supabaseAdmin.from('calls').update({
      transfer_status: null,
      transfer_target_phone: null,
      transfer_target_name: null,
      transfer_target_call_sid: null,
    }).eq('id', call.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transfer cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel transfer' }, { status: 500 });
  }
}
