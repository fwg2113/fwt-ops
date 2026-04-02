import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * GET /api/flat-glass/estimates/[id]
 * Load a specific estimate by estimate_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('estimates')
      .select('*')
      .eq('estimate_id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: 'Estimate not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, estimate: data })
  } catch (error) {
    console.error('Load estimate error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to load estimate' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/flat-glass/estimates/[id]
 * Update an existing estimate
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data, error } = await supabaseAdmin
      .from('estimates')
      .update(body)
      .eq('estimate_id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, estimate: data })
  } catch (error) {
    console.error('Update estimate error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to update estimate' },
      { status: 500 }
    )
  }
}
