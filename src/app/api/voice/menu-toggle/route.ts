// ============================================================================
// VOICE MENU KILL SWITCH
// ----------------------------------------------------------------------------
// GET  /api/voice/menu-toggle  → { voice_menu_enabled: boolean }
// PATCH /api/voice/menu-toggle  body: { voice_menu_enabled: boolean }
//
// Owner-controlled toggle. When voice_menu_enabled is FALSE, the inbound
// /api/voice/incoming route skips the IVR menu entirely and rings the
// dashboard browser client directly. Used for Google Voice / third-party
// verification calls that can't press keys, or any time the owner wants
// the phone to ring straight through.
//
// Authenticated via withShopAuth — only logged-in dashboard users can
// flip the switch.
// ============================================================================

import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

export const GET = withShopAuth(async ({ shopId }) => {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('shop_config')
    .select('voice_menu_enabled')
    .eq('id', shopId)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to load setting' }, { status: 500 });
  }

  return NextResponse.json({
    voice_menu_enabled: data?.voice_menu_enabled !== false, // default true if null
  });
});

export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body.voice_menu_enabled !== 'boolean') {
    return NextResponse.json({ error: 'voice_menu_enabled (boolean) required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('shop_config')
    .update({ voice_menu_enabled: body.voice_menu_enabled })
    .eq('id', shopId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }

  return NextResponse.json({ success: true, voice_menu_enabled: body.voice_menu_enabled });
});
