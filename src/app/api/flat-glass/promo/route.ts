import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-server'

/**
 * POST /api/flat-glass/promo
 * Validate a promo code and return its discount
 *
 * Body: { code: string }
 * Returns: { valid: boolean, discount?: number, label?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false })
    }

    const normalized = code.trim().toUpperCase()

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('code, discount, max_uses, current_uses, starts_at, expires_at, active')
      .eq('code', normalized)
      .single()

    if (error || !data || !data.active) {
      return NextResponse.json({ valid: false })
    }

    // Check expiration
    const now = new Date()
    if (data.starts_at && new Date(data.starts_at) > now) {
      return NextResponse.json({ valid: false })
    }
    if (data.expires_at && new Date(data.expires_at) < now) {
      return NextResponse.json({ valid: false })
    }

    // Check max uses
    if (data.max_uses && data.current_uses >= data.max_uses) {
      return NextResponse.json({ valid: false })
    }

    const discountPercent = Math.round(Number(data.discount) * 100)

    return NextResponse.json({
      valid: true,
      discount: Number(data.discount),
      label: `${discountPercent}% Off`,
    })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
