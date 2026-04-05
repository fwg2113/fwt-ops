import { NextResponse } from 'next/server';
import { withShopAuth } from '@/app/lib/auth-middleware';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST: Create a new role
export const POST = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();
  const { name, permissions } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('team_roles')
    .insert({
      shop_id: shopId,
      name: name.trim(),
      permissions: permissions || {
        dashboard: true, appointments: true, quotes: false, invoices: false,
        checkout: false, customers: false, bookkeeping: false, settings: false,
        team_management: false, module_settings: false, consultations: false,
      },
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
});

// PATCH: Update role name and/or permissions
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();
  const { id, name, permissions } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Don't allow editing Owner role permissions (but allow renaming other roles)
  const { data: role } = await supabaseAdmin
    .from('team_roles')
    .select('name')
    .eq('id', id)
    .single();

  if (role?.name === 'Owner' && permissions) {
    return NextResponse.json({ error: 'Cannot modify Owner permissions' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name?.trim()) updates.name = name.trim();
  if (permissions) updates.permissions = permissions;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('team_roles')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});

// DELETE: Delete a custom role (not system roles)
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Check if it's a system role
  const { data: role } = await supabaseAdmin
    .from('team_roles')
    .select('name, is_system')
    .eq('id', parseInt(id))
    .single();

  if (!role) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  }

  if (role.name === 'Owner') {
    return NextResponse.json({ error: 'Cannot delete Owner role' }, { status: 400 });
  }

  // Check if any team members use this role
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('role_id', parseInt(id))
    .limit(1);

  if (members && members.length > 0) {
    return NextResponse.json({ error: 'Cannot delete role while team members are assigned to it' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('team_roles')
    .delete()
    .eq('id', parseInt(id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
