import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/bookkeeping?type=transactions|categories&month=YYYY-MM&direction=IN|OUT&category=&limit=&offset=
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'transactions';

    const supabase = getAdminClient();

    if (type === 'categories') {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('shop_id', shopId)
        .eq('active', true)
        .order('type')
        .order('sort_order');

      if (error) return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
      return NextResponse.json({ categories: data || [] });
    }

    // Transactions query
    const month = searchParams.get('month'); // YYYY-MM
    const direction = searchParams.get('direction'); // IN or OUT
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('shop_id', shopId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (month) {
      const startDate = `${month}-01`;
      const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).toISOString().split('T')[0];
      query = query.gte('txn_date', startDate).lte('txn_date', endDate);
    }
    if (direction) query = query.eq('direction', direction);
    if (category) query = query.eq('category', category);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Transactions fetch error:', error);
      return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
    }

    return NextResponse.json({ transactions: data || [], total: count || 0 });
  } catch (error) {
    console.error('Bookkeeping GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/bookkeeping — create an expense transaction
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const {
      txn_date, brand, category, amount, vendor,
      account, payment_method, memo, service_line,
    } = body;

    if (!txn_date || !category || !amount) {
      return NextResponse.json({ error: 'Date, category, and amount are required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Generate transaction ID
    const { data: txnId } = await supabase
      .rpc('generate_transaction_id', { p_shop_id: shopId });

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        shop_id: shopId,
        transaction_id: txnId || `TXN-${Date.now()}`,
        txn_date,
        brand: brand || 'default',
        direction: 'OUT',
        event_type: 'EXPENSE',
        amount: Math.abs(Number(amount)),
        account: account || null,
        category,
        service_line: service_line || null,
        vendor_or_customer: vendor || null,
        payment_method: payment_method || null,
        memo: memo || null,
        posted_by: 'dashboard',
      })
      .select()
      .single();

    if (error) {
      console.error('Transaction create error:', error);
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }

    return NextResponse.json({ transaction: data });
  } catch (error) {
    console.error('Bookkeeping POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE /api/bookkeeping?id=X — delete a transaction
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });

    const supabase = getAdminClient();

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', parseInt(id))
      .eq('shop_id', shopId);

    if (error) {
      console.error('Transaction delete error:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Bookkeeping DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
