import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function GET() {
  try {
    const { count, error } = await supabaseAdmin
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', 1)
      .eq('direction', 'inbound')
      .eq('read', false);

    if (error) {
      return NextResponse.json({ count: 0, error: error.message });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ count: 0, error: err.message });
  }
}
