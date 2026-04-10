import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/call-status
// Twilio webhook: parent call status changes (catches caller hangup during IVR)
//
// SECURITY: verifies X-Twilio-Signature. Audit C5.
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (verified instanceof NextResponse) return verified;
  const form = verified;
  const callSid = form.get('CallSid') as string;
  const callStatus = form.get('CallStatus') as string;
  const duration = form.get('CallDuration') as string;

  if (!callSid) return NextResponse.json({ ok: true });

  // Look up the call
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('id, status')
    .eq('call_sid', callSid)
    .single();

  if (!call) return NextResponse.json({ ok: true });

  // Only update if still in an early state (don't overwrite answered/completed)
  if (call.status === 'ringing' || call.status === 'queued') {
    if (callStatus === 'completed' && parseInt(duration || '0') > 0) {
      await supabaseAdmin.from('calls').update({
        status: 'completed',
        duration: parseInt(duration || '0'),
      }).eq('id', call.id);
    } else if (['completed', 'canceled', 'no-answer', 'busy', 'failed'].includes(callStatus)) {
      await supabaseAdmin.from('calls').update({
        status: 'missed',
        duration: parseInt(duration || '0') || null,
      }).eq('id', call.id);
    }
  }

  return NextResponse.json({ ok: true });
}
