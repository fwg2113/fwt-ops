import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/checkout/verify?session_id=cs_xxx
// Checks if a booking has been confirmed after Stripe payment
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const { data: booking } = await supabaseAdmin
    .from('auto_bookings')
    .select('booking_id, status')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!booking) {
    return NextResponse.json({ confirmed: false });
  }

  return NextResponse.json({
    confirmed: booking.status === 'booked',
    bookingId: booking.status === 'booked' ? booking.booking_id : null,
  });
}
