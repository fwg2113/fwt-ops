import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// ============================================================================
// GET /api/auto/payroll/entries?period_id=123
// Returns all pay entries for a specific pay period, grouped by team member
// ============================================================================
export const GET = withShopAuth(async ({ shopId, req }) => {
  const supabase = getAdminClient();
  const periodId = req.nextUrl.searchParams.get('period_id');

  if (!periodId) {
    return NextResponse.json({ error: 'period_id required' }, { status: 400 });
  }

  const { data: entries, error } = await supabase
    .from('team_pay_entries')
    .select('*, team_members(name, role)')
    .eq('shop_id', shopId)
    .eq('pay_period_id', parseInt(periodId))
    .order('team_member_id')
    .order('entry_type');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by team member
  const grouped: Record<string, {
    team_member_id: string;
    name: string;
    entries: typeof entries;
    base_total: number;
    commission_total: number;
    bonus_total: number;
    adjustment_total: number;
    gross_total: number;
  }> = {};

  for (const entry of (entries || [])) {
    const memberId = entry.team_member_id;
    if (!grouped[memberId]) {
      const memberData = entry.team_members as unknown as { name: string; role: string } | null;
      grouped[memberId] = {
        team_member_id: memberId,
        name: memberData?.name || 'Unknown',
        entries: [],
        base_total: 0,
        commission_total: 0,
        bonus_total: 0,
        adjustment_total: 0,
        gross_total: 0,
      };
    }
    grouped[memberId].entries.push(entry);

    const amount = Number(entry.amount || 0);
    if (entry.entry_type === 'base') grouped[memberId].base_total += amount;
    else if (entry.entry_type === 'commission') grouped[memberId].commission_total += amount;
    else if (entry.entry_type === 'bonus_pool') grouped[memberId].bonus_total += amount;
    else if (['adjustment', 'cold_to_hot', 'draw_advance'].includes(entry.entry_type)) grouped[memberId].adjustment_total += amount;
    grouped[memberId].gross_total += amount;
  }

  return NextResponse.json({
    entries: entries || [],
    byMember: Object.values(grouped),
  });
});
