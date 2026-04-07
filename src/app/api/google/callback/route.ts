import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { exchangeCode, getUserEmail } from '@/app/lib/google-calendar';

// GET /api/google/callback -- OAuth callback from Google
// Exchanges the authorization code for tokens and stores them
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state'); // shop ID
  const error = request.nextUrl.searchParams.get('error');

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (error) {
    // User denied access or other error
    return NextResponse.redirect(`${origin}/settings?gcal=error&reason=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/settings?gcal=error&reason=missing_params`);
  }

  const shopId = parseInt(state);
  if (!shopId) {
    return NextResponse.redirect(`${origin}/settings?gcal=error&reason=invalid_state`);
  }

  try {
    const redirectUri = `${origin}/api/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);

    // Get the user's email
    const email = await getUserEmail(tokens.access_token);

    // Store tokens
    const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    await supabaseAdmin
      .from('shop_config')
      .update({
        google_calendar_connected: true,
        google_calendar_access_token: tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token || null,
        google_calendar_token_expiry: tokenExpiry.toISOString(),
        google_calendar_email: email,
      })
      .eq('id', shopId);

    return NextResponse.redirect(`${origin}/settings?gcal=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(`${origin}/settings?gcal=error&reason=token_exchange`);
  }
}
