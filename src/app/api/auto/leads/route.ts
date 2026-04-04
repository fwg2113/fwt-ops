import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms, sendEmailRaw } from '@/app/lib/messaging';
import crypto from 'crypto';

// GET /api/auto/leads
// Returns all leads (for lead tracking dashboard)
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_leads')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Leads fetch error:', error);
      return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
    }

    return NextResponse.json({ leads: data || [] });
  } catch (error) {
    console.error('Leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/auto/leads
// Creates a lead + quote document + generates a tokenized booking URL
// Optionally sends the link via SMS or email
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const {
      customer_name, customer_phone, customer_email,
      vehicle_year, vehicle_make, vehicle_model, vehicle_id,
      class_keys, services, total_price, send_method,
      charge_deposit, deposit_amount, options_mode,
    } = body;

    const supabase = getAdminClient();

    // Generate unique token for the booking link
    const token = crypto.randomBytes(16).toString('hex');

    // Upsert customer if phone provided
    let customerId: string | null = null;
    if (customer_phone) {
      const cleanPhone = customer_phone.replace(/\D/g, '');
      if (cleanPhone) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', cleanPhone)
          .eq('shop_id', shopId)
          .single();

        if (existing) {
          customerId = existing.id;
        } else if (customer_name) {
          const parts = customer_name.trim().split(' ');
          const { data: newCust } = await supabase
            .from('customers')
            .insert({
              shop_id: shopId, phone: cleanPhone,
              first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '',
              email: customer_email || null,
            })
            .select('id')
            .single();
          customerId = newCust?.id || null;
        }
      }
    }

    // Create lead record
    const { data: lead, error } = await supabase
      .from('auto_leads')
      .insert({
        shop_id: shopId,
        token,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        vehicle_id: vehicle_id || null,
        class_keys: class_keys || null,
        services,
        total_price,
        charge_deposit: charge_deposit ?? true,
        deposit_amount: deposit_amount ?? 0,
        send_method: send_method || 'copy',
        options_mode: options_mode || false,
        status: 'sent',
      })
      .select()
      .single();

    if (error) {
      console.error('Lead create error:', error);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    // Create a quote document so it shows in Quote Builder
    // Skip for options_mode leads -- the document will be created at booking time
    // with only the customer's selected options (not all options)
    let documentId: string | null = null;
    if (!options_mode) try {
      const { data: docNumber } = await supabase
        .rpc('generate_document_number', { p_shop_id: shopId, p_doc_type: 'quote' });

      const { data: doc } = await supabase
        .from('documents')
        .insert({
          shop_id: shopId,
          doc_type: 'quote',
          doc_number: docNumber || `Q-${Date.now()}`,
          customer_id: customerId,
          customer_name: customer_name || '',
          customer_email: customer_email || null,
          customer_phone: customer_phone || null,
          vehicle_year: vehicle_year || null,
          vehicle_make: vehicle_make || null,
          vehicle_model: vehicle_model || null,
          class_keys: class_keys || null,
          subtotal: total_price || 0,
          balance_due: total_price || 0,
          status: 'sent',
          checkout_type: 'remote',
          notes: `FLQA tailored link -- /book/lead/${token}`,
        })
        .select('id')
        .single();

      if (doc) {
        documentId = doc.id;

        // Create line items from services
        const serviceArr = Array.isArray(services) ? services : [];
        if (serviceArr.length > 0) {
          const lineItems = serviceArr.map((svc: Record<string, unknown>, idx: number) => ({
            document_id: doc.id,
            module: 'auto_tint',
            description: (svc.label as string) || '',
            quantity: 1,
            unit_price: (svc.price as number) || 0,
            line_total: (svc.price as number) || 0,
            sort_order: idx,
            custom_fields: {
              serviceKey: svc.service_key || null,
              filmId: svc.film_id || null,
              filmName: svc.film_name || null,
              shadeFront: svc.shade_front || null,
              shadeRear: svc.shade_rear || null,
              shade: svc.shade_front || null,
            },
          }));
          await supabase.from('document_line_items').insert(lineItems);
        }
      }
    } catch (docErr) {
      console.error('Lead quote document creation error:', docErr);
      // Non-fatal -- lead still works without the document
    }

    // Build the booking URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || '';
    const bookingUrl = `${baseUrl}/book/lead/${token}`;

    // Send the link if method is sms or email
    const vehicleStr = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ');
    let sent = false;

    // Get shop name for messaging
    const { data: shopConfig } = await supabase
      .from('shop_config')
      .select('shop_name')
      .eq('id', shopId)
      .single();
    const shopName = shopConfig?.shop_name || 'Your Shop';

    if (send_method === 'sms' && customer_phone) {
      const depositNote = charge_deposit && deposit_amount > 0
        ? ` A $${deposit_amount} deposit is required to confirm.`
        : '';
      sent = await sendSms(
        customer_phone,
        `${shopName}: Your personalized tint quote for your ${vehicleStr} is ready! View and book here: ${bookingUrl}${depositNote}`
      );
    } else if (send_method === 'email' && customer_email) {
      const depositNote = charge_deposit && deposit_amount > 0
        ? `<p>A <strong>$${deposit_amount}</strong> deposit is required to confirm your appointment.</p>`
        : '<p>No deposit required -- pay in full at your appointment.</p>';
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Your Tint Quote is Ready</h2>
          <p>Hi ${customer_name || 'there'},</p>
          <p>We've put together a personalized window tint quote for your <strong>${vehicleStr}</strong>.</p>
          <p><strong>Total: $${(total_price || 0).toLocaleString()}</strong></p>
          ${depositNote}
          <p style="margin: 24px 0;">
            <a href="${bookingUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">
              View Quote &amp; Book
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">This link is unique to you and contains your pre-selected services.</p>
          <p style="color: #999; font-size: 12px;">${shopName}</p>
        </div>
      `;
      sent = await sendEmailRaw(
        customer_email,
        `Your Window Tint Quote -- ${vehicleStr}`,
        html,
        shopName
      );
    }

    return NextResponse.json({
      lead,
      booking_url: bookingUrl,
      token,
      documentId,
      sent,
      send_method: send_method || 'copy',
    });
  } catch (error) {
    console.error('Lead create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/leads
// Update lead status (e.g., when link is opened or booking is completed)
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const { id, token, ...updates } = body;

    if (!id && !token) {
      return NextResponse.json({ error: 'Lead ID or token required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    let query = supabase.from('auto_leads').update(updates).eq('shop_id', shopId);
    if (id) query = query.eq('id', id);
    else if (token) query = query.eq('token', token);

    const { data, error } = await query.select().single();

    if (error) {
      console.error('Lead update error:', error);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
