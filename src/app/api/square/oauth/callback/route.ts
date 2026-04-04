// ============================================================================
// SQUARE OAUTH CALLBACK
// Handles the redirect after a tenant authorizes their Square account.
// Exchanges the authorization code for an access token + refresh token.
// Stores the tokens in shop_config for the tenant.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { squareClient, SQUARE_APP_ID, SQUARE_OAUTH_SECRET } from '@/app/lib/square';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // contains shop_id
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('Square OAuth error:', error, errorDescription);
    return NextResponse.redirect(new URL(`/settings?tab=payment&error=${encodeURIComponent(errorDescription || error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?tab=payment&error=Missing+authorization+code', request.url));
  }

  const shopId = parseInt(state);
  if (isNaN(shopId)) {
    return NextResponse.redirect(new URL('/settings?tab=payment&error=Invalid+shop+ID', request.url));
  }

  try {
    // Exchange authorization code for access token
    const result = await squareClient.oAuth.obtainToken({
      clientId: SQUARE_APP_ID,
      clientSecret: SQUARE_OAUTH_SECRET,
      grantType: 'authorization_code',
      code,
    });

    if (!result.accessToken) {
      throw new Error('No access token received from Square');
    }

    // Store Square credentials in shop_config
    await supabaseAdmin
      .from('shop_config')
      .update({
        square_access_token: result.accessToken,
        square_refresh_token: result.refreshToken || null,
        square_merchant_id: result.merchantId || null,
        square_token_expires_at: result.expiresAt || null,
        square_connected: true,
      })
      .eq('id', shopId);

    console.log(`Square connected for shop ${shopId}, merchant: ${result.merchantId}`);

    // Redirect back to settings with success
    return NextResponse.redirect(new URL('/settings?tab=payment&square=connected', request.url));
  } catch (err) {
    console.error('Square OAuth token exchange error:', err);
    return NextResponse.redirect(new URL('/settings?tab=payment&error=Failed+to+connect+Square', request.url));
  }
}
