import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { sendSms } from '@/app/lib/messaging';
import { substituteTemplate, buildTemplateContext, type TemplateContext } from '@/app/lib/template-vars';

// GET /api/cron/reminders
// Called by Vercel Cron (or manually) to send appointment reminders
// Checks for:
//   - 24-hour reminders: appointments tomorrow that haven't been reminded yet
//   - 1-hour reminders: appointments today within the next 60-90 min window
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
    // Get all shops with reminder settings
    // For now, single-tenant (shop_id = 1). Multi-tenant: loop over all active shops.
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('id, shop_name, shop_phone, shop_address, shop_timezone, review_link, reminder_24hr_enabled, reminder_1hr_enabled, reminder_24hr_template, reminder_1hr_template, review_request_enabled, review_request_delay_hours, review_request_template')
      .eq('id', 1)
      .single();

    if (!shopConfig) {
      return NextResponse.json({ error: 'No shop config' }, { status: 500 });
    }

    const results = { sent_24hr: 0, sent_1hr: 0, sent_reviews: 0, skipped: 0, errors: 0 };
    const tz = shopConfig.shop_timezone || 'America/New_York';

    // Get current time in shop's timezone
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const todayStr = nowInTz.toISOString().split('T')[0];
    const tomorrowDate = new Date(nowInTz);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    const currentHour = nowInTz.getHours();
    const currentMin = nowInTz.getMinutes();
    const currentTotalMin = currentHour * 60 + currentMin;

    // ================================================================
    // 24-HOUR REMINDERS: appointments tomorrow, not yet reminded
    // ================================================================
    if (shopConfig.reminder_24hr_enabled && shopConfig.reminder_24hr_template) {
      const { data: tomorrowAppts } = await supabaseAdmin
        .from('auto_bookings')
        .select('id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_time, appointment_type, status')
        .eq('shop_id', shopConfig.id)
        .eq('appointment_date', tomorrowStr)
        .is('reminder_24hr_sent_at', null)
        .in('status', ['booked', 'confirmed']);

      for (const appt of (tomorrowAppts || [])) {
        if (!appt.customer_phone) { results.skipped++; continue; }

        const ctx = buildTemplateContext(appt, shopConfig);
        const message = substituteTemplate(shopConfig.reminder_24hr_template, ctx);

        const sent = await sendSms(appt.customer_phone, message);
        if (sent) {
          await supabaseAdmin
            .from('auto_bookings')
            .update({ reminder_24hr_sent_at: new Date().toISOString() })
            .eq('id', appt.id);
          results.sent_24hr++;
        } else {
          results.errors++;
        }
      }
    }

    // ================================================================
    // 1-HOUR REMINDERS: appointments today within 60-90 min from now
    // Only for appointments with a specific time (not heads-up)
    // ================================================================
    if (shopConfig.reminder_1hr_enabled && shopConfig.reminder_1hr_template) {
      const { data: todayAppts } = await supabaseAdmin
        .from('auto_bookings')
        .select('id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_time, appointment_type, status')
        .eq('shop_id', shopConfig.id)
        .eq('appointment_date', todayStr)
        .is('reminder_1hr_sent_at', null)
        .not('appointment_time', 'is', null)
        .in('status', ['booked', 'confirmed']);

      for (const appt of (todayAppts || [])) {
        if (!appt.customer_phone || !appt.appointment_time) { results.skipped++; continue; }

        // Skip heads-up appointments (they don't have fixed times)
        if (appt.appointment_type === 'headsup_30' || appt.appointment_type === 'headsup_60') {
          results.skipped++;
          continue;
        }

        // Parse appointment time and check if it's 60-90 minutes from now
        const [h, m] = appt.appointment_time.split(':').map(Number);
        const apptTotalMin = h * 60 + m;
        const minutesUntil = apptTotalMin - currentTotalMin;

        // Send if appointment is 60-90 minutes away
        if (minutesUntil >= 45 && minutesUntil <= 90) {
          const ctx = buildTemplateContext(appt, shopConfig);
          const message = substituteTemplate(shopConfig.reminder_1hr_template, ctx);

          const sent = await sendSms(appt.customer_phone, message);
          if (sent) {
            await supabaseAdmin
              .from('auto_bookings')
              .update({ reminder_1hr_sent_at: new Date().toISOString() })
              .eq('id', appt.id);
            results.sent_1hr++;
          } else {
            results.errors++;
          }
        }
      }
    }

    // ================================================================
    // REVIEW REQUESTS: completed appointments X hours ago, not yet sent
    // ================================================================
    if (shopConfig.review_request_enabled && shopConfig.review_request_template) {
      const delayHours = shopConfig.review_request_delay_hours || 2;
      const cutoffTime = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();

      // Find completed/invoiced appointments where:
      // - status is completed or invoiced
      // - updated_at is older than the delay (job was finished X hours ago)
      // - review request hasn't been sent yet
      // - customer has a phone number
      const { data: completedAppts } = await supabaseAdmin
        .from('auto_bookings')
        .select('id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_time, updated_at')
        .eq('shop_id', shopConfig.id)
        .in('status', ['completed', 'invoiced'])
        .is('review_request_sent_at', null)
        .not('customer_phone', 'is', null)
        .lt('updated_at', cutoffTime);

      for (const appt of (completedAppts || [])) {
        if (!appt.customer_phone) { results.skipped++; continue; }

        const ctx = buildTemplateContext(appt, shopConfig);
        const message = substituteTemplate(shopConfig.review_request_template, ctx);

        const sent = await sendSms(appt.customer_phone, message);
        if (sent) {
          await supabaseAdmin
            .from('auto_bookings')
            .update({ review_request_sent_at: new Date().toISOString() })
            .eq('id', appt.id);
          results.sent_reviews++;
        } else {
          results.errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
      timezone: tz,
    });
  } catch (error) {
    console.error('Reminder cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
