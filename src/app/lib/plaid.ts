// ============================================================================
// PLAID API CLIENT
// Direct REST calls to Plaid -- no SDK dependency
// ============================================================================

const PLAID_BASE = process.env.PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : 'https://sandbox.plaid.com';

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';

async function plaidRequest(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${PLAID_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      ...body,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Plaid API error (${endpoint}):`, err);
    throw new Error(`Plaid API error: ${res.status}`);
  }

  return res.json();
}

export async function createLinkToken(userId: string) {
  return plaidRequest('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'RevFlw',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
}

export async function exchangePublicToken(publicToken: string) {
  return plaidRequest('/item/public_token/exchange', {
    public_token: publicToken,
  });
}

export interface PlaidTransaction {
  date: string;
  name: string;
  amount: number; // positive = expense, negative = income
  category: string[] | null;
  merchant_name: string | null;
  pending: boolean;
  transaction_id: string;
}

export async function fetchTransactions(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<PlaidTransaction[]> {
  const data = await plaidRequest('/transactions/get', {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: { count: 500, offset: 0 },
  });

  return data.transactions || [];
}

export async function removeItem(accessToken: string) {
  return plaidRequest('/item/remove', {
    access_token: accessToken,
  });
}

// ============================================================================
// AUTO-CATEGORIZATION
// ============================================================================

export interface VendorMapping {
  pattern: string;
  category: string;
  vendor_name: string | null;
  brand: string | null;
  filter_out: boolean;
}

// Map Plaid native categories to our categories
const PLAID_CATEGORY_MAP: Record<string, string> = {
  'Bank Fees': 'Bank Fees',
  'Food and Drink': 'Food & Drinks',
  'Shops': 'Shop Supplies',
  'Travel': 'Vehicle Expense',
  'Service': 'Professional Services',
  'Utilities': 'Utilities',
  'Insurance': 'Insurance',
  'Healthcare': 'Miscellaneous',
  'Recreation': 'Miscellaneous',
  'Community': 'Miscellaneous',
};

// Built-in patterns for common vendors
const BUILTIN_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /google\s*ads|adwords/i, category: 'Marketing' },
  { pattern: /facebook\s*ads|meta\s*ads/i, category: 'Marketing' },
  { pattern: /claude\.ai|openai|anthropic/i, category: 'Software & Subscriptions' },
  { pattern: /home\s*depot/i, category: 'Shop Supplies' },
  { pattern: /lowes|lowe'?s/i, category: 'Shop Supplies' },
  { pattern: /shell|exxon|chevron|sunoco|wawa.*gas|sheetz.*gas|bp\s/i, category: 'Vehicle Expense' },
  { pattern: /geico|progressive|state\s*farm|erie\s*ins/i, category: 'Insurance' },
  { pattern: /verizon|t-mobile|at&t/i, category: 'Utilities' },
  { pattern: /service\s*charge|monthly.*fee|bank.*fee/i, category: 'Bank Fees' },
  { pattern: /godaddy|adobe|shopify|paddle|make\.com/i, category: 'Software & Subscriptions' },
];

// Income patterns to auto-skip
const INCOME_PATTERNS = [
  /^(ACH\s+)?DEP(OSIT)?\b/i,
  /MOBILE\s+DEP/i,
  /PAYPAL\s+TRANSFER/i,
  /SHOPIFY\s+ACH/i,
  /ZELLE\s+(FROM|RECEIVED)/i,
  /INTEREST\s+(PAYMENT|EARNED)/i,
];

export function isIncomeTransaction(description: string, amount: number): boolean {
  // Plaid: negative amount = income/refund
  if (amount < 0) return true;
  return INCOME_PATTERNS.some(p => p.test(description));
}

export function categorizeTransaction(
  description: string,
  plaidCategories: string[] | null,
  vendorMappings: VendorMapping[],
): { category: string; vendor: string | null; brand: string | null; filterOut: boolean } {
  const descLower = description.toLowerCase();

  // Tier 1: User vendor mappings (highest priority)
  for (const mapping of vendorMappings) {
    if (descLower.includes(mapping.pattern.toLowerCase())) {
      return {
        category: mapping.category,
        vendor: mapping.vendor_name,
        brand: mapping.brand,
        filterOut: mapping.filter_out,
      };
    }
  }

  // Tier 2: Built-in patterns
  for (const bp of BUILTIN_PATTERNS) {
    if (bp.pattern.test(description)) {
      return { category: bp.category, vendor: null, brand: null, filterOut: false };
    }
  }

  // Tier 3: Plaid native categories
  if (plaidCategories && plaidCategories.length > 0) {
    const topCategory = plaidCategories[0];
    if (PLAID_CATEGORY_MAP[topCategory]) {
      return { category: PLAID_CATEGORY_MAP[topCategory], vendor: null, brand: null, filterOut: false };
    }
  }

  return { category: '', vendor: null, brand: null, filterOut: false };
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

export function getDuplicateWindowDays(amount: number): number {
  const cents = Math.round((Math.abs(amount) % 1) * 100);
  if (cents !== 0) return 5; // Has cents -- very unique
  const dollars = Math.floor(Math.abs(amount));
  if (dollars >= 100 && (dollars % 100 === 0 || dollars % 50 === 0)) return 1; // Round hundreds
  return 3; // Whole dollar, non-round
}

export function isDuplicate(
  date: string,
  amount: number,
  existingTransactions: Array<{ txn_date: string; amount: number; direction: string }>,
): boolean {
  const windowDays = getDuplicateWindowDays(amount);
  const txnDate = new Date(date + 'T12:00:00');
  const absAmount = Math.abs(amount);

  for (const existing of existingTransactions) {
    const existingDate = new Date(existing.txn_date + 'T12:00:00');
    const dayDiff = Math.abs((txnDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24));

    if (dayDiff <= windowDays && Math.abs(Number(existing.amount) - absAmount) < 0.01) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// VENDOR NAME CLEANING
// ============================================================================

export function cleanVendorName(description: string): string {
  let cleaned = description
    .replace(/^DEBIT CARD PURCHASE\s+x+\d+\s+/i, '')
    .replace(/^RECURRING DEBIT CARD\s+x+\d+\s+/i, '')
    .replace(/^ACH\s+(DEP\s+)?/i, '')
    .replace(/\s+CARD\d+$/i, '')
    .replace(/\s+\d{3}-[\dx]{3,}-?\d{0,4}\s+\w{2}$/i, '')
    .replace(/\s+[A-Z]{2}$/i, '')
    .trim();

  // Title case
  cleaned = cleaned.replace(/\w\S*/g, txt =>
    txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );

  return cleaned.substring(0, 50);
}
