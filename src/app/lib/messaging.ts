// ============================================================================
// SHARED MESSAGING UTILITIES
// SMS via Twilio, Email via Resend
// Used by: /api/auto/invoices/send, /api/auto/messages/send
// ============================================================================

// ---- SMS via Twilio ----
export async function sendSms(phone: string | null, message: string): Promise<boolean> {
  if (!phone) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured — skipping SMS');
    return false;
  }

  // Normalize phone to E.164
  const digits = phone.replace(/\D/g, '');
  const to = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : phone;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: message }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Twilio SMS error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return false;
  }
}

// ---- Email via Resend ----
export async function sendEmailRaw(
  to: string,
  subject: string,
  html: string,
  fromName?: string,
  fromEmail?: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return false;
  }

  const senderName = fromName || process.env.SHOP_NAME || 'Window Tinting';
  const senderEmail = fromEmail || process.env.SHOP_EMAIL_FROM || 'onboarding@resend.dev';
  const from = `${senderName} <${senderEmail}>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend email error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend email error:', err);
    return false;
  }
}

// ---- Simple branded email wrapper (for non-invoice messages) ----
export function buildSimpleEmailHtml(shopName: string, bodyText: string): string {
  // Escape HTML in body text but preserve line breaks
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
  <tr><td style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;">${shopName}</h1>
  </td></tr>
  <tr><td style="padding:32px 24px;">
    <p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">${escaped}</p>
  </td></tr>
  <tr><td style="padding:16px 24px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0;color:#888;font-size:12px;">${shopName}</p>
  </td></tr>
</table>
</body></html>`;
}
