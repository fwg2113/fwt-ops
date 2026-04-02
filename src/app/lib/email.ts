/**
 * FWT Email Notifications via Resend
 */

// These are used as fallbacks -- shop-specific values should be passed from shop_config
const FROM_ADDRESS = process.env.SHOP_EMAIL_FROM
  ? `${process.env.SHOP_NAME || 'Window Tinting'} <${process.env.SHOP_EMAIL_FROM}>`
  : 'Window Tinting <noreply@example.com>'
const TEAM_EMAIL = process.env.SHOP_TEAM_EMAIL || ''

interface SubmissionEmailData {
  submissionId: string
  path: 'save' | 'commit' | 'visit'
  customerName: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  propertyType: string | null
  filmName: string | null
  totalWindows: number
  totalSqFt: number
  retailPrice: number
  finalPrice: number
  savings: number
  discountPercent: number
  depositAmount: number | null
  promoCode: string | null
  rooms: Array<{
    roomLabel: string
    windows: Array<{
      windowType: string
      width: string | number
      height: string | number
      quantity: number
      panes: number
    }>
  }>
}

function formatPrice(cents: number): string {
  return `$${cents.toLocaleString()}`
}

function buildRoomRows(rooms: SubmissionEmailData['rooms']): string {
  return rooms.map((room) => {
    const windowRows = room.windows.map((w) =>
      `<tr>
        <td style="padding:6px 16px;color:#555;font-size:13px;">${w.quantity}x ${w.windowType} - ${w.width}" x ${w.height}" (${w.panes * w.quantity} panes)</td>
      </tr>`
    ).join('')

    return `
      <tr><td style="padding:12px 16px 4px;font-weight:700;color:#1a1a1a;font-size:14px;border-top:1px solid #eee;">${room.roomLabel}</td></tr>
      ${windowRows}
    `
  }).join('')
}

// ---- Customer confirmation email ----

function buildCustomerEmail(data: SubmissionEmailData): string {
  const isCommit = data.path === 'commit'
  const headline = isCommit
    ? 'Your Window Tint Project is Confirmed!'
    : 'Your Window Tint Quote'

  const nextSteps = isCommit
    ? `<p style="margin:0 0 8px;color:#555;">Your deposit of <strong>${formatPrice(data.depositAmount || 0)}</strong> secures your ${data.discountPercent}% discount.</p>
       <p style="margin:0 0 8px;color:#555;">We'll reach out within 1 business day to verify measurements and schedule your installation.</p>`
    : `<p style="margin:0 0 8px;color:#555;">Your quote is saved. You can commit anytime to lock in your discounted price.</p>
       <p style="margin:0 0 8px;color:#555;">We'll follow up to answer any questions you may have.</p>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
  <tr><td style="background:#d61f26;padding:24px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;">${process.env.SHOP_NAME || 'Window Tinting'}</h1>
  </td></tr>
  <tr><td style="padding:32px 24px 16px;">
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:20px;">${headline}</h2>
    <p style="margin:0 0 8px;color:#555;">Hi ${data.customerName},</p>
    ${nextSteps}
  </td></tr>
  <tr><td style="padding:0 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;margin-bottom:16px;">
      <tr><td style="padding:16px;font-weight:700;color:#1a1a1a;font-size:15px;border-bottom:1px solid #eee;">Quote Summary</td></tr>
      <tr><td style="padding:12px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Quote ID</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${data.submissionId}</td></tr>
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Film</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${data.filmName || 'TBD'}</td></tr>
          <tr><td style="padding:4px 0;color:#555;font-size:13px;">Windows</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1a1a1a;font-size:13px;">${data.totalWindows} panes (${data.totalSqFt.toFixed(1)} sq ft)</td></tr>
          ${data.promoCode ? `<tr><td style="padding:4px 0;color:#555;font-size:13px;">Promo Code</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#16a34a;font-size:13px;">${data.promoCode}</td></tr>` : ''}
          <tr><td colspan="2" style="padding:8px 0 0;border-top:1px solid #eee;"></td></tr>
          <tr><td style="padding:4px 0;color:#888;font-size:13px;text-decoration:line-through;">Retail Price</td><td style="padding:4px 0;text-align:right;color:#888;font-size:13px;text-decoration:line-through;">${formatPrice(data.retailPrice)}</td></tr>
          <tr><td style="padding:4px 0;color:#16a34a;font-size:13px;">Online Discount (${data.discountPercent}%)</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-weight:600;font-size:13px;">-${formatPrice(data.savings)}</td></tr>
          <tr><td style="padding:8px 0 4px;font-weight:700;color:#1a1a1a;font-size:16px;">Your Price</td><td style="padding:8px 0 4px;text-align:right;font-weight:700;color:#1a1a1a;font-size:16px;">${formatPrice(data.finalPrice)}</td></tr>
          ${isCommit && data.depositAmount ? `<tr><td style="padding:4px 0;color:#d61f26;font-size:13px;font-weight:600;">Deposit Due</td><td style="padding:4px 0;text-align:right;color:#d61f26;font-weight:700;font-size:14px;">${formatPrice(data.depositAmount)}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
      <tr><td style="padding:16px;font-weight:700;color:#1a1a1a;font-size:15px;border-bottom:1px solid #eee;">Window Details</td></tr>
      ${buildRoomRows(data.rooms)}
    </table>
  </td></tr>
  <tr><td style="padding:16px 24px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0 0 4px;color:#888;font-size:12px;">${process.env.SHOP_NAME || 'Window Tinting'}</p>
    <p style="margin:0 0 4px;color:#888;font-size:12px;">${process.env.SHOP_ADDRESS || ''}</p>
    <p style="margin:0;color:#888;font-size:12px;">${process.env.SHOP_PHONE || ''} ${process.env.SHOP_TEAM_EMAIL ? '| ' + process.env.SHOP_TEAM_EMAIL : ''}</p>
  </td></tr>
</table>
</body></html>`
}

// ---- Team notification email ----

function buildTeamEmail(data: SubmissionEmailData): string {
  const typeLabel = data.path === 'commit' ? 'COMMIT' : data.path === 'save' ? 'SAVED QUOTE' : 'VISIT REQUEST'

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
  <tr><td style="background:${data.path === 'commit' ? '#16a34a' : '#d61f26'};padding:16px 24px;">
    <h1 style="margin:0;color:#fff;font-size:18px;">New Flat Glass ${typeLabel}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${data.submissionId}</p>
  </td></tr>
  <tr><td style="padding:20px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:6px 0;color:#555;font-size:13px;width:120px;">Customer</td><td style="padding:6px 0;font-weight:600;color:#1a1a1a;font-size:13px;">${data.customerName}</td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Phone</td><td style="padding:6px 0;font-size:13px;"><a href="tel:${data.customerPhone}" style="color:#d61f26;">${data.customerPhone}</a></td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Email</td><td style="padding:6px 0;font-size:13px;"><a href="mailto:${data.customerEmail}" style="color:#d61f26;">${data.customerEmail}</a></td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Address</td><td style="padding:6px 0;font-size:13px;">${data.customerAddress}</td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Property</td><td style="padding:6px 0;font-size:13px;">${data.propertyType || 'N/A'}</td></tr>
      <tr><td colspan="2" style="padding:8px 0;border-top:1px solid #eee;"></td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Film</td><td style="padding:6px 0;font-weight:600;font-size:13px;">${data.filmName || 'TBD'}</td></tr>
      <tr><td style="padding:6px 0;color:#555;font-size:13px;">Panes</td><td style="padding:6px 0;font-size:13px;">${data.totalWindows} (${data.totalSqFt.toFixed(1)} sq ft)</td></tr>
      ${data.promoCode ? `<tr><td style="padding:6px 0;color:#555;font-size:13px;">Promo</td><td style="padding:6px 0;font-weight:600;color:#16a34a;font-size:13px;">${data.promoCode} (${data.discountPercent}%)</td></tr>` : ''}
      <tr><td colspan="2" style="padding:8px 0;border-top:1px solid #eee;"></td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Retail</td><td style="padding:6px 0;color:#888;font-size:13px;">${formatPrice(data.retailPrice)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;font-size:14px;">Customer Price</td><td style="padding:6px 0;font-weight:700;font-size:14px;">${formatPrice(data.finalPrice)}</td></tr>
      ${data.depositAmount ? `<tr><td style="padding:6px 0;color:#d61f26;font-weight:600;font-size:13px;">Deposit</td><td style="padding:6px 0;color:#d61f26;font-weight:600;font-size:13px;">${formatPrice(data.depositAmount)}</td></tr>` : ''}
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
      <tr><td style="padding:12px 16px;font-weight:700;color:#1a1a1a;font-size:13px;border-bottom:1px solid #eee;">Rooms & Windows</td></tr>
      ${buildRoomRows(data.rooms)}
    </table>
  </td></tr>
</table>
</body></html>`
}

// ---- Send function ----

export async function sendSubmissionEmails(data: SubmissionEmailData) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping emails')
    return
  }

  const isCommit = data.path === 'commit'
  const customerSubject = isCommit
    ? `Your Window Tint Project is Confirmed - ${data.submissionId}`
    : `Your Window Tint Quote - ${data.submissionId}`

  const teamSubject = isCommit
    ? `New COMMIT: ${data.customerName} - ${formatPrice(data.finalPrice)} - ${data.submissionId}`
    : `New Quote Saved: ${data.customerName} - ${formatPrice(data.finalPrice)} - ${data.submissionId}`

  // Send both emails in parallel
  const results = await Promise.allSettled([
    // Customer email
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [data.customerEmail],
        subject: customerSubject,
        html: buildCustomerEmail(data),
      }),
    }),
    // Team email
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TEAM_EMAIL],
        subject: teamSubject,
        html: buildTeamEmail(data),
      }),
    }),
  ])

  results.forEach((r, i) => {
    const label = i === 0 ? 'Customer' : 'Team'
    if (r.status === 'rejected') {
      console.error(`${label} email failed:`, r.reason)
    }
  })
}
