// ============================================================================
// AUTH MIDDLEWARE
// Wraps API route handlers with authentication and shop scoping.
// Every dashboard API route should use withShopAuth().
// Public routes (invoice/[token]) use withPublicAccess() instead.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Context passed to authenticated route handlers
export interface ShopAuthContext {
  shopId: number;
  userId: string;
  userEmail: string;
  req: NextRequest;
}

// Context for public routes (no auth required)
export interface PublicContext {
  req: NextRequest;
}

type AuthenticatedHandler = (ctx: ShopAuthContext) => Promise<NextResponse>;
type PublicHandler = (ctx: PublicContext) => Promise<NextResponse>;

/**
 * Wraps a dashboard API route handler with authentication.
 * 1. Extracts the user session from the Authorization header (Bearer token)
 * 2. Resolves the user's shop_id from team_members
 * 3. Passes shopId + userId to the handler
 *
 * Usage:
 *   export const GET = withShopAuth(async ({ shopId, userId, req }) => { ... })
 *   export const POST = withShopAuth(async ({ shopId, userId, req }) => { ... })
 */
// SECURITY: Explicit allowlist of routes that may run with the unauthenticated
// "shop 1 default" fallback. These are customer-facing flows where the caller
// is a customer browser without a session — but the route still uses withShopAuth
// because it needs shopId scoping for queries.
//
// Anything NOT in this allowlist must reach withShopAuth with a real authenticated
// user, or it gets 401. This prevents an accidental middleware whitelist mistake
// from inheriting owner access (root cause of the 2026-04-09 audit findings).
const PUBLIC_FALLBACK_ALLOWLIST: readonly string[] = [
  '/api/auto/leads',          // customer lead booking flow (GET/PATCH from /book/lead/[token])
  '/api/auto/inquiries',      // vehicle inquiry submission from booking page
  '/api/auto/checkout/self',  // self-checkout QR landing flow
  '/api/auto/checkout/verify',// post-Square-payment redirect verification
];

function isPublicFallbackAllowed(pathname: string): boolean {
  return PUBLIC_FALLBACK_ALLOWLIST.some(allowed => pathname.startsWith(allowed));
}

export function withShopAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Try Bearer token first (for API calls with explicit auth)
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      let user = null;

      if (token) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data } = await supabase.auth.getUser();
        user = data?.user;
      }

      // Try cookie-based session (for browser requests via Supabase SSR)
      if (!user) {
        try {
          const { createServerClient } = await import('@supabase/ssr');
          const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
              getAll() { return req.cookies.getAll(); },
              setAll() { /* read-only in API routes */ },
            },
          });
          const { data } = await supabase.auth.getUser();
          user = data?.user;
        } catch {
          // SSR import failed or no cookies
        }
      }

      if (!user) {
        // Check for station-mode cookie. Station logins are HMAC-signed tokens
        // that encode team_member_id:shop_id:timestamp. We verify the HMAC here
        // (not in middleware — middleware just checks cookie presence for speed)
        // and extract the shopId so the handler gets correct tenant scoping.
        const stationToken = req.cookies.get('station_token')?.value;
        if (stationToken) {
          try {
            const decoded = Buffer.from(stationToken, 'base64').toString();
            const parts = decoded.split(':');
            // Format: team_member_id:shop_id:timestamp:hmac_signature
            if (parts.length === 4) {
              const [memberId, shopIdStr, timestampStr, signature] = parts;
              const payload = `${memberId}:${shopIdStr}:${timestampStr}`;
              const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
              if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
                // Token is valid. Check age (12 hours max).
                const age = Date.now() - parseInt(timestampStr);
                if (age < 12 * 60 * 60 * 1000) {
                  return handler({
                    shopId: parseInt(shopIdStr) || 1,
                    userId: `station:${memberId}`,
                    userEmail: '',
                    req,
                  });
                }
              }
            }
          } catch {
            // Token parse/verify failed — fall through to 401
          }
        }

        // SECURITY: only the allowlisted customer-facing routes get the shop-1
        // fallback. Everything else returns 401. Without this restriction, ANY
        // route accidentally added to the middleware PUBLIC_ROUTES whitelist
        // would inherit owner-level access — the exact root cause of the
        // 2026-04-09 documents-route exposure.
        if (!isPublicFallbackAllowed(req.nextUrl.pathname)) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return handler({
          shopId: 1,
          userId: 'system',
          userEmail: '',
          req,
        });
      }

      // Resolve shop_id from team_members
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: teamMember } = await adminClient
        .from('team_members')
        .select('shop_id, role')
        .eq('auth_user_id', user.id)
        .single();

      // Default to shop 1 if no team_member record (owner bootstrap case)
      const shopId = teamMember?.shop_id || 1;

      return handler({
        shopId,
        userId: user.id,
        userEmail: user.email || '',
        req,
      });
    } catch (err) {
      console.error('Auth middleware error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Wraps a public API route (no auth required).
 * Used for customer-facing endpoints like /api/invoice/[token].
 * The token itself IS the authentication — 128-bit random, unguessable.
 *
 * Usage:
 *   export const GET = withPublicAccess(async ({ req }) => { ... })
 */
export function withPublicAccess(handler: PublicHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return handler({ req });
    } catch (err) {
      console.error('Public route error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Helper: Get the admin Supabase client for server-side operations.
 * All queries from authenticated routes should include .eq('shop_id', shopId)
 * to enforce tenant isolation at the query level.
 */
export function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}
