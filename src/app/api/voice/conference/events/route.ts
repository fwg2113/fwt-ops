import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createCall, holdParticipant, hangupCall } from '@/app/lib/twilio-voice';
import { sendSms } from '@/app/lib/messaging';

// POST /api/voice/conference/events
// Twilio webhook: conference participant join/leave/end events
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const event = form.get('StatusCallbackEvent') as string;
  const conferenceSid = form.get('ConferenceSid') as string;
  const callSid = form.get('CallSid') as string;

  const url = new URL(request.url);
  const confName = url.searchParams.get('conf') || '';

  // Find the call record by conference name
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('conference_name', confName)
    .single();

  if (!call) return NextResponse.json({ ok: true });

  // Update conference SID
  if (!call.conference_sid && conferenceSid) {
    await supabaseAdmin.from('calls').update({ conference_sid: conferenceSid }).eq('id', call.id);
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';

  if (event === 'participant-join') {
    // When caller joins conference and transfer is initiating:
    // 1. Hold the caller
    // 2. Call the transfer target
    if (call.transfer_status === 'initiating' && callSid === call.call_sid) {
      // This is the caller joining -- hold them
      try {
        await holdParticipant(conferenceSid, callSid, true);
      } catch (e) { console.error('Hold caller error:', e); }

      // Call the transfer target
      if (call.transfer_target_phone) {
        try {
          const confJoinUrl = `${origin}/api/voice/conference/join?conf=${encodeURIComponent(confName)}&role=target&whisper=${encodeURIComponent('Warm transfer. Please hold.')}`;
          const targetStatusUrl = `${origin}/api/voice/transfer/target-status?callSid=${call.call_sid}`;

          // Look up SIP URI for the transfer target
          const { data: targetSettings } = await supabaseAdmin
            .from('call_settings')
            .select('sip_uri, phone, name')
            .or(`phone.eq.${call.transfer_target_phone},sip_uri.eq.${call.transfer_target_phone}`)
            .eq('enabled', true)
            .maybeSingle();

          // Use SIP URI if available, otherwise use phone number
          const targetTo = targetSettings?.sip_uri || call.transfer_target_phone;
          // For SIP calls, show customer's caller ID; for phone calls, show business number
          const targetFrom = targetSettings?.sip_uri ? (call.caller_phone || twilioNumber) : twilioNumber;

          // Send SMS to transfer target so they know it's a transfer BEFORE they answer
          const targetName = call.transfer_target_name || targetSettings?.name || '';
          const callerDisplay = call.caller_phone || 'Unknown';
          const answeredByName = call.answered_by || 'Team';
          if (targetSettings?.sip_uri) {
            // Find the target's actual phone for SMS (look up from team members)
            // SIP users might have a separate phone -- for now send to the Twilio number notification
            // Actually send to the transfer_target_phone if it's a real phone, or skip if SIP-only
          }
          // Send SMS notification via Twilio to a known phone if we have one
          // For now, the whisper message after answer will inform them
          // TODO: add real phone numbers to call_settings for SMS notifications

          const result = await createCall({
            to: targetTo,
            from: targetFrom,
            url: confJoinUrl,
            statusCallback: targetStatusUrl,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          });

          await supabaseAdmin.from('calls').update({
            transfer_status: 'connecting',
            transfer_target_call_sid: result.sid,
          }).eq('id', call.id);
        } catch (e) {
          console.error('Call transfer target error:', e);
          // Failed to call target -- unhold caller
          try { await holdParticipant(conferenceSid, callSid, false); } catch {}
          await supabaseAdmin.from('calls').update({
            transfer_status: null,
            transfer_target_phone: null,
            transfer_target_name: null,
          }).eq('id', call.id);
        }
      }
    }

    // Third participant joined (the transfer target)
    if (call.transfer_status === 'connecting' && callSid !== call.call_sid && callSid !== call.agent_call_sid) {
      await supabaseAdmin.from('calls').update({
        transfer_status: 'briefing',
      }).eq('id', call.id);
    }
  }

  if (event === 'participant-leave') {
    // If agent leaves during transfer, clean up
    if (callSid === call.agent_call_sid && call.transfer_status && call.transfer_status !== 'completed') {
      // Agent left before transfer completed -- cancel transfer
      if (call.transfer_target_call_sid) {
        try { await hangupCall(call.transfer_target_call_sid); } catch {}
      }
      // Unhold caller
      if (call.call_sid && conferenceSid) {
        try { await holdParticipant(conferenceSid, call.call_sid, false); } catch {}
      }
      await supabaseAdmin.from('calls').update({
        transfer_status: null,
        transfer_target_phone: null,
        transfer_target_name: null,
        transfer_target_call_sid: null,
      }).eq('id', call.id);
    }
  }

  if (event === 'conference-end') {
    await supabaseAdmin.from('calls').update({
      transfer_status: null,
      conference_sid: null,
    }).eq('id', call.id);
  }

  return NextResponse.json({ ok: true });
}
