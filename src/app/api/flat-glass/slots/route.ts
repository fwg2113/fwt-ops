import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * GET /api/flat-glass/slots?date=2026-03-20&duration=60
 * Returns available time slots for a given date
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const durationMin = parseInt(searchParams.get('duration') || '60')

    if (!dateStr) {
      return NextResponse.json(
        { ok: false, error: 'date parameter is required' },
        { status: 400 }
      )
    }

    // Check if date is closed
    const { data: closedDates } = await supabaseAdmin
      .from('closed_dates')
      .select('closed_date')
      .eq('closed_date', dateStr)

    if (closedDates && closedDates.length > 0) {
      return NextResponse.json({
        ok: true,
        slots: [],
        message: 'This date is not available',
      })
    }

    // Get day of week from date
    const date = new Date(dateStr + 'T12:00:00')
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })

    // Get schedule for this day
    const { data: scheduleRow } = await supabaseAdmin
      .from('schedule')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .single()

    if (!scheduleRow || !scheduleRow.enabled || scheduleRow.max_appointments <= 0) {
      return NextResponse.json({
        ok: true,
        slots: [],
        message: `Not available on ${dayOfWeek}`,
      })
    }

    // Generate time slots
    let slots: string[]

    if (scheduleRow.available_slots) {
      // Use specific slots from schedule
      slots = scheduleRow.available_slots.split('|').map((s: string) => s.trim()).filter(Boolean)
    } else if (scheduleRow.open_time && scheduleRow.close_time) {
      // Generate slots from time range
      slots = generateTimeSlots(scheduleRow.open_time, scheduleRow.close_time, 60)
    } else {
      return NextResponse.json({
        ok: true,
        slots: [],
        message: `No time slots configured for ${dayOfWeek}`,
      })
    }

    // Count existing appointments for this date
    const { count: existingCount } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('appointment_date', dateStr)
      .neq('status', 'cancelled')

    const maxAppointments = scheduleRow.max_appointments || 3
    const currentCount = existingCount || 0

    // Check availability for each slot
    const availableSlots = await Promise.all(
      slots.map(async (time) => {
        // Check for conflicts at this specific time
        const timeFormatted = convertTo24Hour(time)
        const { count: conflictCount } = await supabaseAdmin
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_date', dateStr)
          .eq('start_time', timeFormatted)
          .neq('status', 'cancelled')

        return {
          time,
          available: currentCount < maxAppointments && (conflictCount || 0) === 0,
        }
      })
    )

    return NextResponse.json({ ok: true, slots: availableSlots })
  } catch (error) {
    console.error('Slots fetch error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch available slots' },
      { status: 500 }
    )
  }
}

function generateTimeSlots(openTime: string, closeTime: string, intervalMin: number): string[] {
  const slots: string[] = []
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)

  let currentMinutes = openH * 60 + openM
  const endMinutes = closeH * 60 + closeM

  while (currentMinutes < endMinutes) {
    const h = Math.floor(currentMinutes / 60)
    const m = currentMinutes % 60
    const period = h >= 12 ? 'PM' : 'AM'
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
    slots.push(`${displayH}:${m.toString().padStart(2, '0')} ${period}`)
    currentMinutes += intervalMin
  }

  return slots
}

function convertTo24Hour(time: string): string {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return time

  let hours = parseInt(match[1])
  const minutes = match[2]
  const period = match[3].toUpperCase()

  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  return `${hours.toString().padStart(2, '0')}:${minutes}:00`
}
