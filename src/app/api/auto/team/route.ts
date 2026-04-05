import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/team
// Returns all team members + roles for the shop
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const [membersRes, rolesRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('*')
        .eq('shop_id', shopId)
        .order('name'),
      supabase
        .from('team_roles')
        .select('*')
        .eq('shop_id', shopId)
        .order('id'),
    ]);

    return NextResponse.json({
      members: membersRes.data || [],
      roles: rolesRes.data || [],
    });
  } catch (error) {
    console.error('Team fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/team
// Create a new team member
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();

    const { name, email, phone, pin, role_id, module_permissions, active, login_mode } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        shop_id: shopId,
        name,
        email: email || null,
        phone: phone || null,
        pin: pin || null,
        role: 'installer', // legacy field, kept for backwards compat
        role_id: role_id || null,
        module_permissions: module_permissions || ['auto_tint'],
        department: (module_permissions || ['auto_tint']).join(','), // legacy field sync
        active: active !== false,
        login_mode: login_mode || 'user',
      })
      .select()
      .single();

    if (error) {
      console.error('Team member create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/team
// Update a team member
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });
    }

    // Sync legacy department field if module_permissions changed
    if (updates.module_permissions) {
      updates.department = updates.module_permissions.join(',');
    }

    const { data, error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('Team member update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE /api/auto/team
// Delete a team member
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id)
      .eq('shop_id', shopId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
