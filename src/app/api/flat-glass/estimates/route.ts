import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * GET /api/flat-glass/estimates
 * List all estimates (newest first)
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('estimates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ ok: true, estimates: data })
  } catch (error) {
    console.error('List estimates error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch estimates' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/flat-glass/estimates
 * Create a new estimate
 *
 * Body: { propertyType, customer, selectedFilmType, selectedShade,
 *         totalSqFt, totalWindows, totalPrice, notes, rooms, criteria }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Generate estimate ID: FWT-YYMMDD-###
    const now = new Date()
    const yy = now.getFullYear().toString().slice(-2)
    const mm = (now.getMonth() + 1).toString().padStart(2, '0')
    const dd = now.getDate().toString().padStart(2, '0')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const estimateId = `FWT-${yy}${mm}${dd}-${random}`

    const { data, error } = await supabaseAdmin
      .from('estimates')
      .insert({
        estimate_id: estimateId,
        property_type: body.propertyType || null,
        customer_name: body.customer?.name || null,
        customer_phone: body.customer?.phone || null,
        customer_email: body.customer?.email || null,
        customer_address: body.customer?.address || null,
        selected_film_type: body.selectedFilmType || null,
        selected_shade: body.selectedShade || null,
        total_sqft: body.totalSqFt || 0,
        total_windows: body.totalWindows || 0,
        total_price: body.totalPrice || 0,
        status: 'Draft',
        notes: body.notes || null,
        rooms: body.rooms || [],
        criteria: body.criteria || {},
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      ok: true,
      estimateId,
      estimate: data,
    })
  } catch (error) {
    console.error('Create estimate error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to save estimate' },
      { status: 500 }
    )
  }
}
