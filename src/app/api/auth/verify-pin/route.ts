import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auth/verify-pin
// Verifies a team member PIN for station mode and time clock
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pin = body.pin;
    const shopId = body.shopId || 1;

    if (!pin) {
      return NextResponse.json(
        { error: 'PIN is required' },
        { status: 400 }
      );
    }

    // Find team member with this PIN in this shop
    const { data: member, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name, role, role_id, active, team_roles(permissions)')
      .eq('pin', pin)
      .eq('shop_id', shopId)
      .single();

    if (error || !member) {
      return NextResponse.json(
        { valid: false, error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    if (!member.active) {
      return NextResponse.json(
        { valid: false, error: 'Team member is inactive' },
        { status: 403 }
      );
    }

    // Extract permissions from the joined role
    const roleData = member.team_roles as unknown as { permissions: Record<string, boolean> } | null;
    const rolePermissions = roleData?.permissions || {};

    return NextResponse.json({
      valid: true,
      teamMemberId: member.id,
      name: member.name,
      role: member.role,
      rolePermissions,
    });
  } catch (error) {
    console.error('PIN verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
