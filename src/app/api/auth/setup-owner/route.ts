// ============================================================================
// SETUP OWNER ACCOUNT
// One-time endpoint to create the owner's Supabase Auth account
// and link it to their team_member record.
// This is called during initial shop setup or by the first admin.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, shopId = 1 } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if an owner already exists for this shop
    const { data: existingOwner } = await admin
      .from('team_members')
      .select('id, auth_user_id')
      .eq('shop_id', shopId)
      .eq('role', 'owner')
      .not('auth_user_id', 'is', null)
      .single();

    if (existingOwner) {
      return NextResponse.json({ error: 'Owner account already exists for this shop' }, { status: 400 });
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since owner is setting up their own account
      user_metadata: { shop_id: shopId, role: 'owner' },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // Find or create team member record for the owner
    const { data: existingTm } = await admin
      .from('team_members')
      .select('id')
      .eq('shop_id', shopId)
      .eq('email', email)
      .single();

    if (existingTm) {
      // Link existing team member to auth user
      await admin
        .from('team_members')
        .update({
          auth_user_id: authData.user.id,
          role: 'owner',
        })
        .eq('id', existingTm.id);
    } else {
      // Create new team member as owner
      await admin
        .from('team_members')
        .insert({
          shop_id: shopId,
          auth_user_id: authData.user.id,
          name: name || email.split('@')[0],
          email,
          role: 'owner',
          module_permissions: ['auto_tint', 'flat_glass', 'detailing', 'ceramic_coating', 'ppf', 'wraps'],
          active: true,
        });
    }

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      message: 'Owner account created. You can now sign in.',
    });
  } catch (err) {
    console.error('Setup owner error:', err);
    return NextResponse.json({ error: 'Failed to create owner account' }, { status: 500 });
  }
}
