import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { createInvoiceFromBooking } from '@/app/lib/invoice-utils';

// GET /api/auto/appointments?date=2026-03-25
// Returns all appointments for a given date (defaults to today)
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const vehicleYear = searchParams.get('vehicle_year');
    const vehicleMake = searchParams.get('vehicle_make');
    const vehicleModel = searchParams.get('vehicle_model');
    const limit = searchParams.get('limit');

    // Vehicle-based query (for warranty prior appointment lookup)
    const isVehicleQuery = vehicleYear && vehicleMake && vehicleModel;

    let query = supabase
      .from('auto_bookings')
      .select('*')
      .eq('shop_id', shopId)
      .not('status', 'in', '("pending_payment","cancelled")');

    if (isVehicleQuery) {
      query = query
        .eq('vehicle_year', parseInt(vehicleYear))
        .eq('vehicle_make', vehicleMake)
        .eq('vehicle_model', vehicleModel)
        .order('appointment_date', { ascending: false });
      if (limit) query = query.limit(parseInt(limit));
    } else {
      query = query
        .eq('appointment_date', date)
        .order('appointment_time', { ascending: true, nullsFirst: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Appointments fetch error:', error);
      return NextResponse.json({ error: 'Failed to load appointments' }, { status: 500 });
    }

    // Fetch linked slots for any appointments that have a linked_group_id
    const linkedGroupIds = [...new Set(
      (data || [])
        .map(a => a.linked_group_id)
        .filter((id): id is string => !!id)
    )];

    let linkedSlotsMap: Record<string, Array<{ id: string; module: string; status: string; booking_id: string }>> = {};

    if (linkedGroupIds.length > 0) {
      const { data: linkedData } = await supabase
        .from('auto_bookings')
        .select('id, module, status, booking_id, linked_group_id')
        .in('linked_group_id', linkedGroupIds);

      if (linkedData) {
        // Group by linked_group_id
        for (const slot of linkedData) {
          const gid = slot.linked_group_id as string;
          if (!linkedSlotsMap[gid]) linkedSlotsMap[gid] = [];
          linkedSlotsMap[gid].push({
            id: slot.id,
            module: slot.module || 'auto_tint',
            status: slot.status,
            booking_id: slot.booking_id,
          });
        }
      }
    }

    // Attach linked_slots to each appointment (excluding self)
    const enrichedData = (data || []).map(apt => ({
      ...apt,
      module: apt.module || 'auto_tint',
      linked_slots: apt.linked_group_id
        ? (linkedSlotsMap[apt.linked_group_id] || []).filter(s => s.id !== apt.id)
        : undefined,
    }));

    // Fetch active team members + module colors + assignment settings for this shop
    const [{ data: teamMembersData }, { data: shopModulesData }, { data: shopConfigData }] = await Promise.all([
      supabase
        .from('team_members')
        .select('id, name, phone, module_permissions')
        .eq('shop_id', shopId)
        .eq('active', true)
        .order('name'),
      supabase
        .from('shop_modules')
        .select('custom_color, service_modules(module_key, label, color)')
        .eq('shop_id', shopId)
        .eq('enabled', true),
      supabase
        .from('shop_config')
        .select('team_assignment_enabled, team_assignment_required_before_checkin')
        .eq('id', shopId)
        .single(),
    ]);

    // Build module color + label maps (custom_color overrides service_modules.color)
    const moduleColorMap: Record<string, string> = {};
    const moduleLabelMap: Record<string, string> = {};
    if (shopModulesData) {
      for (const sm of shopModulesData) {
        const smod = sm.service_modules as unknown as { module_key: string; label: string; color: string } | null;
        if (!smod) continue;
        const key = smod.module_key;
        if (key) {
          moduleColorMap[key] = sm.custom_color || smod.color || '#6b7280';
          moduleLabelMap[key] = smod.label || key;
        }
      }
    }

    const teamMembers = (teamMembersData || []).map(tm => ({
      id: tm.id,
      name: tm.name,
      phone: tm.phone || null,
      module_permissions: tm.module_permissions || [],
    }));

    // Build a lookup for team member names
    const teamNameMap: Record<string, string> = {};
    for (const tm of teamMembers) {
      teamNameMap[tm.id] = tm.name;
    }

    // Attach team member names to each appointment (single + multi)
    const finalData = enrichedData.map(apt => ({
      ...apt,
      assigned_team_member_name: apt.assigned_team_member_id
        ? teamNameMap[apt.assigned_team_member_id] || null
        : null,
      assigned_team_member_ids: apt.assigned_team_member_ids || [],
      assigned_team_member_names: (apt.assigned_team_member_ids || [])
        .map((id: string) => teamNameMap[id])
        .filter(Boolean),
    }));

    // Also get day summary
    // - "paid" only counts truly invoiced rows (not 'completed', which means
    //   "work done but not yet invoiced" — that's the state seeded historic
    //   rows are in before checkout, and live rows are in after work is marked
    //   complete but before the team clicks Invoice).
    // - "Est. Revenue" mixes actual + estimate: for paid rows use total_paid
    //   (the real amount collected, after discounts), for everything else use
    //   subtotal (the menu-price estimate of what the day SHOULD bring in).
    const booked = finalData.filter(a => a.status !== 'cancelled');
    const paid = booked.filter(a => a.status === 'invoiced').length;
    const unpaid = booked.filter(a => a.status !== 'invoiced');
    const dropoffs = unpaid.filter(a => a.appointment_type === 'dropoff').length;
    const waiting = unpaid.filter(a => a.appointment_type === 'waiting').length;
    const headsups = unpaid.filter(a => a.appointment_type === 'flex_wait').length;
    const totalRevenue = booked.reduce((sum, a) => {
      // Paid rows: count what was actually collected (already includes deposit
      // because of the total_paid fix in createDocumentFromBooking).
      // Unpaid rows: count the estimated value from the booking subtotal.
      const actualOrEstimate = a.status === 'invoiced'
        ? Number(a.total_paid || 0)
        : Number(a.subtotal || 0);
      return sum + actualOrEstimate;
    }, 0);
    const totalBalance = booked.reduce((sum, a) => sum + Number(a.balance_due || 0), 0);

    return NextResponse.json({
      appointments: finalData,
      teamMembers,
      moduleColorMap,
      moduleLabelMap,
      teamAssignmentConfig: {
        enabled: shopConfigData?.team_assignment_enabled ?? true,
        requiredBeforeCheckin: shopConfigData?.team_assignment_required_before_checkin ?? false,
      },
      summary: {
        total: booked.length,
        dropoffs,
        waiting,
        headsups,
        paid,
        cancelled: (data || []).filter(a => a.status === 'cancelled').length,
        totalRevenue,
        totalBalance,
      },
    });
  } catch (error) {
    console.error('Appointments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/appointments
// Update an appointment (status change, edit details, etc.)
// For linked appointments: checks if all siblings are complete to trigger group-level actions
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('auto_bookings')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('Appointment update error:', error);
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    let allLinkedComplete = false;
    let linkedGroupInfo: { group_id: string; slots: Array<{ id: string; module: string; status: string }> } | null = null;

    // Check linked group status when a slot's status changes
    if (updates.status && data.linked_group_id) {
      const { data: siblings } = await supabase
        .from('auto_bookings')
        .select('id, module, status')
        .eq('linked_group_id', data.linked_group_id)
        .neq('status', 'cancelled');

      if (siblings && siblings.length > 1) {
        allLinkedComplete = siblings.every(s => s.status === 'completed' || s.status === 'invoiced');
        linkedGroupInfo = {
          group_id: data.linked_group_id,
          slots: siblings.map(s => ({ id: s.id, module: s.module || 'auto_tint', status: s.status })),
        };
      }
    }

    // Auto-invoice hooks based on checkout_flow_config
    if (updates.status) {
      try {
        const { data: shopConfig } = await supabase
          .from('shop_config')
          .select('checkout_flow_config, linked_invoice_auto_create')
          .eq('id', shopId)
          .single();

        const config = shopConfig?.checkout_flow_config as { invoice_creation?: string } | null;
        const invoiceCreation = config?.invoice_creation || 'manual';

        // Standalone appointment: standard auto-invoice logic
        if (!data.linked_group_id) {
          if (
            (invoiceCreation === 'at_checkin' && updates.status === 'in_progress') ||
            (invoiceCreation === 'at_ready' && updates.status === 'completed')
          ) {
            await createInvoiceFromBooking(id);
          }
        }

        // Linked group: auto-invoice when ALL slots are complete
        if (data.linked_group_id && allLinkedComplete && shopConfig?.linked_invoice_auto_create) {
          // If the linked group came from a document, the invoice already exists there
          // Just update all slots to 'invoiced' status
          if (data.document_id) {
            const { data: siblings } = await supabase
              .from('auto_bookings')
              .select('id')
              .eq('linked_group_id', data.linked_group_id)
              .neq('status', 'invoiced')
              .neq('status', 'cancelled');

            if (siblings) {
              for (const sib of siblings) {
                await supabase
                  .from('auto_bookings')
                  .update({ status: 'invoiced' })
                  .eq('id', sib.id);
              }
            }
          } else {
            // No document -- create invoice from the first slot (standalone linked group)
            await createInvoiceFromBooking(id);
          }
        }
      } catch (err) {
        console.error('Auto-invoice hook error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      appointment: data,
      allLinkedComplete,
      linkedGroupInfo,
    });
  } catch (error) {
    console.error('Appointment update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
