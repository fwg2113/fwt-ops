import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * POST /api/flat-glass/calculate-price
 * Calculates price for a flat glass estimate
 *
 * Body: { filmCode, totalSqFt, windowCount }
 * Returns: { filmCost, markup, totalPrice, pricePerSqFt, minimumApplied }
 */
export async function POST(request: NextRequest) {
  try {
    const { filmCode, totalSqFt, windowCount } = await request.json()

    if (!filmCode || !totalSqFt) {
      return NextResponse.json(
        { ok: false, error: 'filmCode and totalSqFt are required' },
        { status: 400 }
      )
    }

    // Get film shade pricing
    const { data: shade } = await supabaseAdmin
      .from('film_shades')
      .select('price_sqft_60')
      .eq('film_code', filmCode)
      .single()

    const pricePerSqFt = shade?.price_sqft_60 || 0

    // Get settings for markup and minimum charge
    const { data: settingsRows } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['default_markup', 'minimum_charge'])

    const settings: Record<string, string> = {}
    for (const row of settingsRows || []) {
      settings[row.key] = row.value
    }

    const markup = parseFloat(settings.default_markup) || 8
    const minimumCharge = parseFloat(settings.minimum_charge) || 150

    // Calculate: film cost * markup
    const filmCost = totalSqFt * pricePerSqFt
    let totalPrice = filmCost * markup

    // Apply quantity discount if applicable
    if (windowCount) {
      const { data: discounts } = await supabaseAdmin
        .from('quantity_discounts')
        .select('*')
        .order('min_panes')

      for (const tier of discounts || []) {
        const inRange =
          windowCount >= tier.min_panes &&
          (tier.max_panes === null || windowCount <= tier.max_panes)
        if (inRange && tier.discount_percent > 0) {
          totalPrice = totalPrice * (1 - tier.discount_percent / 100)
          break
        }
      }
    }

    // Apply minimum charge
    const minimumApplied = totalPrice < minimumCharge
    if (minimumApplied) {
      totalPrice = minimumCharge
    }

    return NextResponse.json({
      ok: true,
      filmCost: Math.round(filmCost * 100) / 100,
      markup,
      totalPrice: Math.round(totalPrice * 100) / 100,
      pricePerSqFt: Math.round(pricePerSqFt * markup * 100) / 100,
      minimumApplied,
    })
  } catch (error) {
    console.error('Calculate price error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to calculate price' },
      { status: 500 }
    )
  }
}
