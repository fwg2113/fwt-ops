import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * GET /api/flat-glass/config
 * Returns all configuration data needed to load the configurator:
 * film types, shades, settings, distance zones, room types, quantity discounts, schedule
 */
export async function GET() {
  try {
    const [
      filmTypesRes,
      filmShadesRes,
      settingsRes,
      distanceZonesRes,
      roomTypesRes,
      quantityDiscountsRes,
      scheduleRes,
    ] = await Promise.all([
      supabaseAdmin.from('film_types').select('*').eq('active', true).order('tier'),
      supabaseAdmin.from('film_shades').select('*').eq('active', true),
      supabaseAdmin.from('settings').select('*'),
      supabaseAdmin.from('distance_zones').select('*').order('sort_order'),
      supabaseAdmin.from('room_types').select('*').eq('active', true).order('sort_order'),
      supabaseAdmin.from('quantity_discounts').select('*').order('sort_order'),
      supabaseAdmin.from('schedule').select('*'),
    ])

    // Convert settings rows to key-value object
    const settings: Record<string, string> = {}
    for (const row of settingsRes.data || []) {
      settings[row.key] = row.value
    }

    return NextResponse.json({
      ok: true,
      filmTypes: filmTypesRes.data || [],
      filmShades: filmShadesRes.data || [],
      settings,
      distanceZones: distanceZonesRes.data || [],
      roomTypes: roomTypesRes.data || [],
      quantityDiscounts: quantityDiscountsRes.data || [],
      schedule: scheduleRes.data || [],
    })
  } catch (error) {
    console.error('Config fetch error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to load configuration' },
      { status: 500 }
    )
  }
}
