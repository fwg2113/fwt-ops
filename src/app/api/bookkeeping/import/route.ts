import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

interface ImportRow {
  txn_date?: string;
  amount?: string | number;
  vendor?: string;
  category?: string;
  description?: string;
  payment_method?: string;
  account?: string;
  brand?: string;
  direction?: string; // IN or OUT -- defaults to OUT (expense)
  event_type?: string; // SALE, EXPENSE, FEE, TRANSFER -- defaults to EXPENSE
}

// POST /api/bookkeeping/import
// Bulk import expense transactions from mapped CSV data
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const { rows, posted_by: customPostedBy } = await req.json() as { rows: ImportRow[]; posted_by?: string };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const amount = parseFloat(String(row.amount || '0').replace(/[$,]/g, ''));
        if (!amount || isNaN(amount)) {
          results.skipped++;
          continue;
        }

        // Parse date
        let txnDate = row.txn_date || new Date().toISOString().split('T')[0];
        // Handle common date formats
        if (txnDate.includes('/')) {
          const parts = txnDate.split('/');
          if (parts.length === 3) {
            const [m, d, y] = parts;
            const year = y.length === 2 ? `20${y}` : y;
            txnDate = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        }

        // Determine direction: negative amounts or explicit IN = revenue
        const isNegative = amount < 0;
        let direction = row.direction || 'OUT';
        if (isNegative && !row.direction) direction = 'OUT'; // negative = expense
        const absAmount = Math.abs(amount);

        const eventType = row.event_type || (direction === 'IN' ? 'SALE' : 'EXPENSE');

        // Generate transaction ID
        const { data: txnId } = await supabase
          .rpc('generate_transaction_id', { p_shop_id: shopId });

        const { error } = await supabase
          .from('transactions')
          .insert({
            shop_id: shopId,
            transaction_id: txnId || `TXN-${Date.now()}-${i}`,
            txn_date: txnDate,
            brand: row.brand || 'default',
            direction,
            event_type: eventType,
            amount: absAmount,
            account: row.account || null,
            category: row.category || 'Miscellaneous',
            vendor_or_customer: row.vendor || null,
            payment_method: row.payment_method || null,
            memo: row.description || null,
            posted_by: customPostedBy || 'csv_import',
          });

        if (error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.imported++;
        }
      } catch (rowErr) {
        results.errors.push(`Row ${i + 1}: ${String(rowErr)}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Expense import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
});
