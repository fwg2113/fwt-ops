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

    const brand = searchParams.get('brand'); // Filter: 'FWT', 'FWG', 'FA', 'SHARED', or null for combined

    const supabase = getAdminClient();

    // Fetch P&L-excluded categories
    const { data: excludedCats } = await supabase
      .from('expense_categories')
      .select('name')
      .eq('shop_id', shopId)
      .eq('pl_exclude', true);
    const excludedNames = new Set((excludedCats || []).map(c => c.name));

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

    // Get shared expense splits for brand-specific views
    let sharedSplits: Record<string, number> = {};
    if (brand && brand !== 'SHARED') {
      const { data: config } = await supabase
        .from('shop_config')
        .select('shared_expense_splits')
        .eq('id', shopId)
        .single();
      sharedSplits = (config?.shared_expense_splits || {}) as Record<string, number>;
    }

    const brandSplitWeight = (brand && sharedSplits[brand]) ? sharedSplits[brand] : 0;

    // Aggregate by category and direction
    const revenue: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    let totalRevenue = 0;
    let totalExpenses = 0;
    let sharedExpenseAllocation = 0;

    for (const txn of (transactions || [])) {
      const amt = Number(txn.amount) || 0;
      const txnBrand = txn.brand || 'default';

      // Skip P&L-excluded categories
      if (excludedNames.has(txn.category)) continue;

      // Brand filtering logic
      if (brand) {
        if (brand === 'SHARED') {
          // Only show SHARED transactions
          if (txnBrand !== 'SHARED') continue;
        } else {
          // Show this brand's transactions + allocated portion of SHARED
          if (txnBrand === 'SHARED') {
            // Allocate shared expenses/revenue by split weight
            if (brandSplitWeight > 0) {
              const allocated = amt * brandSplitWeight;
              if (txn.direction === 'IN') {
                revenue[txn.category] = (revenue[txn.category] || 0) + allocated;
                totalRevenue += allocated;
              } else {
                expenses[txn.category] = (expenses[txn.category] || 0) + allocated;
                totalExpenses += allocated;
                sharedExpenseAllocation += allocated;
              }
            }
            continue;
          }
          // Skip transactions from other brands (including 'default' -- only show exact brand matches)
          if (txnBrand !== brand) continue;
        }
      }

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
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const expensesSorted = Object.entries(expenses)
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      brand: brand || 'combined',
      revenue: revenueSorted,
      expenses: expensesSorted,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netProfit: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      sharedExpenseAllocation: Math.round(sharedExpenseAllocation * 100) / 100,
      transactionCount: (transactions || []).length,
    });
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
