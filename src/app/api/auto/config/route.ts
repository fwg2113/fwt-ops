import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// GET /api/auto/config
// Returns ALL booking data in one call (replaces legacy bulk_data route)
// Called once on page load, everything else resolved client-side
export async function GET() {
  try {
    // Fetch vehicles separately with pagination to handle >1000 rows
    const allVehicles: Record<string, unknown>[] = [];
    let vehiclePage = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('auto_vehicles')
        .select('*')
        .eq('active', true)
        .order('make')
        .order('model')
        .order('year_start')
        .range(vehiclePage * PAGE_SIZE, (vehiclePage + 1) * PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      allVehicles.push(...data);
      if (data.length < PAGE_SIZE) break;
      vehiclePage++;
    }

    // Parallel fetch all other tables
    const [
      shopConfigRes,
      filmsRes,
      filmShadesRes,
      filmBrandsRes,
      classRulesRes,
      vehicleClassesRes,
      servicesRes,
      pricingRes,
      scheduleRes,
      dropoffSlotsRes,
      waitingSlotsRes,
      discountsRes,
      serviceShadesRes,
      specialShadesRes,
      customClassesRes,
      vehiclePricingOverridesRes,
      shopModulesRes,
      brandsRes,
    ] = await Promise.all([
      supabaseAdmin.from('shop_config').select('*').eq('id', 1).single(),
      supabaseAdmin.from('auto_films').select('*').eq('offered', true).order('sort_order'),
      supabaseAdmin.from('auto_film_shades').select('*').eq('offered', true).order('sort_order'),
      supabaseAdmin.from('auto_film_brands').select('*').eq('active', true).order('sort_order'),
      supabaseAdmin.from('auto_class_rules').select('*'),
      supabaseAdmin.from('auto_vehicle_classes').select('*').order('sort_order'),
      supabaseAdmin.from('auto_services').select('*').eq('enabled', true).order('sort_order'),
      supabaseAdmin.from('auto_pricing').select('*'),
      supabaseAdmin.from('auto_schedule').select('*'),
      supabaseAdmin.from('auto_dropoff_slots').select('*').eq('enabled', true).order('sort_order'),
      supabaseAdmin.from('auto_waiting_slots').select('*').eq('enabled', true).order('sort_order'),
      supabaseAdmin.from('auto_discounts').select('*').eq('enabled', true),
      supabaseAdmin.from('auto_service_shades').select('*'),
      supabaseAdmin.from('auto_special_shades').select('*').eq('enabled', true),
      supabaseAdmin.from('auto_vehicle_custom_classes').select('*').eq('enabled', true).order('sort_order'),
      supabaseAdmin.from('auto_vehicle_pricing_overrides').select('*'),
      supabaseAdmin.from('shop_modules').select('*, service_modules(module_key, label, color)').eq('shop_id', 1).order('sort_order'),
      supabaseAdmin.from('brands').select('*').eq('shop_id', 1).order('sort_order'),
    ]);

    // Check for critical errors
    if (shopConfigRes.error) {
      console.error('Failed to load shop_config:', shopConfigRes.error);
      return NextResponse.json({ error: 'Failed to load configuration' }, { status: 500 });
    }

    // SECURITY: Strip ALL sensitive fields from shop_config before returning
    // to the public booking page. This is an unauthenticated endpoint — anything
    // returned here is visible to anyone who curls /api/auto/config.
    // Without this strip, the route leaked OAuth access tokens for Square,
    // Google Calendar, and Twilio auth credentials. Confirmed via security
    // audit 2026-04-09.
    const safeConfig = { ...shopConfigRes.data } as Record<string, unknown>;
    const sensitiveFields = [
      // Square OAuth (B2 platform credentials → tenant merchant access)
      'square_access_token', 'square_refresh_token', 'square_merchant_id',
      'square_token_expires_at',
      // Google Calendar OAuth (calendar read/write)
      'google_calendar_access_token', 'google_calendar_refresh_token',
      'google_calendar_token_expiry',
      // Twilio (SMS + voice billed to shop's account)
      'twilio_auth_token', 'twilio_account_sid', 'twilio_api_key', 'twilio_api_secret',
      // Stripe (legacy / SaaS subscription billing)
      'stripe_secret_key', 'stripe_restricted_key', 'stripe_webhook_secret',
      // Other potential secrets — defensive
      'plaid_secret', 'plaid_access_token', 'resend_api_key',
    ];
    for (const field of sensitiveFields) {
      delete safeConfig[field];
    }

    return NextResponse.json({
      shopConfig: safeConfig,
      films: filmsRes.data || [],
      filmShades: filmShadesRes.data || [],
      filmBrands: filmBrandsRes.data || [],
      vehicles: allVehicles,
      classRules: classRulesRes.data || [],
      vehicleClasses: vehicleClassesRes.data || [],
      services: servicesRes.data || [],
      pricing: pricingRes.data || [],
      schedule: scheduleRes.data || [],
      dropoffSlots: dropoffSlotsRes.data || [],
      waitingSlots: waitingSlotsRes.data || [],
      discounts: discountsRes.data || [],
      serviceShades: serviceShadesRes.data || [],
      specialShades: specialShadesRes.data || [],
      vehicleCustomClasses: customClassesRes.data || [],
      vehiclePricingOverrides: vehiclePricingOverridesRes.data || [],
      shopModules: shopModulesRes.data || [],
      brands: brandsRes.data || [],
    });
  } catch (error) {
    console.error('Bulk config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
