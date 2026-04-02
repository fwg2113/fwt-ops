import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/service-modules — list all service modules
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('service_modules')
    .select('id, module_key, label, color, parent_category, pricing_model, available_for_onboarding, sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
