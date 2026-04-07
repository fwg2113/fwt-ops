import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/sms -- list recent SMS messages
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '500');

  const { data } = await supabaseAdmin
    .from('sms_messages')
    .select('*')
    .eq('shop_id', 1)
    .order('created_at', { ascending: false })
    .limit(limit);

  return NextResponse.json({ messages: data || [] });
}

// POST /api/sms -- send outbound SMS (with optional MMS)
export async function POST(request: NextRequest) {
  const { to, message, mediaUrl } = await request.json();

  if (!to || (!message && !mediaUrl)) {
    return NextResponse.json({ error: 'Missing to or message/media' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioNumber) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  let formatted = to.replace(/\D/g, '');
  if (formatted.length === 10) {
    formatted = '+1' + formatted;
  } else if (!formatted.startsWith('+')) {
    formatted = '+' + formatted;
  }

  try {
    const params: Record<string, string> = {
      To: formatted,
      From: twilioNumber,
    };

    if (message) {
      params.Body = message;
    }

    if (mediaUrl) {
      params.MediaUrl = mediaUrl;
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.message || 'Failed to send SMS' }, { status: response.status });
    }

    // Store outbound message
    await supabaseAdmin.from('sms_messages').insert({
      shop_id: 1,
      direction: 'outbound',
      from_phone: twilioNumber,
      to_phone: formatted,
      body: message || '',
      media_url: mediaUrl || null,
      status: 'sent',
      read: true,
      twilio_sid: data.sid,
    });

    return NextResponse.json({ success: true, sid: data.sid, phone: formatted });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
