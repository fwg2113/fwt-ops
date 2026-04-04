// ============================================================================
// SQUARE CHECKOUT
// Creates a Square Checkout link for booking deposits.
// Replaces /api/auto/checkout (Stripe version) for tenant customer payments.
// Uses the tenant's Square access token (B2 platform model).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createTenantSquareClient, idempotencyKey } from '@/app/lib/square';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const shopId = body.shopId || 1;

    // Get shop config with Square credentials + deposit settings
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token, square_connected, deposit_amount, require_deposit, cc_fee_percent, cc_fee_flat, shop_name')
      .eq('id', shopId)
      .single();

    if (!shopConfig) {
      return NextResponse.json({ error: 'Shop config not found' }, { status: 500 });
    }

    // If deposit not required or explicitly skipped, skip payment
    if (!shopConfig.require_deposit || body.skipDeposit) {
      return NextResponse.json({ skipPayment: true });
    }

    // Check if Square is connected
    if (!shopConfig.square_connected || !shopConfig.square_access_token) {
      // Fallback: no Square connected, allow manual payment recording
      return NextResponse.json({ skipPayment: true, reason: 'square_not_connected' });
    }

    // Use deposit override if provided (from FLQA tailored links), otherwise shop default
    const depositAmount = body.depositOverride
      ? Number(body.depositOverride)
      : (shopConfig.deposit_amount || 50);

    // Calculate CC fee pass-through if configured
    const ccFeePercent = shopConfig.cc_fee_percent || 0;
    const ccFeeFlat = shopConfig.cc_fee_flat || 0;
    const ccFee = ccFeePercent > 0 || ccFeeFlat > 0
      ? Math.round((depositAmount * (ccFeePercent / 100) + ccFeeFlat) * 100) / 100
      : 0;

    const totalCharge = depositAmount + ccFee;

    // Create a tenant-specific Square client
    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    // Build line items (use 'any' to avoid Square SDK type complexity)
    const lineItems: any[] = [
      {
        name: `Booking Deposit -- ${body.vehicleMake || ''} ${body.vehicleModel || ''}`.trim(),
        quantity: '1',
        basePriceMoney: { amount: BigInt(Math.round(depositAmount * 100)), currency: 'USD' },
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

    // Get tenant's default location
    const locationsResponse = await tenantSquare.locations.list() as any;
    const locations = locationsResponse.locations || locationsResponse.data || [];
    const locationId = locations[0]?.id;
    if (!locationId) {
      return NextResponse.json({ error: 'No Square location found. Please check your Square account setup.' }, { status: 400 });
    }

    const sessionKey = idempotencyKey();

    // Create Square Payment Link
    const response: any = await tenantSquare.checkout.paymentLinks.create({
      idempotencyKey: sessionKey,
      order: {
        locationId,
        lineItems,
      },
      checkoutOptions: {
        redirectUrl: `${origin}/book/confirmation?source=square&session_id=${sessionKey}`,
        askForShippingAddress: false,
      },
    });

    const paymentLink = response.paymentLink || response.data;
    if (!paymentLink?.url) {
      return NextResponse.json({ error: 'Failed to create Square checkout link' }, { status: 500 });
    }

    // Store pending booking (same pattern as Stripe flow)
    const pendingId = `sq_pending_${Date.now().toString(36)}`;
    const { error: insertError } = await supabaseAdmin
      .from('auto_bookings')
      .insert({
        booking_id: pendingId,
        status: 'pending_payment',
        customer_name: `${body.firstName} ${body.lastName}`.trim(),
        customer_email: body.email || null,
        customer_phone: body.phone?.replace(/\D/g, '') || null,
        vehicle_year: body.vehicleYear ? parseInt(body.vehicleYear) : null,
        vehicle_make: body.vehicleMake || null,
        vehicle_model: body.vehicleModel || null,
        class_keys: body.classKeys || null,
        appointment_type: body.appointmentType || 'dropoff',
        appointment_date: body.appointmentDate,
        appointment_time: body.appointmentTime || null,
        duration_minutes: body.durationMinutes || null,
        service_type: body.serviceType || 'tint',
        services_json: body.servicesJson || [],
        subtotal: body.subtotal || 0,
        discount_code: body.discountCode || null,
        discount_type: body.discountType || null,
        discount_percent: body.discountPercent || 0,
        discount_amount: body.discountAmount || 0,
        deposit_paid: 0,
        balance_due: body.balanceDue || 0,
        calendar_title: body.calendarTitle || null,
        emoji_marker: body.emojiMarker || null,
        window_status: body.windowStatus || null,
        has_aftermarket_tint: body.hasAftermarketTint || null,
        additional_interests: body.additionalInterests || null,
        notes: body.notes || null,
        booking_source: 'online',
        stripe_checkout_session_id: sessionKey, // used by verify endpoint to find this booking
        shop_id: shopId,
      });

    if (insertError) {
      console.error('Pending booking insert error:', insertError);
    }

    return NextResponse.json({
      url: paymentLink?.url,
      paymentLinkId: paymentLink?.id,
      orderId: paymentLink?.orderId,
      sessionId: sessionKey,
    });
  } catch (error) {
    console.error('Square checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
