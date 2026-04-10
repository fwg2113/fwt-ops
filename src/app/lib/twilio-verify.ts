// ============================================================================
// TWILIO SIGNATURE VERIFICATION
// ----------------------------------------------------------------------------
// All Twilio webhook routes (incoming SMS, voice events, status callbacks,
// TwiML for outbound calls, etc.) MUST verify the X-Twilio-Signature header
// before processing the request body. Without this, anyone on the internet
// can POST forged events and:
//   - Trigger TwiML that dials premium-rate international numbers (toll fraud)
//   - Inject fake call/SMS records into the dashboard
//   - Spoof inbound messages from your customers
//
// Twilio signs requests with HMAC-SHA1 over the full URL + sorted POST params,
// keyed by your account auth token. The Twilio SDK ships `validateRequest`
// which does this calculation; we wrap it with a constant fail-closed default.
//
// Set TWILIO_AUTH_TOKEN in env (already required for other Twilio operations).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from 'twilio';

/**
 * Verify a Twilio webhook request and return the parsed POST params on success.
 * On failure, returns a NextResponse with 401 — caller should return it directly.
 *
 * Usage at top of any Twilio webhook POST handler:
 *
 *   export async function POST(request: NextRequest) {
 *     const verified = await verifyTwilioRequest(request);
 *     if (verified instanceof NextResponse) return verified;
 *     const params = verified;  // URLSearchParams of the POST body
 *     ...
 *   }
 */
export async function verifyTwilioRequest(
  request: NextRequest,
): Promise<URLSearchParams | NextResponse> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('Twilio webhook: TWILIO_AUTH_TOKEN not set, rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const signature = request.headers.get('x-twilio-signature');
  if (!signature) {
    console.error('Twilio webhook: missing x-twilio-signature header');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the body once. Twilio sends application/x-www-form-urlencoded.
  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);

  // Convert URLSearchParams to a plain object for validateRequest.
  // Twilio computes its signature over the sorted concatenation of param
  // names + values, so duplicates would matter — but in practice Twilio
  // sends unique keys.
  const paramsObj: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    paramsObj[key] = value;
  }

  // Reconstruct the full URL Twilio used. Twilio signs against the URL it
  // POSTed to, including any query string but using the original protocol
  // and host (which on Vercel come through as x-forwarded-* headers).
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const url = `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search || ''}`;

  const isValid = validateRequest(authToken, signature, url, paramsObj);
  if (!isValid) {
    console.error('Twilio webhook: signature verification failed', { url, host, proto });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return params;
}
