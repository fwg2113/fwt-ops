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
    const body = await req.json();
    const invoiceId = body.invoiceId;
    // Support both single method and array of methods
    const methods: string[] = body.methods
      ? (Array.isArray(body.methods) ? body.methods : [body.methods])
      : body.method ? [body.method] : [];

    if (!invoiceId || methods.length === 0 || !methods.every(m => ['sms', 'email'].includes(m))) {
      return NextResponse.json({ error: 'invoiceId and method(s) (sms|email) required' }, { status: 400 });
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

    const results: Record<string, boolean> = {};

    for (const method of methods) {
      if (method === 'sms') {
        if (invoice.customer_phone) {
          // Sanitize text for SMS (strip any HTML tags)
          const cleanShop = shopName.replace(/<[^>]*>/g, '');
          const cleanVehicle = vehicleStr.replace(/<[^>]*>/g, '');
          results.sms = await sendSms(
            invoice.customer_phone,
            `${cleanShop}: Your invoice for ${cleanVehicle} is ready. View and pay here: ${invoiceUrl}`
          );
        } else {
          results.sms = false;
        }
      } else if (method === 'email') {
        if (invoice.customer_email) {
          const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.balance_due);
          const html = buildInvoiceEmailHtml(shopName, shopPhone, shopEmail, invoice.customer_name, vehicleStr, invoiceNumber, formattedBalance, invoiceUrl);
          results.email = await sendEmailRaw(
            invoice.customer_email,
            `Invoice ${invoiceNumber} — ${vehicleStr}`,
            html,
            shopName
          );
        } else {
          results.email = false;
        }
      }
    }

    const anySent = Object.values(results).some(v => v);
    if (!anySent) {
      return NextResponse.json({
        error: 'No delivery methods succeeded. Check phone number and email address.',
        results,
      }, { status: 400 });
    }

    // Record which methods were used
    const sentVia = Object.entries(results).filter(([, v]) => v).map(([k]) => k).join(', ');

    await supabase
      .from('documents')
      .update({
        status: ['draft', 'viewed'].includes(invoice.status) ? 'sent' : invoice.status,
        sent_via: sentVia,
        sent_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    return NextResponse.json({ success: true, methods: results });
  } catch (error) {
    console.error('Invoice send error:', error);
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
});

// Escape HTML to prevent injection in email templates
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Invoice-specific rich HTML email template
function buildInvoiceEmailHtml(
  shopName: string, shopPhone: string, shopEmail: string,
  customerName: string, vehicleStr: string,
  invoiceNumber: string, formattedBalance: string, invoiceUrl: string
): string {
  // Sanitize all user-provided data before embedding in HTML
  const sName = esc(shopName);
  const sPhone = esc(shopPhone);
  const sEmail = esc(shopEmail);
  const cName = esc(customerName);
  const vStr = esc(vehicleStr);
  const iNum = esc(invoiceNumber);
  const fBal = esc(formattedBalance);
  // URL is generated by us, but encode to be safe
  const iUrl = encodeURI(invoiceUrl);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
  <tr><td style="background:#dc2626;padding:24px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;">${sName}</h1>
  </td></tr>
  <tr><td style="padding:32px 24px 16px;">
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:20px;">Your Invoice is Ready</h2>
    <p style="margin:0 0 8px;color:#555;">Hi ${cName},</p>
    <p style="margin:0 0 16px;color:#555;">Your invoice for <strong>${vStr}</strong> is ready for review.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Invoice</td><td style="text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${iNum}</td></tr>
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Vehicle</td><td style="text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${vStr}</td></tr>
          <tr><td style="padding:8px 0 4px;font-weight:700;color:#1a1a1a;font-size:16px;border-top:1px solid #eee;">Balance Due</td><td style="padding:8px 0 4px;text-align:right;font-weight:700;color:#dc2626;font-size:16px;border-top:1px solid #eee;">${fBal}</td></tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;">
      <a href="${iUrl}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Invoice & Pay</a>
    </td></tr></table>
    <p style="margin:24px 0 0;color:#999;font-size:12px;text-align:center;">Or copy this link: ${iUrl}</p>
  </td></tr>
  <tr><td style="padding:16px 24px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0 0 4px;color:#888;font-size:12px;">${sName}</p>
    <p style="margin:0;color:#888;font-size:12px;">${sPhone}${sPhone && sEmail ? ' | ' : ''}${sEmail}</p>
  </td></tr>
</table>
</body></html>`;
}
