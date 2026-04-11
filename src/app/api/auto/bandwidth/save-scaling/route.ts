import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// POST /api/auto/bandwidth/save-scaling
// Save service duration scaling rows (upsert)
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { scaling } = await req.json();

    if (!scaling || !Array.isArray(scaling)) {
      return NextResponse.json({ error: 'Missing scaling data' }, { status: 400 });
    }

    for (const row of scaling as Array<{ service_key: string; tinter_count: number; duration_minutes: number }>) {
      if (!row.service_key || !row.tinter_count || row.duration_minutes <= 0) continue;
      await supabase
        .from('service_duration_scaling')
        .upsert({
          shop_id: shopId,
          service_key: row.service_key,
          tinter_count: row.tinter_count,
          duration_minutes: row.duration_minutes,
        }, {
          onConflict: 'shop_id,service_key,tinter_count',
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save scaling error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
