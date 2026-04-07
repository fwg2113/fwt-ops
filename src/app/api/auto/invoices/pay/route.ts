// ============================================================================
// POST /api/auto/invoices/pay
// Creates a Square Payment Link for a remote invoice payment.
// Customer clicks "Pay Now" on the public invoice page -> redirects to Square.
// On completion, Square webhook records payment against the document.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createTenantSquareClient, idempotencyKey } from '@/app/lib/square';

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
    }

    // Fetch the document
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, shop_id, public_token, doc_number, customer_name, vehicle_year, vehicle_make, vehicle_model, balance_due, cc_fee_percent, cc_fee_flat, status')
      .eq('id', invoiceId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (doc.status === 'paid' || doc.status === 'void') {
      return NextResponse.json({ error: 'Invoice is already ' + doc.status }, { status: 400 });
    }

    if (!doc.balance_due || doc.balance_due <= 0) {
      return NextResponse.json({ error: 'No balance due' }, { status: 400 });
    }

    const shopId = doc.shop_id || 1;

    // Get shop config with Square credentials
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token, square_connected, shop_name, cc_fee_percent, cc_fee_flat')
      .eq('id', shopId)
      .single();

    if (!shopConfig?.square_connected || !shopConfig?.square_access_token) {
      return NextResponse.json({ error: 'Square payments not configured' }, { status: 400 });
    }

    // Calculate CC fee (use document-level if set, else shop-level)
    const ccFeePercent = doc.cc_fee_percent ?? shopConfig.cc_fee_percent ?? 0;
    const ccFeeFlat = doc.cc_fee_flat ?? shopConfig.cc_fee_flat ?? 0;
    const balanceDue = doc.balance_due;
    const ccFee = ccFeePercent > 0 || ccFeeFlat > 0
      ? Math.round((balanceDue * (ccFeePercent / 100) + ccFeeFlat) * 100) / 100
      : 0;

    const totalCharge = balanceDue + ccFee;

    // Create tenant Square client
    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    // Get tenant's default location
    const locationsResponse = await tenantSquare.locations.list() as any;
    const locations = locationsResponse.locations || locationsResponse.data || [];
    const locationId = locations[0]?.id;
    if (!locationId) {
      return NextResponse.json({ error: 'No Square location found' }, { status: 400 });
    }

    // Build line items
    const vehicleDesc = [doc.vehicle_year, doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ');
    const lineItems: any[] = [
      {
        name: `${doc.doc_number}${vehicleDesc ? ' -- ' + vehicleDesc : ''}`,
        quantity: '1',
        basePriceMoney: { amount: BigInt(Math.round(balanceDue * 100)), currency: 'USD' },
      },
    ];

    if (ccFee > 0) {
      lineItems.push({
        name: 'Processing Fee',
        quantity: '1',
        basePriceMoney: { amount: BigInt(Math.round(ccFee * 100)), currency: 'USD' },
      });
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
    const sessionKey = idempotencyKey();

    // Create Square Payment Link
    const response: any = await tenantSquare.checkout.paymentLinks.create({
      idempotencyKey: sessionKey,
      order: {
        locationId,
        lineItems,
        referenceId: doc.id, // document ID for webhook lookup
      },
      checkoutOptions: {
        redirectUrl: `${origin}/invoice/${doc.public_token}?paid=true`,
        askForShippingAddress: false,
      },
    });

    const paymentLink = response.paymentLink || response.data;
    if (!paymentLink?.url) {
      return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
    }

    // Store the Square session key on the document for webhook matching
    await supabaseAdmin
      .from('documents')
      .update({
        stripe_checkout_session_id: sessionKey, // reused field for Square
        status: doc.status === 'draft' ? 'sent' : doc.status,
      })
      .eq('id', doc.id);

    return NextResponse.json({ url: paymentLink.url });
  } catch (error) {
    console.error('Invoice pay error:', error);
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
  }
}
