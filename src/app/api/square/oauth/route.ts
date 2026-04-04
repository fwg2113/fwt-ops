// ============================================================================
// SQUARE OAUTH INITIATION
// Generates the Square OAuth authorization URL for a tenant to connect.
// Called from Settings > Payment when shop clicks "Connect Square".
// ============================================================================

import { NextResponse } from 'next/server';
import { withShopAuth } from '@/app/lib/auth-middleware';
import { SQUARE_APP_ID } from '@/app/lib/square';

const isSandbox = process.env.SQUARE_ENVIRONMENT === 'sandbox';
const SQUARE_BASE_URL = isSandbox
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';

export const GET = withShopAuth(async ({ shopId, req }) => {
  const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/settings.*$/, '') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUri = `${origin}/api/square/oauth/callback`;

  // Permissions we need from the tenant's Square account
  const scopes = [
    'PAYMENTS_WRITE',
    'PAYMENTS_READ',
    'ORDERS_WRITE',
    'ORDERS_READ',
    'MERCHANT_PROFILE_READ',
    'DEVICE_CREDENTIAL_MANAGEMENT',
    'ITEMS_READ',
  ].join('+');

  const authUrl = `${SQUARE_BASE_URL}/oauth2/authorize?client_id=${SQUARE_APP_ID}&scope=${scopes}&session=false&state=${shopId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.json({ url: authUrl });
});
