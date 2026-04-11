import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms } from '@/app/lib/messaging';
import crypto from 'crypto';

// POST /api/auto/headsup/send-pool
// Dashboard: create a shared slot pool and send to all heads-up customers
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { bookingIds, slots, customMessage } = await req.json();

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      return NextResponse.json({ error: 'Missing bookingIds' }, { status: 400 });
    }
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Missing slots' }, { status: 400 });
    }

    // Validate bookings
    const { data: bookings, error: bookingsErr } = await supabase
      .from('auto_bookings')
      .select('id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_type')
      .in('id', bookingIds)
      .eq('shop_id', shopId);

    if (bookingsErr || !bookings || bookings.length === 0) {
      return NextResponse.json({ error: 'Bookings not found' }, { status: 404 });
    }

    const poolDate = bookings[0].appointment_date;

    // Get shop config
    const { data: shop } = await supabase
      .from('shop_config')
      .select('shop_name, shop_phone, shop_address, headsup_pool_sms_template')
      .eq('id', 1)
      .single();

    // Create pool
    const poolSlots = slots.map((time: string) => ({ time, claimed_by: null }));

    const { data: pool, error: poolErr } = await supabase
      .from('headsup_pools')
      .insert({
        shop_id: shopId,
        pool_date: poolDate,
        slots: poolSlots,
      })
      .select('id')
      .single();

    if (poolErr || !pool) {
      console.error('Headsup pool insert error:', poolErr);
      return NextResponse.json({ error: 'Failed to create pool' }, { status: 500 });
    }

    // Create offers + send SMS for each booking
    const results: { bookingId: string; token: string; smsSent: boolean }[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ops.frederickwindowtinting.com';
    const template = customMessage || shop?.headsup_pool_sms_template || 'Hi {customer_first_name}, time slots just opened at {shop_name}! First come, first served -- pick yours: {headsup_link}';

    for (const booking of bookings) {
      const token = crypto.randomBytes(16).toString('hex');
      const noticeMinutes = 30;

      // Insert offer
      await supabase.from('headsup_offers').insert({
        shop_id: shopId,
        booking_id: booking.id,
        pool_id: pool.id,
        token,
        mode: 'pool',
        notice_minutes: noticeMinutes,
        sent_at: new Date().toISOString(),
      });

      // Build SMS
      const link = `${baseUrl}/book/headsup/${token}`;
      const firstName = (booking.customer_name || '').split(' ')[0];
      const message = template
        .replace(/\{customer_first_name\}/g, firstName)
        .replace(/\{customer_name\}/g, booking.customer_name || '')
        .replace(/\{shop_name\}/g, shop?.shop_name || '')
        .replace(/\{shop_phone\}/g, shop?.shop_phone || '')
        .replace(/\{headsup_link\}/g, link)
        .replace(/\{vehicle_year\}/g, String(booking.vehicle_year || ''))
        .replace(/\{vehicle_make\}/g, booking.vehicle_make || '')
        .replace(/\{vehicle_model\}/g, booking.vehicle_model || '');

      const smsSent = await sendSms(booking.customer_phone, message);

      if (smsSent) {
        await supabase.from('sms_messages').insert({
          shop_id: shopId,
          direction: 'outbound',
          from_phone: process.env.TWILIO_PHONE_NUMBER || '',
          to_phone: booking.customer_phone,
          body: message,
          customer_name: booking.customer_name,
          status: 'sent',
        });
      }

      // Update booking
      await supabase
        .from('auto_bookings')
        .update({
          headsup_notified_at: new Date().toISOString(),
          headsup_message: message,
        })
        .eq('id', booking.id);

      results.push({ bookingId: booking.id, token, smsSent });
    }

    return NextResponse.json({ success: true, poolId: pool.id, results });
  } catch (err) {
    console.error('Headsup send-pool error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
