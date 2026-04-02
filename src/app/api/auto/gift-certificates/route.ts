import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/gift-certificates
// Returns all GCs and promos, sorted by most recent first
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_gift_certificates')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to load gift certificates' }, { status: 500 });
    }

    const all = data || [];
    const summary = {
      total: all.length,
      dollarGCs: all.filter(gc => gc.discount_type === 'dollar' && !gc.allow_same_day && gc.amount > 0).length,
      promos: all.filter(gc => gc.discount_type === 'percent').length,
      redeemed: all.filter(gc => gc.redeemed).length,
      unredeemed: all.filter(gc => gc.discount_type === 'dollar' && !gc.redeemed && gc.amount > 0).length,
      totalValue: all.filter(gc => gc.discount_type === 'dollar' && !gc.redeemed).reduce((sum, gc) => sum + Number(gc.amount), 0),
    };

    return NextResponse.json({ giftCertificates: all, summary });
  } catch (error) {
    console.error('GC fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/gift-certificates — create a new GC or promo
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();
    const { data, error } = await supabase
      .from('auto_gift_certificates')
      .insert({ ...body, shop_id: shopId })
      .select()
      .single();

    if (error) {
      console.error('GC create error:', error);
      return NextResponse.json({ error: error.message || 'Failed to create' }, { status: 500 });
    }

    return NextResponse.json({ success: true, giftCertificate: data });
  } catch (error) {
    console.error('GC create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/gift-certificates — update a GC
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { data, error } = await supabase
      .from('auto_gift_certificates')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true, giftCertificate: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
