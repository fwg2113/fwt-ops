import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { sendSms, sendEmailRaw } from '@/app/lib/messaging';
import crypto from 'crypto';

// GET /api/auto/leads?count_only=1
// Returns all leads (for lead tracking dashboard) or just pending count for sidebar badge
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get('count_only');
    const supabase = getAdminClient();

    if (countOnly) {
      // Lightweight count for sidebar badge: leads that are sent or opened (not booked/expired)
      const { count, error } = await supabase
        .from('auto_leads')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .in('status', ['sent', 'opened']);

      if (error) return NextResponse.json({ pendingCount: 0 });
      return NextResponse.json({ pendingCount: count || 0 });
    }

    const { data, error } = await supabase
      .from('auto_leads')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Leads fetch error:', error);
      return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
    }

    // Also return followup settings for the modal defaults
    const { data: shopConfig } = await supabase
      .from('shop_config')
      .select('followup_enabled, followup_default_discount_type, followup_default_discount_amount, followup_auto_enabled, followup_auto_days, followup_expiry_days')
      .eq('id', shopId)
      .single();

    return NextResponse.json({
      leads: data || [],
      followupSettings: shopConfig || {},
    });
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
      pre_appointment_type, pre_appointment_date, pre_appointment_time,
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

    // Check for existing open lead for this customer + vehicle -- update instead of creating duplicate
    let lead: Record<string, unknown> | null = null;
    let existingToken: string | null = null;
    let documentId: string | null = null;

    const cleanPhone = customer_phone?.replace(/\D/g, '') || null;
    if (cleanPhone && vehicle_year && vehicle_make && vehicle_model) {
      const { data: existingLead } = await supabase
        .from('auto_leads')
        .select('*')
        .eq('shop_id', shopId)
        .eq('customer_phone', customer_phone)
        .eq('vehicle_year', vehicle_year)
        .eq('vehicle_make', vehicle_make)
        .eq('vehicle_model', vehicle_model)
        .in('status', ['sent', 'opened'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        existingToken = existingLead.token as string;
        // Update existing lead with new services, price, deposit settings
        const { data: updated, error: updateErr } = await supabase
          .from('auto_leads')
          .update({
            services,
            total_price,
            charge_deposit: charge_deposit ?? true,
            deposit_amount: deposit_amount ?? 0,
            options_mode: options_mode || false,
            pre_appointment_type: pre_appointment_type || null,
            pre_appointment_date: pre_appointment_date || null,
            pre_appointment_time: pre_appointment_time || null,
            status: 'sent',
          })
          .eq('id', existingLead.id)
          .select()
          .single();

        if (updateErr) {
          console.error('Lead update error:', updateErr);
        } else {
          lead = updated;
        }

        // Update existing quote document if it exists
        documentId = (existingLead.document_id as string) || null;
        if (documentId) {
          await supabase
            .from('documents')
            .update({
              subtotal: total_price || 0,
              balance_due: total_price || 0,
              status: 'sent',
            })
            .eq('id', documentId);

          // Replace line items
          await supabase.from('document_line_items').delete().eq('document_id', documentId);
          const serviceArr = Array.isArray(services) ? services : [];
          if (serviceArr.length > 0) {
            const lineItems = serviceArr.map((svc: Record<string, unknown>, idx: number) => ({
              document_id: documentId,
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
                originalPrice: svc.original_price || null,
                shadeFront: svc.shade_front || null,
                shadeRear: svc.shade_rear || null,
                shade: svc.shade_front || null,
              },
            }));
            await supabase.from('document_line_items').insert(lineItems);
          }
        }
      }
    }

    // If no existing lead found, create a new one
    if (!lead) {
      const { data: newLead, error } = await supabase
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
          pre_appointment_type: pre_appointment_type || null,
          pre_appointment_date: pre_appointment_date || null,
          pre_appointment_time: pre_appointment_time || null,
          status: 'sent',
        })
        .select()
        .single();

      if (error) {
        console.error('Lead create error:', error);
        return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
      }
      lead = newLead;

      // Create a quote document so it shows in Quote Builder
      // Skip for options_mode leads -- the document will be created at booking time
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
                originalPrice: svc.original_price || null,
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
      }
    }

    // Link document to lead if not already linked
    if (documentId && lead && !(lead as Record<string, unknown>).document_id) {
      await supabase.from('auto_leads').update({ document_id: documentId }).eq('id', (lead as Record<string, unknown>).id);
    }

    // Build the booking URL (use existing token if updating)
    const activeToken = existingToken || token;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || '';
    const bookingUrl = `${baseUrl}/book/lead/${activeToken}`;

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
      token: activeToken,
      documentId,
      sent,
      send_method: send_method || 'copy',
      updated: !!existingToken,
    });
  } catch (error) {
    console.error('Lead create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/leads
// Update lead status OR send follow-up with incentive
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const body = await req.json();
    const { id, token, action, ...updates } = body;

    const supabase = getAdminClient();

    // ========== FOLLOW-UP ACTION ==========
    if (action === 'followup') {
      if (!id) return NextResponse.json({ error: 'Lead ID required for follow-up' }, { status: 400 });

      const { discount_type, discount_amount, send_method, message } = body;

      // Get the existing lead
      const { data: lead, error: leadErr } = await supabase
        .from('auto_leads')
        .select('*')
        .eq('id', id)
        .eq('shop_id', shopId)
        .single();

      if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

      // Generate a new token for the follow-up link (fresh link, same lead data)
      const newToken = crypto.randomBytes(16).toString('hex');

      // Update the lead with follow-up info + new token + discount
      // Strip pre-set appointment -- original date/time is likely stale
      const followupUpdates: Record<string, unknown> = {
        token: newToken,
        followup_count: (lead.followup_count || 0) + 1,
        last_followup_at: new Date().toISOString(),
        status: 'sent', // reset to sent
        link_opened_at: null, // reset open tracking
        pre_appointment_type: null,
        pre_appointment_date: null,
        pre_appointment_time: null,
      };

      // Apply discount if provided
      if (discount_type && discount_amount && discount_amount > 0) {
        followupUpdates.followup_discount_type = discount_type;
        followupUpdates.followup_discount_amount = discount_amount;
      } else {
        followupUpdates.followup_discount_type = null;
        followupUpdates.followup_discount_amount = null;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('auto_leads')
        .update(followupUpdates)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });

      // Build the new booking URL
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || '';
      const bookingUrl = `${baseUrl}/book/lead/${newToken}`;

      // Get shop name
      const { data: shopConfig } = await supabase
        .from('shop_config')
        .select('shop_name')
        .eq('id', shopId)
        .single();
      const shopName = shopConfig?.shop_name || 'Your Shop';

      // Build discount text
      let discountText = '';
      if (discount_type && discount_amount && discount_amount > 0) {
        discountText = discount_type === 'dollar'
          ? ` We're offering $${discount_amount} off as a special incentive.`
          : ` We're offering ${discount_amount}% off as a special incentive.`;
      }

      const vehicleStr = [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(' ');
      let sent = false;
      const methods = Array.isArray(send_method) ? send_method : [send_method];

      // Send via SMS
      if (methods.includes('sms') && lead.customer_phone) {
        const smsText = message
          || `${shopName}: Just following up on your ${vehicleStr} tint quote ($${Number(lead.total_price).toLocaleString()}).${discountText} Book here: ${bookingUrl}`;
        sent = await sendSms(lead.customer_phone, smsText) || sent;
      }

      // Send via Email
      if (methods.includes('email') && lead.customer_email) {
        const html = `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Following Up on Your Quote</h2>
            <p>Hi ${lead.customer_name || 'there'},</p>
            <p>We wanted to follow up on the window tint quote we put together for your <strong>${vehicleStr}</strong>.</p>
            <p><strong>Quote Total: $${Number(lead.total_price).toLocaleString()}</strong></p>
            ${discount_type && discount_amount > 0 ? `<p style="color: #16a34a; font-weight: 700;">${discount_type === 'dollar' ? `Special Offer: $${discount_amount} OFF` : `Special Offer: ${discount_amount}% OFF`} -- book now to claim this deal!</p>` : ''}
            <p style="margin: 24px 0;">
              <a href="${bookingUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">
                View Quote &amp; Book Now
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link is unique to you and contains your pre-selected services.</p>
            <p style="color: #999; font-size: 12px;">${shopName}</p>
          </div>
        `;
        const emailSent = await sendEmailRaw(
          lead.customer_email,
          `Following Up -- Your ${vehicleStr} Tint Quote`,
          html,
          shopName
        );
        sent = emailSent || sent;
      }

      return NextResponse.json({ lead: updated, booking_url: bookingUrl, sent });
    }

    // ========== STANDARD STATUS UPDATE ==========
    if (!id && !token) {
      return NextResponse.json({ error: 'Lead ID or token required' }, { status: 400 });
    }

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
