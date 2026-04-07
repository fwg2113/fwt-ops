import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/settings
// Returns all configuration data for the settings page
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const [
      shopConfigRes,
      scheduleRes,
      dropoffSlotsRes,
      waitingSlotsRes,
      closedDatesRes,
      dateOverridesRes,
      servicesRes,
      filmsRes,
      filmShadesRes,
      filmBrandsRes,
      classRulesRes,
      vehicleClassesRes,
      discountsRes,
      pricingRes,
      serviceShadesRes,
      checkoutDiscountTypesRes,
      warrantyProductsRes,
      warrantyProductOptionsRes,
      brandsRes,
      shopModulesRes,
    ] = await Promise.all([
      supabase.from('shop_config').select('*').eq('id', shopId).single(),
      // Tables WITH shop_id
      supabase.from('auto_schedule').select('*').eq('shop_id', shopId).order('id'),
      supabase.from('auto_dropoff_slots').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('auto_waiting_slots').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('auto_closed_dates').select('*').eq('shop_id', shopId).order('closed_date', { ascending: true }),
      supabase.from('auto_date_overrides').select('*').eq('shop_id', shopId).order('override_date', { ascending: true }),
      supabase.from('auto_services').select('*').eq('shop_id', shopId).order('sort_order'),
      // Global catalog tables (NO shop_id column)
      supabase.from('auto_films').select('*').order('sort_order'),
      supabase.from('auto_film_shades').select('*').order('film_id').order('shade_numeric'),
      supabase.from('auto_film_brands').select('*').order('sort_order'),
      supabase.from('auto_class_rules').select('*').order('class_key'),
      supabase.from('auto_vehicle_classes').select('*').order('sort_order'),
      // Tables WITH shop_id
      supabase.from('auto_discounts').select('*').eq('shop_id', shopId).order('id'),
      supabase.from('auto_pricing').select('*').eq('shop_id', shopId),
      // Global catalog tables (NO shop_id column)
      supabase.from('auto_service_shades').select('*').order('service_key').order('sort_order'),
      // Tables WITH shop_id
      supabase.from('checkout_discount_types').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('warranty_products').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('warranty_product_options').select('*').eq('shop_id', shopId).order('warranty_product_id').order('sort_order'),
      // Brands + modules (per-shop)
      supabase.from('brands').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('shop_modules').select('*, service_modules(module_key, label, color, parent_category, pricing_model, icon_name)').eq('shop_id', shopId).order('sort_order'),
    ]);

    // Strip sensitive fields from shop_config before sending to client
    const safeConfig = { ...shopConfigRes.data };
    const sensitiveFields = [
      'square_access_token', 'square_refresh_token', 'square_merchant_id',
      'stripe_secret_key', 'twilio_auth_token', 'plaid_secret',
    ];
    for (const field of sensitiveFields) {
      delete (safeConfig as Record<string, unknown>)[field];
    }

    return NextResponse.json({
      shopConfig: safeConfig,
      schedule: scheduleRes.data || [],
      dropoffSlots: dropoffSlotsRes.data || [],
      waitingSlots: waitingSlotsRes.data || [],
      closedDates: closedDatesRes.data || [],
      dateOverrides: dateOverridesRes.data || [],
      services: servicesRes.data || [],
      films: filmsRes.data || [],
      filmShades: filmShadesRes.data || [],
      filmBrands: filmBrandsRes.data || [],
      classRules: classRulesRes.data || [],
      vehicleClasses: vehicleClassesRes.data || [],
      discounts: discountsRes.data || [],
      pricing: pricingRes.data || [],
      serviceShades: serviceShadesRes.data || [],
      checkoutDiscountTypes: checkoutDiscountTypesRes.data || [],
      warrantyProducts: warrantyProductsRes.data || [],
      warrantyProductOptions: warrantyProductOptionsRes.data || [],
      brands: brandsRes.data || [],
      shopModules: shopModulesRes.data || [],
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/settings
// Updates a specific settings table/row
// Body: { table: string, id?: number, data: Record<string, unknown> }
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { table, id, data } = await req.json();

    if (!table || !data) {
      return NextResponse.json({ error: 'Table and data required' }, { status: 400 });
    }

    // Whitelist of allowed tables
    const allowed = [
      'shop_config', 'auto_schedule', 'auto_dropoff_slots', 'auto_waiting_slots',
      'auto_services', 'auto_films', 'auto_film_shades', 'auto_film_brands', 'auto_discounts',
      'auto_pricing', 'auto_class_rules', 'auto_vehicle_classes',
      'checkout_discount_types', 'warranty_products', 'warranty_product_options',
      'brands', 'shop_modules',
    ];
    if (!allowed.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 403 });
    }

    // Global catalog tables don't have shop_id
    const globalTables = ['auto_films', 'auto_film_shades', 'auto_film_brands', 'auto_class_rules', 'auto_vehicle_classes'];

    const query = table === 'shop_config'
      ? supabase.from(table).update(data).eq('id', shopId)
      : globalTables.includes(table)
        ? supabase.from(table).update(data).eq('id', id)
        : supabase.from(table).update(data).eq('id', id).eq('shop_id', shopId);

    const { error } = await query;
    if (error) {
      console.error('Settings update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/settings
// Creates a new row in a settings table (closed dates, slots, etc.)
// Body: { table: string, data: Record<string, unknown> }
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { table, data } = await req.json();

    const allowed = [
      'auto_closed_dates', 'auto_date_overrides', 'auto_dropoff_slots',
      'auto_waiting_slots', 'auto_services', 'auto_films', 'auto_film_shades',
      'auto_film_brands', 'auto_pricing',
      'checkout_discount_types', 'warranty_products', 'warranty_product_options',
      'brands',
    ];
    if (!allowed.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 403 });
    }

    const globalTables = ['auto_films', 'auto_film_shades', 'auto_film_brands', 'auto_class_rules', 'auto_vehicle_classes'];
    const insertData = globalTables.includes(table) ? data : { ...data, shop_id: shopId };

    const { data: result, error } = await supabase
      .from(table)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Settings insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE /api/auto/settings
// Deletes a row from a settings table
// Body: { table: string, id: number }
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { table, id } = await req.json();

    const allowed = [
      'auto_closed_dates', 'auto_date_overrides', 'auto_dropoff_slots', 'auto_waiting_slots',
      'checkout_discount_types', 'warranty_products', 'warranty_product_options',
      'brands',
    ];
    if (!allowed.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 403 });
    }

    const { error } = await supabase.from(table).delete().eq('id', id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
