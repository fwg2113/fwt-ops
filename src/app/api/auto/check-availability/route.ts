import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/check-availability
// Checks how many slots are available for a given date
export async function POST(request: NextRequest) {
  try {
    const { date, appointmentType } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 });
    }

    // Check if date is a closed date
    const { data: closedDate } = await supabaseAdmin
      .from('auto_closed_dates')
      .select('reason')
      .eq('closed_date', date)
      .single();

    if (closedDate) {
      return NextResponse.json({
        available: false,
        reason: closedDate.reason || 'Closed',
        dropoffRemaining: 0,
        waitingRemaining: 0,
      });
    }

    // Get day of week for schedule lookup
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

    // Get schedule for this day
    const { data: scheduleDay } = await supabaseAdmin
      .from('auto_schedule')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .single();

    if (!scheduleDay || !scheduleDay.enabled) {
      return NextResponse.json({
        available: false,
        reason: 'Closed on ' + dayOfWeek,
        dropoffRemaining: 0,
        waitingRemaining: 0,
      });
    }

    // Check for date overrides
    const { data: override } = await supabaseAdmin
      .from('auto_date_overrides')
      .select('*')
      .eq('override_date', date)
      .single();

    const maxDropoff = override?.max_dropoff ?? scheduleDay.max_dropoff;
    const maxWaiting = override?.max_waiting ?? scheduleDay.max_waiting;

    // Count existing bookings for this date
    const { data: bookings } = await supabaseAdmin
      .from('auto_bookings')
      .select('appointment_type')
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    const dropoffCount = (bookings || []).filter(b => b.appointment_type === 'dropoff').length;
    const waitingCount = (bookings || []).filter(b => b.appointment_type === 'waiting').length;

    return NextResponse.json({
      available: true,
      dropoffRemaining: Math.max(0, maxDropoff - dropoffCount),
      waitingRemaining: Math.max(0, maxWaiting - waitingCount),
      maxDropoff,
      maxWaiting,
    });
  } catch (error) {
    console.error('Availability check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
