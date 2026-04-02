import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/checkout
// Creates a Stripe Checkout Session for the booking deposit
// Stores booking data in metadata so we can create the appointment after payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get shop config for deposit amount and CC fee settings
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('deposit_amount, require_deposit, cc_fee_percent, cc_fee_flat, shop_name')
      .eq('id', 1)
      .single();

    if (!shopConfig) {
      return NextResponse.json({ error: 'Shop config not found' }, { status: 500 });
    }

    // If deposit is not required (GC booking, internal, etc.), skip Stripe
    if (!shopConfig.require_deposit || body.skipDeposit) {
      return NextResponse.json({ skipPayment: true });
    }

    // Use override amount from request if provided (e.g., lead-specific deposit),
    // otherwise fall back to shop default
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

    // Build line items for Stripe Checkout
    const lineItems: Array<{
      price_data: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
    }> = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Booking Deposit — ${shopConfig.shop_name || 'Window Tinting'}`,
            description: body.calendarTitle || `${body.vehicleYear} ${body.vehicleMake} ${body.vehicleModel}`,
          },
          unit_amount: Math.round(depositAmount * 100), // Stripe uses cents
        },
        quantity: 1,
      },
    ];

    // Add CC fee as separate line item if applicable
    if (ccFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Credit Card Processing Fee',
          },
          unit_amount: Math.round(ccFee * 100),
        },
        quantity: 1,
      });
    }

    // Store the full booking payload in metadata (Stripe allows up to 500 chars per value)
    // We'll store the essential fields and the full services_json separately
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: body.email || undefined,
      metadata: {
        booking_type: 'auto_tint',
        first_name: body.firstName || '',
        last_name: body.lastName || '',
        phone: body.phone || '',
        email: body.email || '',
        vehicle_year: String(body.vehicleYear || ''),
        vehicle_make: body.vehicleMake || '',
        vehicle_model: body.vehicleModel || '',
        class_keys: body.classKeys || '',
        appointment_type: body.appointmentType || '',
        appointment_date: body.appointmentDate || '',
        appointment_time: body.appointmentTime || '',
        duration_minutes: String(body.durationMinutes || ''),
        service_type: body.serviceType || '',
        subtotal: String(body.subtotal || 0),
        balance_due: String(body.balanceDue || 0),
        discount_code: body.discountCode || '',
        discount_type: body.discountType || '',
        discount_percent: String(body.discountPercent || 0),
        discount_amount: String(body.discountAmount || 0),
        deposit_amount: String(depositAmount),
        calendar_title: body.calendarTitle || '',
        emoji_marker: body.emojiMarker || '',
        window_status: body.windowStatus || '',
        has_aftermarket_tint: body.hasAftermarketTint || '',
        notes: body.notes || '',
      },
      success_url: `${origin}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book?cancelled=true`,
    });

    // Store full booking data in a pending record
    // (Stripe metadata has size limits, services_json can be large)
    const { error: insertError } = await supabaseAdmin
      .from('auto_bookings')
      .insert({
        booking_id: `pending_${session.id.slice(-12)}`,
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
        stripe_checkout_session_id: session.id,
      });

    if (insertError) {
      console.error('Pending booking insert error:', insertError);
      // Don't fail the checkout — the customer already has a Stripe session
      // Webhook will handle it via metadata fallback
    }

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
