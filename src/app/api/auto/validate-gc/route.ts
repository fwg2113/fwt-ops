import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/validate-gc
// Validates a gift certificate or promo code
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'No code provided' });
    }

    const trimmedCode = code.trim().toLowerCase();

    const { data: gc, error } = await supabaseAdmin
      .from('auto_gift_certificates')
      .select('*')
      .ilike('gc_code', trimmedCode)
      .single();

    if (error || !gc) {
      return NextResponse.json({ valid: false, error: 'Code not found' });
    }

    // Check if already redeemed (dollar GCs only — percent promos can be reused)
    if (gc.discount_type === 'dollar' && gc.redeemed) {
      return NextResponse.json({ valid: false, error: 'This gift certificate has already been redeemed' });
    }

    // Check date bounds for percent promos
    const now = new Date();
    if (gc.start_date && new Date(gc.start_date) > now) {
      return NextResponse.json({ valid: false, error: 'This promo code is not yet active' });
    }
    if (gc.end_date && new Date(gc.end_date) < now) {
      return NextResponse.json({ valid: false, error: 'This promo code has expired' });
    }

    return NextResponse.json({
      valid: true,
      code: gc.gc_code,
      discountType: gc.discount_type,
      amount: gc.amount,
      chargeDeposit: gc.charge_deposit,
      disableDefaultDiscounts: gc.disable_default_discounts,
      allowSameDay: gc.allow_same_day,
      promoNote: gc.promo_note,
    });
  } catch (error) {
    console.error('GC validation error:', error);
    return NextResponse.json({ valid: false, error: 'Validation failed' });
  }
}
