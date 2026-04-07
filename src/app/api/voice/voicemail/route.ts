import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/voice/voicemail
// Twilio webhook: voicemail recording completed
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const recordingUrl = form.get('RecordingUrl') as string;
  const recordingDuration = form.get('RecordingDuration') as string;

  const url = new URL(request.url);
  const callSid = url.searchParams.get('callSid') || '';
  const from = url.searchParams.get('from') || '';
  const customerName = url.searchParams.get('customerName') || '';

  if (callSid && recordingUrl) {
    await supabaseAdmin.from('calls').update({
      status: 'voicemail',
      voicemail_url: `${recordingUrl}.mp3`,
      duration: parseInt(recordingDuration || '0'),
    }).eq('call_sid', callSid);
  }

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  );
}
