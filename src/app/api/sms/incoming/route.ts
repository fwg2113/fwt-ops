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

  // Look up customer name by phone
  const cleanPhone = from.replace(/\D/g, '').slice(-10);

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('display_name')
    .or(`phone.ilike.%${cleanPhone}%`)
    .limit(1)
    .single();

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
    customer_name: customer?.display_name || null,
    twilio_sid: messageSid,
  });

  // Send email alert (non-blocking)
  sendEmailAlert(from, body, customer?.display_name || null, cleanPhone).catch(err =>
    console.error('Email alert failed:', err)
  );

  // Return empty TwiML (don't auto-reply)
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

export async function GET() {
  return new NextResponse('SMS incoming webhook active', { status: 200 });
}

async function sendEmailAlert(phone: string, messageBody: string, customerName: string | null, cleanPhone: string) {
  // Check if email alerts are enabled
  let emailEnabled = true;
  let emailAddress = 'info@frederickwindowtinting.com';

  const { data: settingsRow } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'notification_settings')
    .maybeSingle();

  if (settingsRow?.value) {
    const settings = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value;
    emailEnabled = settings.email_alerts_enabled ?? true;
    emailAddress = settings.email_alert_address || 'info@frederickwindowtinting.com';
  }

  if (!emailEnabled || !emailAddress) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('Email alert skipped: RESEND_API_KEY not set');
    return;
  }

  const formattedPhone = cleanPhone.length === 10
    ? `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
    : phone;

  const senderName = customerName || formattedPhone;
  const messagesUrl = `https://ops.frederickwindowtinting.com/communication/messages?phone=${cleanPhone}`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'FWT Ops <noreply@frederickwindowtinting.com>',
      to: emailAddress,
      subject: `New SMS from ${senderName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 18px;">New Text Message</h2>
          </div>
          <div style="background: #1a1a2e; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #2d2d44; border-top: none;">
            <div style="margin-bottom: 16px;">
              <div style="color: #94a3b8; font-size: 13px; margin-bottom: 4px;">From</div>
              <div style="color: #f1f5f9; font-size: 16px; font-weight: 600;">${senderName}${customerName ? ` (${formattedPhone})` : ''}</div>
            </div>
            <div style="background: #111827; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #e2e8f0; font-size: 15px; margin: 0; line-height: 1.5; white-space: pre-wrap;">${messageBody || '(no text - media attached)'}</p>
            </div>
            <a href="${messagesUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              View in Message Hub
            </a>
          </div>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const errBody = await emailRes.text();
    console.error('Resend email alert failed:', emailRes.status, errBody);
  } else {
    console.log('Email alert sent to', emailAddress);
  }
}
