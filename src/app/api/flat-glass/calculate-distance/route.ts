import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * POST /api/flat-glass/calculate-distance
 * Calculates driving distance from business to customer address
 * and returns the appropriate consultation fee zone
 *
 * Body: { address }
 * Returns: { distance, zone }
 */
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address) {
      return NextResponse.json(
        { ok: false, error: 'Address is required' },
        { status: 400 }
      )
    }

    // Get business location from settings
    const { data: settingsRows } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['business_address', 'business_lat', 'business_lng'])

    const settings: Record<string, string> = {}
    for (const row of settingsRows || []) {
      settings[row.key] = row.value
    }

    const businessAddress = settings.business_address || process.env.SHOP_ADDRESS || ''

    // Use Google Maps Distance Matrix API
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      // Fallback: return a placeholder response when no API key is configured
      return NextResponse.json({
        ok: true,
        distance: null,
        duration: null,
        zone: null,
        message: 'Distance calculation not configured. Please contact us for a consultation fee quote.',
      })
    }

    const encodedOrigin = encodeURIComponent(businessAddress)
    const encodedDest = encodeURIComponent(address)
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodedOrigin}&destinations=${encodedDest}&units=imperial&key=${apiKey}`

    const response = await fetch(url)
    const data = await response.json()

    if (
      data.status !== 'OK' ||
      !data.rows?.[0]?.elements?.[0] ||
      data.rows[0].elements[0].status !== 'OK'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Could not calculate distance. Please check the address.' },
        { status: 400 }
      )
    }

    const element = data.rows[0].elements[0]
    const distanceMeters = element.distance.value
    const distanceMiles = Math.round((distanceMeters / 1609.34) * 10) / 10

    // Get distance zones
    const { data: zones } = await supabaseAdmin
      .from('distance_zones')
      .select('*')
      .order('sort_order')

    // Find matching zone
    let matchedZone = null
    for (const zone of zones || []) {
      if (zone.max_miles === null) {
        // Open-ended zone (e.g., 50+ miles)
        if (distanceMiles >= zone.min_miles) {
          matchedZone = zone
        }
      } else if (distanceMiles >= zone.min_miles && distanceMiles <= zone.max_miles) {
        matchedZone = zone
        break
      }
    }

    return NextResponse.json({
      ok: true,
      distance: distanceMiles,
      duration: element.duration.text,
      zone: matchedZone,
    })
  } catch (error) {
    console.error('Distance calculation error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to calculate distance' },
      { status: 500 }
    )
  }
}
