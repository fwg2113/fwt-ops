import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'
import { sendSubmissionEmails } from '@/app/lib/email'

/**
 * POST /api/flat-glass/submit
 * Submit a flat glass quote (save, schedule visit, or commit to book)
 *
 * Body: {
 *   path: 'save' | 'visit' | 'commit',
 *   contact: { name, email, phone, address },
 *   filmId, filmName,
 *   rooms: [...],
 *   totals: { totalWindows, totalSqFt, hasOversized },
 *   price, commitPrice, depositAmount, visitFee,
 *   answers: { problems, appearance, lightPreference, warmCool, timeline },
 *   distanceMiles,
 *   appointment: { date, slot }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.contact?.name || !body.contact?.email || !body.contact?.phone) {
      return NextResponse.json(
        { ok: false, error: 'Contact information is required (name, email, phone)' },
        { status: 400 }
      )
    }

    if (!body.path || !['save', 'visit', 'commit'].includes(body.path)) {
      return NextResponse.json(
        { ok: false, error: 'Valid path is required (save, visit, or commit)' },
        { status: 400 }
      )
    }

    // Generate submission ID
    const now = new Date()
    const prefix = body.path === 'save' ? 'FGS' : body.path === 'visit' ? 'FGV' : 'FGC'
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15)
    const submissionId = `${prefix}-${timestamp}`

    // Determine initial status
    const status = body.requiresReview ? 'Pending Review' : 'New'

    // Convert appointment time to 24h format for storage
    let appointmentTime = null
    if (body.appointment?.slot) {
      appointmentTime = convertTo24Hour(body.appointment.slot)
    }

    // Save submission
    const { data: submission, error: submitError } = await supabaseAdmin
      .from('submissions')
      .insert({
        submission_id: submissionId,
        path: body.path,
        status,
        customer_name: body.contact.name,
        customer_email: body.contact.email,
        customer_phone: body.contact.phone,
        customer_address: body.contact.address || null,
        film_id: body.filmId || null,
        film_name: body.filmName || null,
        total_windows: body.totals?.totalWindows || 0,
        total_sqft: body.totals?.totalSqFt || 0,
        has_oversized: body.totals?.hasOversized || false,
        rooms: body.rooms || [],
        price: body.price || 0,
        override_price: body.overridePrice || null,
        commit_price: body.commitPrice || null,
        deposit_amount: body.depositAmount || null,
        discount_percent: body.discount || 0,
        visit_fee: body.visitFee || null,
        promo_code: body.promoCode || null,
        retail_price: body.retailPrice || 0,
        pricing_multiplier: body.pricingMultiplier || 1.35,
        base_discount: body.baseDiscount || 0.25,
        property_type: body.propertyType || null,
        problems: Array.isArray(body.answers?.problems)
          ? body.answers.problems.join(', ')
          : body.answers?.problems || null,
        appearance: body.answers?.appearance || null,
        light_preference: body.answers?.lightPreference || null,
        warm_cool: body.answers?.warmCool || null,
        timeline: body.answers?.timeline || null,
        distance_miles: body.distanceMiles || null,
        appointment_date: body.appointment?.date || null,
        appointment_time: appointmentTime,
        room_photo_count: body.roomPhotoCount || 0,
      })
      .select()
      .single()

    if (submitError) throw submitError

    // Create appointment if date/time provided and not pending review
    let appointmentId = null
    if (
      !body.requiresReview &&
      body.appointment?.date &&
      body.appointment?.slot
    ) {
      const startTime = appointmentTime || '09:00:00'
      const durationMinutes = 60
      const endTime = addMinutesToTime(startTime, durationMinutes)

      const { data: appointment, error: apptError } = await supabaseAdmin
        .from('appointments')
        .insert({
          submission_id: submissionId,
          appointment_date: body.appointment.date,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: durationMinutes,
          customer_name: body.contact.name,
          customer_phone: body.contact.phone,
          customer_email: body.contact.email,
          customer_address: body.contact.address || null,
          title: `${body.filmName || 'Flat Glass'} - ${body.contact.name}`,
          description: `${body.totals?.totalWindows || 0} windows, ${body.totals?.totalSqFt || 0} sq ft`,
          job_type: 'flat_glass',
          status: 'scheduled',
        })
        .select()
        .single()

      if (!apptError && appointment) {
        appointmentId = appointment.id

        // Update submission with event reference
        await supabaseAdmin
          .from('submissions')
          .update({ event_id: appointment.id })
          .eq('submission_id', submissionId)
      }
    }

    // Send confirmation emails (customer + team)
    try {
      const totalWindows = body.totals?.totalWindows || 0
      const totalSqFt = body.totals?.totalSqFt || 0
      const retailPrice = body.retailPrice || 0
      const finalPrice = body.price || 0
      const discountPct = body.discount ? Math.round(body.discount * 100) : 25

      await sendSubmissionEmails({
        submissionId,
        path: body.path,
        customerName: body.contact.name,
        customerEmail: body.contact.email,
        customerPhone: body.contact.phone,
        customerAddress: body.contact.address || '',
        propertyType: body.propertyType || null,
        filmName: body.filmName || null,
        totalWindows,
        totalSqFt,
        retailPrice,
        finalPrice,
        savings: retailPrice - finalPrice,
        discountPercent: discountPct,
        depositAmount: body.depositAmount || null,
        promoCode: body.promoCode || null,
        rooms: body.rooms || [],
      })
    } catch (emailErr) {
      console.error('Email send error (non-blocking):', emailErr)
    }

    const message =
      body.path === 'save'
        ? 'Your quote has been saved!'
        : body.requiresReview
          ? "Submitted for review! We'll send your payment link within 1 business day."
          : 'Your request has been submitted!'

    return NextResponse.json({
      ok: true,
      submissionId,
      appointmentId,
      message,
    })
  } catch (error) {
    console.error('Submit error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to submit. Please try again.' },
      { status: 500 }
    )
  }
}

function convertTo24Hour(time: string): string {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return '09:00:00'

  let hours = parseInt(match[1])
  const minutes = match[2]
  const period = match[3].toUpperCase()

  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  return `${hours.toString().padStart(2, '0')}:${minutes}:00`
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m + minutes
  const newH = Math.floor(totalMinutes / 60)
  const newM = totalMinutes % 60
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}:00`
}
