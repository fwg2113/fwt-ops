import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createCall, holdParticipant, hangupCall } from '@/app/lib/twilio-voice';
import { sendSms } from '@/app/lib/messaging';
import { verifyTwilioRequest } from '@/app/lib/twilio-verify';

// POST /api/voice/conference/events
// Twilio webhook: conference participant join/leave/end events
// Drives the warm transfer flow.
//
// SECURITY: verifies X-Twilio-Signature. Audit C5.
export async function POST(request: NextRequest) {
  try {
    const verified = await verifyTwilioRequest(request);
    if (verified instanceof NextResponse) return verified;
    const url = new URL(request.url);
    // Get the parent call SID from query params (set when conference was created)
    const confName = url.searchParams.get('conf') || '';

    const form = verified;
    const event = form.get('StatusCallbackEvent') as string;
    const conferenceSid = form.get('ConferenceSid') as string;
    const participantCallSid = form.get('CallSid') as string; // The specific participant's call SID

    // Look up the call record by conference name
    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('conference_name', confName)
      .single();

    if (!call) return NextResponse.json({ ok: true });

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com').trim();
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';

    // Store the conference SID on first event
    if ((event === 'participant-join' || event === 'conference-start') && !call.conference_sid) {
      await supabaseAdmin.from('calls').update({ conference_sid: conferenceSid }).eq('id', call.id);
    }

    if (event === 'participant-join') {
      // Re-fetch to get latest transfer_status
      const { data: freshCall } = await supabaseAdmin
        .from('calls')
        .select('*')
        .eq('id', call.id)
        .single();
      if (!freshCall) return NextResponse.json({ ok: true });

      // When transfer_status is 'initiating' and the participant is NOT the agent
      // → this is the caller joining. Hold them and call the transfer target.
      if (freshCall.transfer_status === 'initiating' && participantCallSid !== freshCall.agent_call_sid) {
        // Hold the caller
        try {
          await holdParticipant(conferenceSid, freshCall.call_sid, true);
        } catch (e) { console.error('Hold caller error:', e); }

        // Call the transfer target
        if (freshCall.transfer_target_phone) {
          try {
            const confJoinUrl = `${origin}/api/voice/conference/join?conf=${encodeURIComponent(confName)}&role=target&whisper=${encodeURIComponent('Warm transfer. Please hold.')}`;
            const targetStatusUrl = `${origin}/api/voice/transfer/target-status?callSid=${freshCall.call_sid}`;

            // Look up SIP URI for the transfer target
            const { data: targetSettings } = await supabaseAdmin
              .from('call_settings')
              .select('sip_uri, name')
              .or(`phone.eq.${freshCall.transfer_target_phone},sip_uri.eq.${freshCall.transfer_target_phone}`)
              .eq('enabled', true)
              .maybeSingle();

            const targetTo = targetSettings?.sip_uri || freshCall.transfer_target_phone;
            const targetFrom = targetSettings?.sip_uri ? (freshCall.caller_phone || twilioNumber) : twilioNumber;

            // Send SMS to transfer target's real phone BEFORE their SoftPhone rings
            const transferFrom = freshCall.answered_by || 'Team';
            const targetRealName = freshCall.transfer_target_name || targetSettings?.name || '';
            if (targetRealName) {
              // Try full name match first (e.g. "Joe Volpe" -> "Joe Volpe")
              // Then fall back to first name with limit(1) to avoid multiple match failure
              let teamMemberPhone: string | null = null;
              const { data: exactMatch } = await supabaseAdmin
                .from('team_members').select('phone').eq('shop_id', 1)
                .ilike('name', targetRealName).eq('active', true).maybeSingle();
              if (exactMatch?.phone) {
                teamMemberPhone = exactMatch.phone;
              } else {
                const firstName = targetRealName.split(' ')[0];
                const { data: prefixMatches } = await supabaseAdmin
                  .from('team_members').select('phone').eq('shop_id', 1)
                  .ilike('name', `${firstName}%`).eq('active', true).limit(1);
                if (prefixMatches && prefixMatches.length > 0) {
                  teamMemberPhone = prefixMatches[0].phone;
                }
              }
              if (teamMemberPhone) {
                const digits = teamMemberPhone.replace(/\D/g, '');
                const formatted = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
                sendSms(formatted, `Transfer from ${transferFrom}. Customer: ${freshCall.caller_phone || 'Unknown'}`).catch(err => console.error('Transfer SMS error:', err));
              }
            }

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
            try { await holdParticipant(conferenceSid, freshCall.call_sid, false); } catch {}
            await supabaseAdmin.from('calls').update({
              transfer_status: null,
              transfer_target_phone: null,
              transfer_target_name: null,
            }).eq('id', call.id);
          }
        }
      }

      // Third participant joined (the transfer target) → briefing phase
      if (freshCall.transfer_status === 'connecting' && participantCallSid !== freshCall.agent_call_sid && participantCallSid !== freshCall.call_sid) {
        await supabaseAdmin.from('calls').update({ transfer_status: 'briefing' }).eq('id', call.id);
      }
    }

    if (event === 'participant-leave') {
      // Re-fetch for latest state
      const { data: freshCall } = await supabaseAdmin
        .from('calls')
        .select('transfer_status, agent_call_sid, call_sid, transfer_target_call_sid')
        .eq('id', call.id)
        .single();

      if (freshCall && participantCallSid === freshCall.agent_call_sid) {
        // Agent left the conference
        const status = freshCall.transfer_status;
        if (status === 'initiating' || status === 'connecting') {
          // Transfer wasn't completed -- clean up: hang up target, unhold caller
          if (freshCall.transfer_target_call_sid) {
            try { await hangupCall(freshCall.transfer_target_call_sid); } catch {}
          }
          try {
            await holdParticipant(conferenceSid, freshCall.call_sid, false);
          } catch {}
          await supabaseAdmin.from('calls').update({
            transfer_status: null,
            transfer_target_phone: null,
            transfer_target_name: null,
            transfer_target_call_sid: null,
          }).eq('id', call.id);
        }

        // If transfer was cancelled (status is null) or briefing and agent leaves,
        // end the call for the caller too -- they're alone in the conference
        if (!status || status === 'briefing') {
          try { await hangupCall(freshCall.call_sid); } catch {}
        }
      }
    }

    if (event === 'conference-end') {
      await supabaseAdmin.from('calls').update({
        transfer_status: null,
        conference_sid: null,
        conference_name: null,
      }).eq('id', call.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Conference events error:', error);
    return NextResponse.json({ ok: true });
  }
}
