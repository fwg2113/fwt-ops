import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms } from '@/app/lib/messaging';
import crypto from 'crypto';

// POST /api/auto/headsup/send-individual
// Dashboard: send heads-up to one customer with specific time slots
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { bookingId, slots, customMessage } = await req.json();

    if (!bookingId || !slots || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Missing bookingId or slots' }, { status: 400 });
    }

    // Validate booking
    const { data: booking, error: bookingErr } = await supabase
      .from('auto_bookings')
      .select('id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, appointment_date, appointment_type')
      .eq('id', bookingId)
      .eq('shop_id', shopId)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (!booking.appointment_type.startsWith('headsup')) {
      return NextResponse.json({ error: 'Not a heads-up appointment' }, { status: 400 });
    }

    // Get shop config for template
    const { data: shop } = await supabase
      .from('shop_config')
      .select('shop_name, shop_phone, shop_address, headsup_sms_template')
      .eq('id', 1)
      .single();

    // Generate token
    const token = crypto.randomBytes(16).toString('hex');
    const noticeMinutes = booking.appointment_type === 'headsup_60' ? 60 : 30;

    // Build offered_slots
    const offeredSlots = slots.map((time: string) => ({ time, status: 'available' }));

    // Insert offer
    const { data: offer, error: offerErr } = await supabase
      .from('headsup_offers')
      .insert({
        shop_id: shopId,
        booking_id: bookingId,
        token,
        mode: 'individual',
        offered_slots: offeredSlots,
        notice_minutes: noticeMinutes,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (offerErr) {
      console.error('Headsup offer insert error:', offerErr);
      return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
    }

    // Build SMS
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ops.frederickwindowtinting.com';
    const link = `${baseUrl}/book/headsup/${token}`;
    const firstName = (booking.customer_name || '').split(' ')[0];

    const template = customMessage || shop?.headsup_sms_template || 'Hi {customer_first_name}, a bay just opened up at {shop_name}! Pick your time: {headsup_link}';
    const message = template
      .replace(/\{customer_first_name\}/g, firstName)
      .replace(/\{customer_name\}/g, booking.customer_name || '')
      .replace(/\{shop_name\}/g, shop?.shop_name || '')
      .replace(/\{shop_phone\}/g, shop?.shop_phone || '')
      .replace(/\{headsup_link\}/g, link)
      .replace(/\{vehicle_year\}/g, String(booking.vehicle_year || ''))
      .replace(/\{vehicle_make\}/g, booking.vehicle_make || '')
      .replace(/\{vehicle_model\}/g, booking.vehicle_model || '');

    // Send SMS
    const smsSent = await sendSms(booking.customer_phone, message);

    // Log to sms_messages
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
      .eq('id', bookingId);

    return NextResponse.json({ success: true, token, offerId: offer.id, smsSent });
  } catch (err) {
    console.error('Headsup send-individual error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
