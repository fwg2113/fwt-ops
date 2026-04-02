import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms, sendEmailRaw } from '@/app/lib/messaging';

// ============================================================================
// POST /api/auto/invoices/send
// Sends an invoice link to the customer via SMS or email
// Updates invoice status to 'sent' and records sent_via/sent_at
// ============================================================================
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { invoiceId, method } = await req.json();

    if (!invoiceId || !method || !['sms', 'email'].includes(method)) {
      return NextResponse.json({ error: 'invoiceId and method (sms|email) required' }, { status: 400 });
    }

    // Query from new documents table
    const { data: invoice, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', invoiceId)
      .eq('shop_id', shopId)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { data: shopConfig } = await supabase
      .from('shop_config')
      .select('shop_name, shop_phone, shop_email')
      .eq('id', shopId)
      .single();

    const shopName = shopConfig?.shop_name || '';
    const shopPhone = shopConfig?.shop_phone || '';
    const shopEmail = shopConfig?.shop_email || '';
    const origin = req.headers.get('origin') || 'https://fwt-ops.vercel.app';
    const invoiceUrl = `${origin}/invoice/${invoice.public_token}`;
    const vehicleStr = [invoice.vehicle_year, invoice.vehicle_make, invoice.vehicle_model].filter(Boolean).join(' ');
    const invoiceNumber = invoice.doc_number || invoice.invoice_number || '';

    let sent = false;

    if (method === 'sms') {
      sent = await sendSms(
        invoice.customer_phone,
        `${shopName}: Your invoice for ${vehicleStr} is ready. View and pay here: ${invoiceUrl}`
      );
    } else if (method === 'email') {
      if (!invoice.customer_email) {
        return NextResponse.json({ error: 'No email address on file' }, { status: 400 });
      }
      const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.balance_due);
      const html = buildInvoiceEmailHtml(shopName, shopPhone, shopEmail, invoice.customer_name, vehicleStr, invoiceNumber, formattedBalance, invoiceUrl);
      sent = await sendEmailRaw(
        invoice.customer_email,
        `Invoice ${invoiceNumber} — ${vehicleStr}`,
        html,
        shopName
      );
    }

    if (!sent) {
      return NextResponse.json({
        error: method === 'sms' ? 'SMS not configured or no phone number' : 'Email not configured or no email address',
      }, { status: 400 });
    }

    await supabase
      .from('documents')
      .update({
        status: ['draft', 'viewed'].includes(invoice.status) ? 'sent' : invoice.status,
        sent_via: method,
        sent_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    return NextResponse.json({ success: true, method });
  } catch (error) {
    console.error('Invoice send error:', error);
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
});

// Invoice-specific rich HTML email template
function buildInvoiceEmailHtml(
  shopName: string, shopPhone: string, shopEmail: string,
  customerName: string, vehicleStr: string,
  invoiceNumber: string, formattedBalance: string, invoiceUrl: string
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
  <tr><td style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;">${shopName}</h1>
  </td></tr>
  <tr><td style="padding:32px 24px 16px;">
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:20px;">Your Invoice is Ready</h2>
    <p style="margin:0 0 8px;color:#555;">Hi ${customerName},</p>
    <p style="margin:0 0 16px;color:#555;">Your invoice for <strong>${vehicleStr}</strong> is ready for review.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Invoice</td><td style="text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${invoiceNumber}</td></tr>
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Vehicle</td><td style="text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${vehicleStr}</td></tr>
          <tr><td style="padding:8px 0 4px;font-weight:700;color:#1a1a1a;font-size:16px;border-top:1px solid #eee;">Balance Due</td><td style="padding:8px 0 4px;text-align:right;font-weight:700;color:#dc2626;font-size:16px;border-top:1px solid #eee;">${formattedBalance}</td></tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;">
      <a href="${invoiceUrl}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Invoice & Pay</a>
    </td></tr></table>
    <p style="margin:24px 0 0;color:#999;font-size:12px;text-align:center;">Or copy this link: ${invoiceUrl}</p>
  </td></tr>
  <tr><td style="padding:16px 24px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0 0 4px;color:#888;font-size:12px;">${shopName}</p>
    <p style="margin:0;color:#888;font-size:12px;">${shopPhone}${shopPhone && shopEmail ? ' | ' : ''}${shopEmail}</p>
  </td></tr>
</table>
</body></html>`;
}
