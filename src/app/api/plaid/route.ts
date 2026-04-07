import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import {
  createLinkToken, exchangePublicToken, fetchTransactions, removeItem,
  categorizeTransaction, isIncomeTransaction, isDuplicate, cleanVendorName,
  type VendorMapping, type PlaidTransaction,
} from '@/app/lib/plaid';

// ============================================================================
// GET /api/plaid -- list connected accounts + vendor mappings
// ============================================================================
export const GET = withShopAuth(async ({ shopId }) => {
  const supabase = getAdminClient();

  const [connectionsRes, mappingsRes] = await Promise.all([
    supabase.from('plaid_connections').select('id, institution_name, account_name, default_brand, active, connected_at')
      .eq('shop_id', shopId).eq('active', true).order('connected_at'),
    supabase.from('vendor_mappings').select('*')
      .eq('shop_id', shopId).eq('active', true).order('sort_order'),
  ]);

  return NextResponse.json({
    connections: connectionsRes.data || [],
    vendorMappings: mappingsRes.data || [],
  });
});

// ============================================================================
// POST /api/plaid -- actions: link_token, exchange, fetch, disconnect, save_rule, delete_rule
// ============================================================================
export const POST = withShopAuth(async ({ shopId, req }) => {
  const supabase = getAdminClient();
  const body = await req.json();
  const { action, data } = body;

  // --- Create Link Token (for connecting new bank) ---
  if (action === 'link_token') {
    try {
      const result = await createLinkToken(`shop-${shopId}`);
      return NextResponse.json({ link_token: result.link_token });
    } catch (err) {
      console.error('Link token error:', err);
      return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
    }
  }

  // --- Exchange Public Token (after Plaid Link completes) ---
  if (action === 'exchange') {
    const { public_token, institution_name, institution_id, account_name } = data;
    try {
      const result = await exchangePublicToken(public_token);
      // Store connection
      const { error } = await supabase.from('plaid_connections').insert({
        shop_id: shopId,
        item_id: result.item_id,
        access_token: result.access_token,
        institution_name: institution_name || 'Unknown',
        institution_id: institution_id || null,
        account_name: account_name || institution_name || 'Bank Account',
        default_brand: 'default',
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, item_id: result.item_id });
    } catch (err) {
      console.error('Exchange token error:', err);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
    }
  }

  // --- Fetch Transactions from Bank ---
  if (action === 'fetch') {
    const { connection_id, start_date, end_date } = data;

    // Get connection
    const { data: connection } = await supabase.from('plaid_connections')
      .select('*').eq('id', connection_id).eq('shop_id', shopId).single();
    if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

    // Get vendor mappings for categorization
    const { data: mappingsData } = await supabase.from('vendor_mappings')
      .select('pattern, category, vendor_name, brand, filter_out')
      .eq('shop_id', shopId).eq('active', true);
    const vendorMappings: VendorMapping[] = (mappingsData || []).map(m => ({
      pattern: m.pattern,
      category: m.category,
      vendor_name: m.vendor_name,
      brand: m.brand,
      filter_out: m.filter_out,
    }));

    // Get existing transactions for duplicate detection (last 500)
    const { data: existingTxns } = await supabase.from('transactions')
      .select('txn_date, amount, direction')
      .eq('shop_id', shopId)
      .order('txn_date', { ascending: false })
      .limit(500);

    // Fetch from Plaid
    let plaidTxns: PlaidTransaction[];
    try {
      plaidTxns = await fetchTransactions(connection.access_token, start_date, end_date);
    } catch (err) {
      console.error('Plaid fetch error:', err);
      return NextResponse.json({ error: 'Failed to fetch from bank' }, { status: 500 });
    }

    // Process transactions
    const processed = [];
    const filtered = []; // income, pending, filtered-out
    for (const txn of plaidTxns) {
      // Skip pending
      if (txn.pending) {
        filtered.push({ date: txn.date, description: txn.name, amount: txn.amount, reason: 'Pending' });
        continue;
      }

      // Skip income
      if (isIncomeTransaction(txn.name, txn.amount)) {
        filtered.push({ date: txn.date, description: txn.name, amount: txn.amount, reason: 'Income' });
        continue;
      }

      // Auto-categorize
      const cat = categorizeTransaction(txn.name, txn.category, vendorMappings);

      // Filtered-out by vendor mapping rule
      if (cat.filterOut) {
        filtered.push({ date: txn.date, description: txn.name, amount: Math.abs(txn.amount), reason: 'Filter Rule' });
        continue;
      }

      // Duplicate detection
      const duplicate = isDuplicate(txn.date, txn.amount, existingTxns || []);

      // Clean vendor name
      const vendor = cat.vendor || (txn.merchant_name ? cleanVendorName(txn.merchant_name) : cleanVendorName(txn.name));

      processed.push({
        plaid_id: txn.transaction_id,
        date: txn.date,
        description: txn.name,
        amount: Math.abs(txn.amount),
        category: cat.category,
        vendor,
        brand: cat.brand || connection.default_brand || 'default',
        duplicate,
        selected: !duplicate && !!cat.category,
        account: connection.account_name,
      });
    }

    return NextResponse.json({
      transactions: processed,
      filtered,
      total: plaidTxns.length,
      filteredCount: filtered.length,
    });
  }

  // --- Disconnect Bank Account ---
  if (action === 'disconnect') {
    const { connection_id } = data;
    const { data: connection } = await supabase.from('plaid_connections')
      .select('access_token').eq('id', connection_id).eq('shop_id', shopId).single();
    if (connection) {
      try { await removeItem(connection.access_token); } catch { /* ok if fails */ }
    }
    await supabase.from('plaid_connections').update({ active: false }).eq('id', connection_id);
    return NextResponse.json({ success: true });
  }

  // --- Save Vendor Mapping Rule ---
  if (action === 'save_rule') {
    const { pattern, category, vendor_name, brand, filter_out } = data;
    if (!pattern || (!category && !filter_out)) return NextResponse.json({ error: 'pattern and category required' }, { status: 400 });
    const { error } = await supabase.from('vendor_mappings').insert({
      shop_id: shopId, pattern, category, vendor_name: vendor_name || null,
      brand: brand || null, filter_out: filter_out || false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Delete Vendor Mapping Rule ---
  if (action === 'delete_rule') {
    const { rule_id } = data;
    await supabase.from('vendor_mappings').update({ active: false }).eq('id', rule_id).eq('shop_id', shopId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
