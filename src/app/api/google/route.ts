import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { getAuthUrl } from '@/app/lib/google-calendar';

// GET /api/google -- returns the OAuth authorization URL
export const GET = withShopAuth(async ({ shopId, req }) => {
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUri = `${origin}/api/google/callback`;
  const state = String(shopId); // pass shop ID through OAuth state

  const url = getAuthUrl(redirectUri, state);
  return NextResponse.json({ url });
});

// POST /api/google -- disconnect Google Calendar
export const POST = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();

  if (body.action === 'disconnect') {
    const supabase = getAdminClient();
    await supabase
      .from('shop_config')
      .update({
        google_calendar_connected: false,
        google_calendar_access_token: null,
        google_calendar_refresh_token: null,
        google_calendar_token_expiry: null,
        google_calendar_email: null,
      })
      .eq('id', shopId);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
