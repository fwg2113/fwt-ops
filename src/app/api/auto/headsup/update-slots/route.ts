import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// POST /api/auto/headsup/update-slots
// Dashboard: add or remove slots from an active offer/pool without re-sending SMS
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { offerId, poolId, slots } = await req.json();

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Missing slots' }, { status: 400 });
    }

    if (poolId) {
      // Pool mode: update shared slots, preserving claimed/held state
      const { data: pool, error: poolErr } = await supabase
        .from('headsup_pools')
        .select('*')
        .eq('id', poolId)
        .eq('shop_id', shopId)
        .single();

      if (poolErr || !pool) {
        return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
      }

      const existingSlots = (pool.slots || []) as Array<{ time: string; claimed_by: string | null; held_by?: string | null; held_at?: string | null }>;

      // Build new slot list: keep claimed/held state for existing times, add new ones
      const newSlots = slots.map((time: string) => {
        const existing = existingSlots.find(s => s.time === time);
        if (existing) return existing; // preserve claimed_by, held_by, held_at
        return { time, claimed_by: null, held_by: null, held_at: null };
      });

      await supabase
        .from('headsup_pools')
        .update({ slots: newSlots })
        .eq('id', poolId);

      return NextResponse.json({ success: true, mode: 'pool', slotCount: newSlots.length });
    } else if (offerId) {
      // Individual mode: update offered_slots, preserving claimed/held state
      const { data: offer, error: offerErr } = await supabase
        .from('headsup_offers')
        .select('*')
        .eq('id', offerId)
        .eq('shop_id', shopId)
        .single();

      if (offerErr || !offer) {
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }

      const existingSlots = (offer.offered_slots || []) as Array<{ time: string; status: string; held?: string; held_at?: string | null }>;

      const newSlots = slots.map((time: string) => {
        const existing = existingSlots.find(s => s.time === time);
        if (existing) return existing;
        return { time, status: 'available' };
      });

      await supabase
        .from('headsup_offers')
        .update({ offered_slots: newSlots })
        .eq('id', offer.id);

      return NextResponse.json({ success: true, mode: 'individual', slotCount: newSlots.length });
    }

    return NextResponse.json({ error: 'Missing offerId or poolId' }, { status: 400 });
  } catch (err) {
    console.error('Headsup update-slots error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
