import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// POST /api/auto/bandwidth/confirm-daily
// Save/update daily tinter availability and mark as confirmed
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { date, tinters } = await req.json();

    if (!date || !tinters || !Array.isArray(tinters)) {
      return NextResponse.json({ error: 'Missing date or tinters' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Upsert each tinter's availability
    for (const t of tinters as Array<{
      teamMemberId: string;
      status: 'full_day' | 'partial' | 'off';
      startTime?: string | null;
      endTime?: string | null;
      outRanges?: Array<{ out_at: string; back_at: string; reason?: string }>;
    }>) {
      await supabase
        .from('daily_tinter_availability')
        .upsert({
          shop_id: shopId,
          availability_date: date,
          team_member_id: t.teamMemberId,
          status: t.status,
          start_time: t.status === 'partial' ? t.startTime : null,
          end_time: t.status === 'partial' ? t.endTime : null,
          out_ranges: t.outRanges || [],
          confirmed: true,
          confirmed_at: now,
        }, {
          onConflict: 'shop_id,availability_date,team_member_id',
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Bandwidth confirm-daily error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
