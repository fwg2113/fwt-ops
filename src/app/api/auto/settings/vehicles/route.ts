import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/settings/vehicles?search=bronco&page=1&id=123
// Search and paginate vehicles, or get a single vehicle with duration overrides
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('id');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    // Single vehicle with all overrides + custom classes + default pricing
    if (vehicleId) {
      const [vehicleRes, durationRes, pricingRes, customClassesRes, filmsRes, servicesRes, allPricingRes] = await Promise.all([
        supabaseAdmin.from('auto_vehicles').select('*').eq('id', vehicleId).single(),
        supabaseAdmin.from('auto_vehicle_duration_overrides').select('*').eq('vehicle_id', vehicleId),
        supabaseAdmin.from('auto_vehicle_pricing_overrides').select('*').eq('vehicle_id', vehicleId),
        supabaseAdmin.from('auto_vehicle_custom_classes').select('*').eq('vehicle_id', vehicleId).order('sort_order'),
        supabaseAdmin.from('auto_films').select('id, name, abbreviation').eq('offered', true).order('sort_order'),
        supabaseAdmin.from('auto_services').select('service_key, label, service_type, is_primary, is_addon').eq('enabled', true).order('sort_order'),
        supabaseAdmin.from('auto_pricing').select('*'),
      ]);

      return NextResponse.json({
        vehicle: vehicleRes.data,
        durationOverrides: durationRes.data || [],
        pricingOverrides: pricingRes.data || [],
        customClasses: customClassesRes.data || [],
        // Send ALL pricing rows — the UI filters based on selected class keys
        defaultPricing: allPricingRes.data || [],
        films: filmsRes.data || [],
        services: servicesRes.data || [],
      });
    }

    // List with search
    let query = supabaseAdmin
      .from('auto_vehicles')
      .select('*', { count: 'exact' })
      .eq('active', true)
      .order('make')
      .order('model')
      .order('year_start')
      .range(offset, offset + pageSize - 1);

    if (search) {
      query = query.or(`make.ilike.%${search}%,model.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      vehicles: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/auto/settings/vehicles — add a new vehicle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { durationOverrides, ...vehicleData } = body;

    const { data, error } = await supabaseAdmin
      .from('auto_vehicles')
      .insert(vehicleData)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Save duration overrides if provided
    if (durationOverrides && data) {
      const overrides = Object.entries(durationOverrides)
        .filter(([, dur]) => dur !== null && dur !== '')
        .map(([serviceKey, dur]) => ({
          vehicle_id: data.id,
          service_key: serviceKey,
          duration_minutes: parseInt(String(dur)),
        }));
      if (overrides.length > 0) {
        await supabaseAdmin.from('auto_vehicle_duration_overrides').insert(overrides);
      }
    }

    return NextResponse.json({ success: true, vehicle: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/auto/settings/vehicles — update a vehicle
export async function PATCH(request: NextRequest) {
  try {
    const { id, durationOverrides, pricingOverrides, customClasses, ...updates } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('auto_vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Upsert duration overrides if provided
    if (durationOverrides) {
      await supabaseAdmin.from('auto_vehicle_duration_overrides').delete().eq('vehicle_id', id);
      const overrides = Object.entries(durationOverrides)
        .filter(([, dur]) => dur !== null && dur !== '' && dur !== undefined)
        .map(([serviceKey, dur]) => ({
          vehicle_id: id,
          service_key: serviceKey,
          duration_minutes: parseInt(String(dur)),
        }));
      if (overrides.length > 0) {
        await supabaseAdmin.from('auto_vehicle_duration_overrides').insert(overrides);
      }
    }

    // Upsert pricing overrides if provided
    if (pricingOverrides !== undefined) {
      await supabaseAdmin.from('auto_vehicle_pricing_overrides').delete().eq('vehicle_id', id);
      if (Array.isArray(pricingOverrides) && pricingOverrides.length > 0) {
        const rows = pricingOverrides
          .filter((po: Record<string, unknown>) => po.price !== null && po.price !== '' && po.price !== undefined)
          .map((po: Record<string, unknown>) => ({
            vehicle_id: id,
            service_key: po.service_key,
            film_id: po.film_id || null,
            price: parseFloat(String(po.price)),
          }));
        if (rows.length > 0) {
          await supabaseAdmin.from('auto_vehicle_pricing_overrides').insert(rows);
        }
      }
    }

    // Upsert custom classes if provided
    if (customClasses !== undefined) {
      await supabaseAdmin.from('auto_vehicle_custom_classes').delete().eq('vehicle_id', id);
      if (Array.isArray(customClasses) && customClasses.length > 0) {
        const rows = customClasses.map((cc: Record<string, unknown>, i: number) => ({
          vehicle_id: id,
          class_key: cc.class_key,
          label: cc.label,
          description: cc.description || null,
          image_url: cc.image_url || null,
          category: cc.category || 'primary',
          duration_minutes: cc.duration_minutes || 60,
          sort_order: i,
          enabled: cc.enabled !== false,
        }));
        await supabaseAdmin.from('auto_vehicle_custom_classes').insert(rows);
      }
    }

    return NextResponse.json({ success: true, vehicle: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
