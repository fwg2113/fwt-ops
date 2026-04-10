import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddleware } from '@/app/lib/supabase-middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/reset-password',
  '/set-password',
  '/book',
  '/invoice',
  '/checkout',
  '/flat-glass',
  '/api/auto/config',
  '/api/auto/checkout',          // /api/auto/checkout/{verify,self,counter}
  '/api/auto/leads',              // GET/POST/PATCH on /api/auto/leads + /api/auto/leads/[token]
  '/api/auto/book',
  '/api/auto/check-availability', // booking page date availability check
  '/api/auto/inquiry',            // booking page vehicle inquiry form
  '/api/auto/validate-gc',        // booking page gift certificate code validation
  '/api/square/checkout',         // booking page deposit payment session creation
  '/api/square/webhook',
  '/api/square/oauth/callback',
  // NOTE: /api/documents/ was previously here but it inadvertently exposed the
  // entire documents API tree (read invoices, rewrite line items, fake payments)
  // because the routes use withShopAuth and would fall back to shop-1 owner.
  // The legitimately public document access path is /api/invoice/[token] and
  // /invoice/[token] (page) — both use the document's 128-bit public_token,
  // not /api/documents/. Removed 2026-04-09.
  '/station', // station-based PIN login
  '/api/auth/verify-pin', // PIN verification (used by station + time clock)
  '/api/auth/station-login', // station login
  '/api/auto/time-clock', // time clock (PIN-authenticated)
  '/api/auth/setup-owner', // one-time owner setup
  '/api/voice/', // Twilio voice webhooks (incoming calls, status, transfers)
  '/api/cron/', // Vercel cron jobs
  '/api/google/callback', // Google OAuth callback
  '/api/sms/incoming', // Twilio SMS webhook (future)
];

function isPublicRoute(pathname: string): boolean {
  // Static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return true;
  }
  // API routes for public endpoints
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for Supabase session
  const { supabase, response } = createSupabaseMiddleware(request);
  const { data: { user } } = await supabase.auth.getUser();

  // No user = redirect to login (for page requests)
  if (!user) {
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page routes redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
