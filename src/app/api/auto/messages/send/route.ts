import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms, sendEmailRaw, buildSimpleEmailHtml } from '@/app/lib/messaging';

// ============================================================================
// POST /api/auto/messages/send
// Generic message sending — SMS or email to a booking's customer
// Message text should already have variables substituted (done client-side)
// ============================================================================
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { bookingId, message, method, subject } = await req.json();

    if (!bookingId || !message || !method || !['sms', 'email'].includes(method)) {
      return NextResponse.json(
        { error: 'bookingId, message, and method (sms|email) required' },
        { status: 400 }
      );
    }

    // Fetch booking for customer contact info
    const { data: booking, error } = await supabase
      .from('auto_bookings')
      .select('customer_name, customer_phone, customer_email')
      .eq('id', bookingId)
      .eq('shop_id', shopId)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Fetch shop name for email branding
    const { data: shopConfig } = await supabase
      .from('shop_config')
      .select('shop_name')
      .eq('id', shopId)
      .single();

    const shopName = shopConfig?.shop_name || '';
    let sent = false;

    if (method === 'sms') {
      sent = await sendSms(booking.customer_phone, message);
    } else if (method === 'email') {
      if (!booking.customer_email) {
        return NextResponse.json({ error: 'No email address on file' }, { status: 400 });
      }
      const html = buildSimpleEmailHtml(shopName, message);
      const emailSubject = subject || `Message from ${shopName}`;
      sent = await sendEmailRaw(booking.customer_email, emailSubject, html, shopName);
    }

    if (!sent) {
      return NextResponse.json({
        error: method === 'sms'
          ? 'SMS not configured or no phone number'
          : 'Email not configured or no email address',
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, method });
  } catch (error) {
    console.error('Message send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
});
