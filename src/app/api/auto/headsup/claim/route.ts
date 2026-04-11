import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { sendSms } from '@/app/lib/messaging';

// POST /api/auto/headsup/claim
// Public endpoint -- atomic slot claim via Postgres function + confirmation SMS
export async function POST(request: NextRequest) {
  try {
    const { token, time } = await request.json();
    if (!token || !time) {
      return NextResponse.json({ error: 'Missing token or time' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('claim_headsup_slot', {
      p_token: token,
      p_time: time,
    });

    if (error) {
      console.error('Headsup claim RPC error:', error);
      return NextResponse.json({ error: 'Failed to claim slot' }, { status: 500 });
    }

    // Send confirmation SMS on successful claim
    if (data?.success) {
      try {
        // Look up offer -> booking -> shop config
        const { data: offer } = await supabaseAdmin
          .from('headsup_offers')
          .select('booking_id')
          .eq('token', token)
          .single();

        if (offer) {
          const { data: booking } = await supabaseAdmin
            .from('auto_bookings')
            .select('customer_name, customer_phone')
            .eq('id', offer.booking_id)
            .single();

          const { data: shop } = await supabaseAdmin
            .from('shop_config')
            .select('shop_name, shop_phone, shop_address, directions_link, headsup_confirm_sms_template')
            .eq('id', 1)
            .single();

          if (booking?.customer_phone && shop) {
            const firstName = (booking.customer_name || '').split(' ')[0];

            // Format time for display
            const [h, m] = time.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const timeDisplay = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;

            const template = shop.headsup_confirm_sms_template
              || 'Hi {customer_first_name}, you\'re confirmed for {headsup_time} today at {shop_name}! Get directions: {directions_link}';

            const message = template
              .replace(/\{customer_first_name\}/g, firstName)
              .replace(/\{customer_name\}/g, booking.customer_name || '')
              .replace(/\{shop_name\}/g, shop.shop_name || '')
              .replace(/\{shop_phone\}/g, shop.shop_phone || '')
              .replace(/\{shop_address\}/g, shop.shop_address || '')
              .replace(/\{directions_link\}/g, shop.directions_link || '')
              .replace(/\{headsup_time\}/g, timeDisplay);

            await sendSms(booking.customer_phone, message);

            // Log to sms_messages
            await supabaseAdmin.from('sms_messages').insert({
              shop_id: 1,
              direction: 'outbound',
              from_phone: process.env.TWILIO_PHONE_NUMBER || '',
              to_phone: booking.customer_phone,
              body: message,
              customer_name: booking.customer_name,
              status: 'sent',
            });
          }
        }
      } catch (smsErr) {
        // Don't fail the claim if SMS fails -- the slot is already confirmed
        console.error('Headsup confirmation SMS error:', smsErr);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Headsup claim error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
