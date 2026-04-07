import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/voice/active
// Returns currently active (in-progress) calls
export async function GET() {
  const { data } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('shop_id', 1)
    .eq('status', 'in-progress')
    .order('created_at', { ascending: false })
    .limit(10);

  // Enrich with customer names
  const calls = await Promise.all((data || []).map(async (call) => {
    if (!call.customer_name && call.caller_phone) {
      const cleanPhone = call.caller_phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone) {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('first_name, last_name')
          .or(`phone.ilike.%${cleanPhone}%`)
          .eq('shop_id', 1)
          .single();
        if (customer) {
          call.customer_name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        }
      }
    }
    return call;
  }));

  return NextResponse.json({ calls });
}
