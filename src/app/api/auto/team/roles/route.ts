import { NextResponse } from 'next/server';
import { withShopAuth } from '@/app/lib/auth-middleware';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// PATCH: Update role permissions
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();
  const { id, permissions } = body;

  if (!id || !permissions) {
    return NextResponse.json({ error: 'id and permissions required' }, { status: 400 });
  }

  // Don't allow editing Owner role
  const { data: role } = await supabaseAdmin
    .from('team_roles')
    .select('name')
    .eq('id', id)
    .single();

  if (role?.name === 'Owner') {
    return NextResponse.json({ error: 'Cannot modify Owner permissions' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('team_roles')
    .update({ permissions })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
