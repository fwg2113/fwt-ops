import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    // Verify the user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Look up team member record
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: teamMember } = await admin
      .from('team_members')
      .select('id, shop_id, name, role, role_id, module_permissions, login_mode, view_preferences, active, team_roles(permissions)')
      .eq('auth_user_id', user.id)
      .eq('active', true)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: 'No team member record found' }, { status: 403 });
    }

    const roleData = teamMember.team_roles as unknown as { permissions: Record<string, boolean> } | null;

    return NextResponse.json({
      shopId: teamMember.shop_id,
      role: teamMember.role || 'installer',
      name: teamMember.name,
      teamMemberId: teamMember.id,
      modulePermissions: teamMember.module_permissions || [],
      loginMode: teamMember.login_mode || 'user',
      rolePermissions: roleData?.permissions || {},
      viewPreferences: teamMember.view_preferences || {},
    });
  } catch (err) {
    console.error('Auth /me error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
