import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/customers?search=&sort=&dir=&limit=&offset=
// List customers with search, sorting, pagination
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'last_visit_date';
    const dir = searchParams.get('dir') === 'asc' ? true : false;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = getAdminClient();

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('shop_id', shopId);

    if (search) {
      // Search by name, phone, or email
      const cleanSearch = search.replace(/[()\\-\\s]/g, '');
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${cleanSearch}%,company_name.ilike.%${search}%`
      );
    }

    query = query.order(sort, { ascending: dir, nullsFirst: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Customers fetch error:', error);
      return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
    }

    return NextResponse.json({ customers: data || [], total: count || 0 });
  } catch (error) {
    console.error('Customers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/customers
// Create a new customer
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const { first_name, last_name, phone, email, address, city, state, zip, company_name, notes } = body;

    if (!first_name && !last_name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Check for duplicate by phone
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: existing } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('shop_id', shopId)
        .eq('phone', cleanPhone)
        .single();

      if (existing) {
        return NextResponse.json({
          error: 'duplicate',
          existing,
          message: `Customer with this phone already exists: ${existing.first_name} ${existing.last_name}`,
        }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        shop_id: shopId,
        first_name: first_name || '',
        last_name: last_name || '',
        phone: phone ? phone.replace(/\D/g, '') : null,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        company_name: company_name || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Customer create error:', error);
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (error) {
    console.error('Customer create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/customers
// Update a customer
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Clean phone if provided
    if (updates.phone) {
      updates.phone = updates.phone.replace(/\D/g, '');
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('Customer update error:', error);
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (error) {
    console.error('Customer update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE /api/customers
// Delete a customer and all related data (cascades to vehicles, jobs)
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Delete customer (customer_vehicles and customer_jobs cascade via ON DELETE CASCADE)
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('shop_id', shopId);

    if (error) {
      console.error('Customer delete error:', error);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Customer delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
