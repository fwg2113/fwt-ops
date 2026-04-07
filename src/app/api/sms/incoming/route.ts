import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/sms/incoming
// Twilio webhook: incoming SMS to the business number
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = form.get('From') as string;
  const to = form.get('To') as string;
  const body = form.get('Body') as string;
  const messageSid = form.get('MessageSid') as string;
  const numMedia = parseInt(form.get('NumMedia') as string || '0');
  const mediaUrl = numMedia > 0 ? (form.get('MediaUrl0') as string) : null;

  // Store the message
  await supabaseAdmin.from('sms_messages').insert({
    shop_id: 1,
    direction: 'inbound',
    from_phone: from,
    to_phone: to,
    body: body || '',
    media_url: mediaUrl,
    status: 'received',
    read: false,
    twilio_sid: messageSid,
  });

  // Return empty TwiML (don't auto-reply)
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  );
}
