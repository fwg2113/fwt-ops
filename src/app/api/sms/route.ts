import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/sms -- list recent SMS messages
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

  const { data } = await supabaseAdmin
    .from('sms_messages')
    .select('*')
    .eq('shop_id', 1)
    .order('created_at', { ascending: false })
    .limit(limit);

  return NextResponse.json({ messages: data || [] });
}

// POST /api/sms -- send outbound SMS
export async function POST(request: NextRequest) {
  const { to, message } = await request.json();

  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioNumber) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  const formatted = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: formatted,
        From: twilioNumber,
        Body: message,
      }),
    });

    const data = await res.json();

    // Store outbound message
    await supabaseAdmin.from('sms_messages').insert({
      shop_id: 1,
      direction: 'outbound',
      from_phone: twilioNumber,
      to_phone: formatted,
      body: message,
      status: 'sent',
      read: true,
      twilio_sid: data.sid,
    });

    return NextResponse.json({ success: true, sid: data.sid });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
