import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/customers — list customers for search/autocomplete
export const GET = withShopAuth(async ({ shopId }) => {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone, company_name')
    .eq('shop_id', shopId)
    .order('last_name', { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
});
