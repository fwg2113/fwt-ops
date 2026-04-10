// ============================================================================
// SQUARE CLIENT
// Configured for B2 Platform mode (RevFlw platform -> tenant Square accounts)
// Uses sandbox in development, production in live
// ============================================================================

import { SquareClient, SquareEnvironment } from 'square';

const isSandbox = process.env.SQUARE_ENVIRONMENT === 'sandbox';

// Platform client (your RevFlw account -- used for OAuth)
export const squareClient = new SquareClient({
  token: isSandbox
    ? process.env.SQUARE_SANDBOX_ACCESS_TOKEN
    : process.env.SQUARE_ACCESS_TOKEN,
  environment: isSandbox ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
});

// Create a client for a specific tenant using their OAuth access token
export function createTenantSquareClient(accessToken: string): SquareClient {
  return new SquareClient({
    token: accessToken,
    environment: isSandbox ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
  });
}

// Square application IDs
export const SQUARE_APP_ID = isSandbox
  ? process.env.SQUARE_SANDBOX_APPLICATION_ID!
  : process.env.SQUARE_APPLICATION_ID!;

export const SQUARE_OAUTH_SECRET = process.env.SQUARE_OAUTH_SECRET!;

// Helper: generate a unique idempotency key for Square API calls.
// Uses crypto.randomUUID() (cryptographically secure) to make the key
// unguessable. Previously used Date.now() + Math.random() which gave only
// ~40 bits of entropy and was brute-forceable. Audit C7/L5.
import { randomUUID } from 'crypto';
export function idempotencyKey(): string {
  return randomUUID();
}
