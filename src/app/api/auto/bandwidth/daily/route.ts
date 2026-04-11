import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/bandwidth/daily?date=2026-04-12
// Returns tinter availability for a given date + bandwidth config
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get shop bandwidth config
    const { data: config } = await supabase
      .from('shop_config')
      .select('bandwidth_engine_enabled, bandwidth_confirmation_time, default_tinter_ids')
      .eq('id', shopId)
      .single();

    if (!config?.bandwidth_engine_enabled) {
      return NextResponse.json({ enabled: false });
    }

    // Get daily tinter availability
    const { data: availability } = await supabase
      .from('daily_tinter_availability')
      .select('*, team_members(id, name)')
      .eq('shop_id', shopId)
      .eq('availability_date', date);

    // Get default tinters (for pre-fill when no availability set)
    const defaultIds = config.default_tinter_ids || [];
    const { data: defaultTinters } = await supabase
      .from('team_members')
      .select('id, name')
      .in('id', defaultIds.length > 0 ? defaultIds : ['00000000-0000-0000-0000-000000000000']);

    // Get duration scaling config
    const { data: scaling } = await supabase
      .from('service_duration_scaling')
      .select('*')
      .eq('shop_id', shopId);

    // Check if day is confirmed
    const isConfirmed = (availability || []).some(a => a.confirmed);

    return NextResponse.json({
      enabled: true,
      date,
      confirmationTime: config.bandwidth_confirmation_time,
      defaultTinterIds: defaultIds,
      defaultTinters: defaultTinters || [],
      isConfirmed,
      availability: (availability || []).map(a => ({
        id: a.id,
        teamMemberId: a.team_member_id,
        teamMemberName: (a.team_members as { name: string })?.name || '',
        status: a.status,
        startTime: a.start_time,
        endTime: a.end_time,
        outRanges: a.out_ranges || [],
        confirmed: a.confirmed,
        confirmedAt: a.confirmed_at,
      })),
      scaling: scaling || [],
    });
  } catch (err) {
    console.error('Bandwidth daily error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});
