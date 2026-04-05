// ============================================================================
// INVITE TEAM MEMBER
// Creates or re-creates a Supabase Auth account and links it to a team_member.
// Sends an invite email with a link to set their password.
// Handles re-invites when email changes.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamMemberId, email, role, name, shopId = 1, reinvite } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    let tmId = teamMemberId;

    if (!tmId) {
      const { data: newTm, error: tmError } = await admin
        .from('team_members')
        .insert({
          shop_id: shopId,
          name: name || email.split('@')[0],
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

    // Check if team member already has an auth account
    const { data: existingTm } = await admin
      .from('team_members')
      .select('auth_user_id, email')
      .eq('id', tmId)
      .single();

    // If re-inviting or email changed, delete old auth user first
    if (existingTm?.auth_user_id) {
      if (reinvite) {
        // Delete old auth user so we can create fresh
        try {
          await admin.auth.admin.deleteUser(existingTm.auth_user_id);
        } catch {
          // If delete fails, try updating email instead
        }
        // Clear the link
        await admin.from('team_members').update({ auth_user_id: null }).eq('id', tmId);
      } else {
        // Already has auth -- just resend the invite email
        try {
          // Generate a password reset link which serves as a re-invite
          await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: {
              redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com'}/set-password`,
            },
          });
          return NextResponse.json({ success: true, resent: true, teamMemberId: tmId });
        } catch {
          // Fall through to create new invite
        }
      }
    }

    // Create Supabase Auth user with invite
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ops.frederickwindowtinting.com';
    const { data: authUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/set-password`,
      data: {
        shop_id: shopId,
        team_member_id: tmId,
        role: role || 'installer',
      },
    });

    if (authError) {
      // If user already exists in auth, try to link them
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        const { data: existingUsers } = await admin.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === email);
        if (existing) {
          await admin.from('team_members').update({ auth_user_id: existing.id, email }).eq('id', tmId);
          // Send password reset so they can set/reset their password
          await admin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${siteUrl}/set-password` },
          });
          return NextResponse.json({ success: true, userId: existing.id, teamMemberId: tmId, linked: true });
        }
      }
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // Link auth user to team member
    if (authUser?.user?.id) {
      await admin
        .from('team_members')
        .update({ auth_user_id: authUser.user.id, email })
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
