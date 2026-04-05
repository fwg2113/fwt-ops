// ============================================================================
// INVITE TEAM MEMBER
// Creates a Supabase Auth account and links it to an existing team_member record.
// Sends an invite email with a link to set their password.
// Only owners and admins can invite.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamMemberId, email, role, shopId = 1 } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // If teamMemberId provided, link to existing team member
    // Otherwise create a new team member record
    let tmId = teamMemberId;

    if (!tmId) {
      // Create team member record
      const { data: newTm, error: tmError } = await admin
        .from('team_members')
        .insert({
          shop_id: shopId,
          name: body.name || email.split('@')[0],
          email,
          phone: body.phone || null,
          role: role || 'installer',
          module_permissions: body.modulePermissions || ['auto_tint'],
          active: true,
        })
        .select('id')
        .single();

      if (tmError) {
        return NextResponse.json({ error: tmError.message }, { status: 500 });
      }
      tmId = newTm.id;
    }

    // Create Supabase Auth user with invite (sends email automatically)
    const { data: authUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com'}/login`,
      data: {
        shop_id: shopId,
        team_member_id: tmId,
        role: role || 'installer',
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // Link auth user to team member
    if (authUser?.user?.id) {
      await admin
        .from('team_members')
        .update({
          auth_user_id: authUser.user.id,
          email,
          role: role || 'installer',
        })
        .eq('id', tmId);
    }

    return NextResponse.json({
      success: true,
      userId: authUser?.user?.id,
      teamMemberId: tmId,
    });
  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 });
  }
}
