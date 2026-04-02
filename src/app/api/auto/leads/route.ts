import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import crypto from 'crypto';

// GET /api/auto/leads
// Returns all leads (for lead tracking dashboard)
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_leads')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Leads fetch error:', error);
      return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
    }

    return NextResponse.json({ leads: data || [] });
  } catch (error) {
    console.error('Leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/leads
// Creates a lead + generates a tokenized booking URL
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const {
      customer_name, customer_phone, customer_email,
      vehicle_year, vehicle_make, vehicle_model, vehicle_id,
      class_keys, services, total_price, send_method,
      charge_deposit, deposit_amount,
    } = body;

    // Generate unique token for the booking link
    const token = crypto.randomBytes(16).toString('hex');

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_leads')
      .insert({
        shop_id: shopId,
        token,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        vehicle_id: vehicle_id || null,
        class_keys: class_keys || null,
        services, // JSONB array with shade_front/shade_rear per service
        total_price,
        charge_deposit: charge_deposit ?? true,
        deposit_amount: deposit_amount ?? 0,
        send_method: send_method || 'copy',
        status: 'sent',
      })
      .select()
      .single();

    if (error) {
      console.error('Lead create error:', error);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    // Build the booking URL with token
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || '';
    const bookingUrl = `${baseUrl}/book/lead/${token}`;

    return NextResponse.json({
      lead: data,
      booking_url: bookingUrl,
      token,
    });
  } catch (error) {
    console.error('Lead create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/leads
// Update lead status (e.g., when link is opened or booking is completed)
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const { id, token, ...updates } = body;

    if (!id && !token) {
      return NextResponse.json({ error: 'Lead ID or token required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    let query = supabase.from('auto_leads').update(updates).eq('shop_id', shopId);
    if (id) query = query.eq('id', id);
    else if (token) query = query.eq('token', token);

    const { data, error } = await query.select().single();

    if (error) {
      console.error('Lead update error:', error);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
