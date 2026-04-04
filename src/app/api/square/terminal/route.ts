// ============================================================================
// SQUARE TERMINAL API
// POST: Create a terminal checkout (send payment to device)
// GET: Check terminal checkout status (poll for completion)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createTenantSquareClient, idempotencyKey } from '@/app/lib/square';

// POST: Create a terminal checkout -- sends payment request to Square Terminal device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, deviceId, note, documentId, shopId = 1 } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID is required' }, { status: 400 });
    }

    // Get shop's Square credentials
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token, square_connected')
      .eq('id', shopId)
      .single();

    if (!shopConfig?.square_connected || !shopConfig?.square_access_token) {
      return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
    }

    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    // Create terminal checkout
    const response: any = await tenantSquare.terminal.checkouts.create({
      idempotencyKey: idempotencyKey(),
      checkout: {
        amountMoney: {
          amount: BigInt(Math.round(amount * 100)),
          currency: 'USD',
        },
        deviceOptions: {
          deviceId,
        },
        referenceId: documentId || undefined,
        note: note || 'Payment',
        paymentOptions: {
          autocomplete: true,
        },
      },
    });

    const checkout = response.checkout || response.data;
    if (!checkout?.id) {
      return NextResponse.json({ error: 'Failed to create terminal checkout' }, { status: 500 });
    }

    return NextResponse.json({
      checkoutId: checkout.id,
      status: checkout.status, // PENDING
      deviceId: checkout.deviceOptions?.deviceId,
    });
  } catch (error: any) {
    console.error('Terminal checkout error:', error);
    const message = error?.errors?.[0]?.detail || error?.message || 'Terminal checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Poll terminal checkout status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkoutId = searchParams.get('checkoutId');
    const shopId = searchParams.get('shopId') || '1';

    if (!checkoutId) {
      return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 });
    }

    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token')
      .eq('id', parseInt(shopId))
      .single();

    if (!shopConfig?.square_access_token) {
      return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
    }

    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    const response: any = await tenantSquare.terminal.checkouts.get({
      checkoutId,
    });

    const checkout = response.checkout || response.data;

    return NextResponse.json({
      checkoutId: checkout?.id,
      status: checkout?.status, // PENDING, IN_PROGRESS, CANCEL_REQUESTED, CANCELED, COMPLETED
      paymentIds: checkout?.paymentIds || [],
      updatedAt: checkout?.updatedAt,
    });
  } catch (error: any) {
    console.error('Terminal status error:', error);
    return NextResponse.json({ error: 'Failed to get checkout status' }, { status: 500 });
  }
}
