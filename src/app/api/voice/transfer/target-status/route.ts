import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { holdParticipant } from '@/app/lib/twilio-voice';

// POST /api/voice/transfer/target-status
// Twilio webhook: transfer target call status (did they answer?)
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const callStatus = form.get('CallStatus') as string;

  const url = new URL(request.url);
  const parentCallSid = url.searchParams.get('callSid') || '';

  if (!parentCallSid) return NextResponse.json({ ok: true });

  // Target didn't answer
  if (['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus)) {
    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('call_sid', parentCallSid)
      .single();

    if (call && call.conference_sid) {
      // Unhold caller
      try { await holdParticipant(call.conference_sid, call.call_sid, false); } catch {}
    }

    // Clear transfer state
    if (call) {
      await supabaseAdmin.from('calls').update({
        transfer_status: null,
        transfer_target_phone: null,
        transfer_target_name: null,
        transfer_target_call_sid: null,
      }).eq('id', call.id);
    }
  }

  return NextResponse.json({ ok: true });
}
