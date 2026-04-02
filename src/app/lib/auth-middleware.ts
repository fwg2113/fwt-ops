// ============================================================================
// AUTH MIDDLEWARE
// Wraps API route handlers with authentication and shop scoping.
// Every dashboard API route should use withShopAuth().
// Public routes (invoice/[token]) use withPublicAccess() instead.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
export function withShopAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Extract bearer token from Authorization header
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        // PRE-AUTH FALLBACK: No login system yet, default to shop_id = 1.
        // When auth is implemented, replace this with:
        //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // All routes below use shopId from this context, so switching is seamless.
        return handler({
          shopId: 1,
          userId: 'system',
          userEmail: '',
          req,
        });
      }

      // Verify the JWT and get user info
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Resolve shop_id from team_members
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: teamMember } = await adminClient
        .from('team_members')
        .select('shop_id')
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
