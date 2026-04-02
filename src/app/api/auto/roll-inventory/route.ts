import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/roll-inventory
// Returns all active roll IDs grouped by film/shade
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_roll_inventory')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('film_id')
      .order('shade_id');

    if (error) {
      console.error('Roll inventory fetch error:', error);
      return NextResponse.json({ error: 'Failed to load roll inventory' }, { status: 500 });
    }

    return NextResponse.json({ rolls: data || [] });
  } catch (error) {
    console.error('Roll inventory error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/roll-inventory
// Bulk upsert roll IDs — receives an array of { film_id, shade_id, roll_id }
// For each entry: if an active roll exists for that film/shade, update the roll_id.
// If not, insert a new active roll.
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { rolls } = await req.json() as {
      rolls: { film_id: number; shade_id: number; roll_id: string }[];
    };

    if (!rolls || !Array.isArray(rolls)) {
      return NextResponse.json({ error: 'rolls array required' }, { status: 400 });
    }

    // Filter to only entries with a non-empty roll_id
    const toSave = rolls.filter(r => r.roll_id && r.roll_id.trim());
    // Entries with empty roll_id — deactivate any existing active roll
    const toDeactivate = rolls.filter(r => !r.roll_id || !r.roll_id.trim());

    // Upsert active rolls
    for (const r of toSave) {
      // Check if active roll exists for this film/shade
      const { data: existing } = await supabase
        .from('auto_roll_inventory')
        .select('id')
        .eq('shop_id', shopId)
        .eq('film_id', r.film_id)
        .eq('shade_id', r.shade_id)
        .eq('is_active', true)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('auto_roll_inventory')
          .update({ roll_id: r.roll_id.trim(), updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabase
          .from('auto_roll_inventory')
          .insert({
            shop_id: shopId,
            film_id: r.film_id,
            shade_id: r.shade_id,
            roll_id: r.roll_id.trim(),
            is_active: true,
          });
      }
    }

    // Deactivate rolls that were cleared
    for (const r of toDeactivate) {
      await supabase
        .from('auto_roll_inventory')
        .update({ is_active: false, depleted_at: new Date().toISOString() })
        .eq('shop_id', shopId)
        .eq('film_id', r.film_id)
        .eq('shade_id', r.shade_id)
        .eq('is_active', true);
    }

    return NextResponse.json({ success: true, saved: toSave.length, deactivated: toDeactivate.length });
  } catch (error) {
    console.error('Roll inventory save error:', error);
    return NextResponse.json({ error: 'Failed to save roll inventory' }, { status: 500 });
  }
});
