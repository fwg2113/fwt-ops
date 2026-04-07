import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { sendSms, sendEmailRaw } from '@/app/lib/messaging';
import crypto from 'crypto';

// GET /api/cron/lead-followups
// Called by Vercel Cron once daily to:
//   1. Auto-send follow-ups on stale leads (if enabled)
//   2. Auto-expire old leads past the expiry window
//
// Protected by CRON_SECRET to prevent unauthorized calls
export async function GET(request: NextRequest) {
  // Verify cron secret (skip in development)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // For now, single-tenant (shop_id = 1). Multi-tenant: loop over all active shops.
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('id, shop_name, shop_timezone, followup_enabled, followup_auto_enabled, followup_auto_days, followup_auto_send_hour, followup_default_discount_type, followup_default_discount_amount, followup_expiry_days')
      .eq('id', 1)
      .single();

    if (!shopConfig || !shopConfig.followup_enabled) {
      return NextResponse.json({ message: 'Follow-up system disabled', results: { followups_sent: 0, expired: 0 } });
    }

    const results = { followups_sent: 0, expired: 0, skipped: 0, errors: 0 };
    const now = new Date();

    // Check if current hour matches shop's preferred send hour (in their timezone)
    const tz = shopConfig.shop_timezone || 'America/New_York';
    const shopNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const shopHour = shopNow.getHours();
    const preferredHour = shopConfig.followup_auto_send_hour ?? 9;

    // Only run auto follow-ups + expiry during the shop's preferred hour
    if (shopHour !== preferredHour) {
      return NextResponse.json({ message: `Not send hour (shop hour: ${shopHour}, preferred: ${preferredHour})`, results });
    }

    // ================================================================
    // 1. AUTO FOLLOW-UPS: leads that are 'sent' and older than followup_auto_days
    //    Only sends ONE auto follow-up per lead (followup_count = 0)
    // ================================================================
    if (shopConfig.followup_auto_enabled && shopConfig.followup_auto_days > 0) {
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - shopConfig.followup_auto_days);

      const { data: staleLeads } = await supabaseAdmin
        .from('auto_leads')
        .select('*')
        .eq('shop_id', shopConfig.id)
        .in('status', ['sent']) // only auto-follow-up on 'sent' (not opened -- they at least looked)
        .eq('followup_count', 0) // only first auto follow-up
        .lt('created_at', cutoffDate.toISOString());

      for (const lead of (staleLeads || [])) {
        // Generate fresh token
        const newToken = crypto.randomBytes(16).toString('hex');

        // Build discount text
        const discType = shopConfig.followup_default_discount_type;
        const discAmount = Number(shopConfig.followup_default_discount_amount) || 0;
        const hasDiscount = discAmount > 0;
        let discountText = '';
        if (hasDiscount) {
          discountText = discType === 'dollar'
            ? ` We're offering $${discAmount} off as a special incentive.`
            : ` We're offering ${discAmount}% off as a special incentive.`;
        }

        const vehicleStr = [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(' ');
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
        const bookingUrl = `${baseUrl}/book/lead/${newToken}`;

        // Update lead
        const updateData: Record<string, unknown> = {
          token: newToken,
          followup_count: 1,
          last_followup_at: now.toISOString(),
          status: 'sent',
          link_opened_at: null,
          pre_appointment_type: null,
          pre_appointment_date: null,
          pre_appointment_time: null,
        };

        if (hasDiscount) {
          updateData.followup_discount_type = discType;
          updateData.followup_discount_amount = discAmount;
        }

        const { error: updateErr } = await supabaseAdmin
          .from('auto_leads')
          .update(updateData)
          .eq('id', lead.id);

        if (updateErr) { results.errors++; continue; }

        // Send via SMS if phone available
        let sent = false;
        if (lead.customer_phone) {
          const smsText = `${shopConfig.shop_name}: Just following up on your ${vehicleStr} tint quote ($${Number(lead.total_price).toLocaleString()}).${discountText} Book here: ${bookingUrl}`;
          sent = await sendSms(lead.customer_phone, smsText);
        }

        // Send via email if available
        if (lead.customer_email) {
          const html = `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Following Up on Your Quote</h2>
              <p>Hi ${lead.customer_name || 'there'},</p>
              <p>We wanted to follow up on the window tint quote we put together for your <strong>${vehicleStr}</strong>.</p>
              <p><strong>Quote Total: $${Number(lead.total_price).toLocaleString()}</strong></p>
              ${hasDiscount ? `<p style="color: #16a34a; font-weight: 700;">${discType === 'dollar' ? `Special Offer: $${discAmount} OFF` : `Special Offer: ${discAmount}% OFF`} -- book now to claim this deal!</p>` : ''}
              <p style="margin: 24px 0;">
                <a href="${bookingUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">
                  View Quote &amp; Book Now
                </a>
              </p>
              <p style="color: #999; font-size: 12px;">${shopConfig.shop_name}</p>
            </div>
          `;
          const emailSent = await sendEmailRaw(
            lead.customer_email,
            `Following Up -- Your ${vehicleStr} Tint Quote`,
            html,
            shopConfig.shop_name
          );
          sent = emailSent || sent;
        }

        if (sent || lead.customer_phone || lead.customer_email) {
          results.followups_sent++;
        } else {
          results.skipped++;
        }
      }
    }

    // ================================================================
    // 2. AUTO-EXPIRE: leads older than followup_expiry_days that are still pending
    // ================================================================
    if (shopConfig.followup_expiry_days > 0) {
      const expiryCutoff = new Date(now);
      expiryCutoff.setDate(expiryCutoff.getDate() - shopConfig.followup_expiry_days);

      const { data: expiredLeads, error: expErr } = await supabaseAdmin
        .from('auto_leads')
        .update({
          status: 'expired',
          expired_at: now.toISOString(),
        })
        .eq('shop_id', shopConfig.id)
        .in('status', ['sent', 'opened'])
        .lt('created_at', expiryCutoff.toISOString())
        .select('id');

      if (!expErr && expiredLeads) {
        results.expired = expiredLeads.length;
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Lead followup cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
