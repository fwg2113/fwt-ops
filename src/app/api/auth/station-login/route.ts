import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import crypto from 'crypto';

// POST /api/auth/station-login
// PIN-based login for station mode -- returns a lightweight session token
export async function POST(req: NextRequest) {
  try {
    const { pin, shopId } = await req.json();

    if (!pin || !shopId) {
      return NextResponse.json(
        { error: 'pin and shopId are required' },
        { status: 400 }
      );
    }

    // Find team member with this PIN in this shop
    const { data: member, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name, role, role_id, active, module_permissions, team_roles(permissions)')
      .eq('pin', pin)
      .eq('shop_id', shopId)
      .single();

    if (error || !member) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    if (!member.active) {
      return NextResponse.json(
        { error: 'Team member is inactive' },
        { status: 403 }
      );
    }

    // Extract permissions from the joined role
    const roleData = member.team_roles as unknown as { permissions: Record<string, boolean> } | null;
    const rolePermissions = roleData?.permissions || {};

    // Generate a lightweight session token
    // This is a simple HMAC-based token encoding the member ID and timestamp
    const timestamp = Date.now();
    const payload = `${member.id}:${shopId}:${timestamp}`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(`${payload}:${signature}`).toString('base64');

    return NextResponse.json({
      token,
      teamMemberId: member.id,
      name: member.name,
      role: member.role,
      shopId,
      rolePermissions,
      modulePermissions: member.module_permissions,
    });
  } catch (error) {
    console.error('Station login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
