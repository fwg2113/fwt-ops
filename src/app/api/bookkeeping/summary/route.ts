import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/bookkeeping/summary?month=YYYY-MM or year=YYYY
// Returns P&L summary: revenue by category, expenses by category, totals
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM
    const year = searchParams.get('year');   // YYYY

    let startDate: string;
    let endDate: string;

    if (month) {
      startDate = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      endDate = new Date(y, m, 0).toISOString().split('T')[0];
    } else if (year) {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    } else {
      // Default to current month
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${y}-${m}-01`;
      endDate = new Date(y, now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const supabase = getAdminClient();

    // Fetch all transactions for the period
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('direction, category, amount, brand')
      .eq('shop_id', shopId)
      .gte('txn_date', startDate)
      .lte('txn_date', endDate);

    if (error) {
      console.error('Summary fetch error:', error);
      return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 });
    }

    // Aggregate by category and direction
    const revenue: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const txn of (transactions || [])) {
      const amt = Number(txn.amount) || 0;
      if (txn.direction === 'IN') {
        revenue[txn.category] = (revenue[txn.category] || 0) + amt;
        totalRevenue += amt;
      } else {
        expenses[txn.category] = (expenses[txn.category] || 0) + amt;
        totalExpenses += amt;
      }
    }

    // Sort by amount descending
    const revenueSorted = Object.entries(revenue)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const expensesSorted = Object.entries(expenses)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      revenue: revenueSorted,
      expenses: expensesSorted,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      transactionCount: (transactions || []).length,
    });
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
