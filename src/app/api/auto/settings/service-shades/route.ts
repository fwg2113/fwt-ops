import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/settings/service-shades
// Bulk-save shade rules for a service — replaces all existing rules
// Body: { service_key: string, rules: Array<{ film_key: string, shade_value: string }> }
export async function POST(request: NextRequest) {
  try {
    const { service_key, rules } = await request.json();

    if (!service_key) {
      return NextResponse.json({ error: 'service_key required' }, { status: 400 });
    }

    // Delete all existing rules for this service
    await supabaseAdmin
      .from('auto_service_shades')
      .delete()
      .eq('service_key', service_key);

    // Insert new rules
    if (Array.isArray(rules) && rules.length > 0) {
      const rows = rules.map((r: { film_key: string; shade_value: string }, i: number) => ({
        service_key,
        film_key: r.film_key,
        shade_value: r.shade_value,
        shade_label: r.shade_value,
        sort_order: i,
      }));
      const { error } = await supabaseAdmin.from('auto_service_shades').insert(rows);
      if (error) {
        console.error('Service shades insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: rules?.length || 0 });
  } catch (error) {
    console.error('Service shades error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
