import { NextResponse } from 'next/server';
import { withShopAuth } from '@/app/lib/auth-middleware';

// POST /api/auto/send-sms
// Sends an SMS via Twilio. Used for directions, notifications, etc.
// Body: { to: string, message: string }
export const POST = withShopAuth(async ({ req }) => {
  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json({ error: 'to and message are required' }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    // Clean the phone number to digits, add +1 if needed
    const digits = to.replace(/\D/g, '');
    const toNumber = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+${digits}`;

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: message,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Twilio SMS error:', err);
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, sid: data.sid });
  } catch (error) {
    console.error('Send SMS error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
