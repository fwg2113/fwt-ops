import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// ============================================================================
// GET /api/auto/payroll
// Returns pay config, commission rules, and pay periods for the shop
// ============================================================================
export const GET = withShopAuth(async ({ shopId }) => {
  const supabase = getAdminClient();

  const [payConfigRes, commissionRulesRes, payPeriodsRes, shopConfigRes] = await Promise.all([
    supabase.from('team_pay_config').select('*').eq('shop_id', shopId).eq('active', true),
    supabase.from('team_commission_rules').select('*').eq('shop_id', shopId).eq('active', true).order('sort_order'),
    supabase.from('team_pay_periods').select('*').eq('shop_id', shopId).order('period_start', { ascending: false }).limit(12),
    supabase.from('shop_config').select('pay_period_type, bonus_pool_percent, payroll_modules').eq('id', shopId).single(),
  ]);

  return NextResponse.json({
    payConfigs: payConfigRes.data || [],
    commissionRules: commissionRulesRes.data || [],
    payPeriods: payPeriodsRes.data || [],
    payrollConfig: shopConfigRes.data || {},
  });
});

// ============================================================================
// POST /api/auto/payroll
// Create or update pay config, commission rules, or pay periods
// Body: { action: string, data: Record<string, unknown> }
// ============================================================================
export const POST = withShopAuth(async ({ shopId, req }) => {
  const supabase = getAdminClient();
  const body = await req.json();
  const { action, data } = body;

  // --- Pay Config ---
  if (action === 'upsert_pay_config') {
    const { team_member_id, ...fields } = data;
    if (!team_member_id) return NextResponse.json({ error: 'team_member_id required' }, { status: 400 });

    // Check if exists
    const { data: existing } = await supabase
      .from('team_pay_config')
      .select('id')
      .eq('shop_id', shopId)
      .eq('team_member_id', team_member_id)
      .single();

    if (existing) {
      const { error } = await supabase.from('team_pay_config')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, id: existing.id });
    } else {
      const { data: newRow, error } = await supabase.from('team_pay_config')
        .insert({ shop_id: shopId, team_member_id, ...fields })
        .select('id')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, id: newRow?.id });
    }
  }

  // --- Commission Rules ---
  if (action === 'add_commission_rule') {
    const { error, data: newRule } = await supabase.from('team_commission_rules')
      .insert({ shop_id: shopId, ...data })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: newRule?.id });
  }

  if (action === 'update_commission_rule') {
    const { id, ...fields } = data;
    const { error } = await supabase.from('team_commission_rules')
      .update(fields)
      .eq('id', id)
      .eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'delete_commission_rule') {
    const { error } = await supabase.from('team_commission_rules')
      .update({ active: false })
      .eq('id', data.id)
      .eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Pay Periods ---
  if (action === 'create_pay_period') {
    const { error, data: newPeriod } = await supabase.from('team_pay_periods')
      .insert({ shop_id: shopId, ...data })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: newPeriod?.id });
  }

  // --- Calculate Commissions for a Pay Period ---
  if (action === 'calculate_commissions') {
    const { pay_period_id } = data;
    if (!pay_period_id) return NextResponse.json({ error: 'pay_period_id required' }, { status: 400 });

    // Get the pay period
    const { data: period } = await supabase.from('team_pay_periods')
      .select('*').eq('id', pay_period_id).eq('shop_id', shopId).single();
    if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });

    // Clear existing calculated entries for this period (not manual adjustments)
    await supabase.from('team_pay_entries')
      .delete()
      .eq('pay_period_id', pay_period_id)
      .eq('shop_id', shopId)
      .in('entry_type', ['base', 'commission', 'bonus_pool']);

    // Get all active team members with pay config
    const { data: payConfigs } = await supabase.from('team_pay_config')
      .select('*, team_members(id, name)')
      .eq('shop_id', shopId)
      .eq('active', true);

    // Get all commission rules
    const { data: rules } = await supabase.from('team_commission_rules')
      .select('*').eq('shop_id', shopId).eq('active', true);

    // Get all completed/paid documents (invoices) in this period
    // These are the source for commission calculations
    const { data: documents } = await supabase.from('documents')
      .select('id, doc_type, subtotal, starting_total, customer_name, assigned_team_member_id, module, status')
      .eq('shop_id', shopId)
      .gte('created_at', period.period_start)
      .lte('created_at', period.period_end + 'T23:59:59')
      .in('status', ['sent', 'approved', 'paid', 'completed']);

    // Also get bookings for starting_total_override
    const { data: bookings } = await supabase.from('auto_bookings')
      .select('id, document_id, starting_total_override, subtotal, module, assigned_team_member_id')
      .eq('shop_id', shopId)
      .gte('appointment_date', period.period_start)
      .lte('appointment_date', period.period_end);

    // Build a map of document_id -> booking for override lookup
    const bookingByDocId = new Map<number, { starting_total_override: number | null; subtotal: number }>();
    for (const b of (bookings || [])) {
      if (b.document_id) {
        bookingByDocId.set(b.document_id, {
          starting_total_override: b.starting_total_override,
          subtotal: b.subtotal,
        });
      }
    }

    // Get P&L data for bonus pool
    const { data: revenueData } = await supabase.from('transactions')
      .select('amount')
      .eq('shop_id', shopId)
      .eq('direction', 'IN')
      .gte('txn_date', period.period_start)
      .lte('txn_date', period.period_end);

    const { data: expenseData } = await supabase.from('transactions')
      .select('amount')
      .eq('shop_id', shopId)
      .eq('direction', 'OUT')
      .gte('txn_date', period.period_start)
      .lte('txn_date', period.period_end);

    const totalRevenue = (revenueData || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpenses = (expenseData || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const bonusPoolPercent = period.bonus_pool_percent || 25;
    const bonusPoolAmount = Math.max(0, netProfit * (bonusPoolPercent / 100));

    const entries: Array<Record<string, unknown>> = [];

    for (const pc of (payConfigs || [])) {
      const memberId = pc.team_member_id;
      const memberName = (pc.team_members as { name: string })?.name || '';

      // --- Base Pay ---
      let basePay = 0;
      if (pc.pay_type === 'weekly') {
        // Count whole weeks in period (round to nearest)
        const start = new Date(period.period_start + 'T12:00:00');
        const end = new Date(period.period_end + 'T12:00:00');
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const weeks = Math.round(days / 7);
        basePay = Number(pc.base_rate) * weeks;
      } else if (pc.pay_type === 'salary') {
        basePay = Math.round(Number(pc.base_rate) / 12 * 100) / 100; // monthly portion of annual salary
      } else if (pc.pay_type === 'hourly') {
        // Hourly requires time clock data -- placeholder for now
        basePay = 0; // will be calculated from time clock entries
      }

      if (basePay > 0) {
        entries.push({
          shop_id: shopId,
          pay_period_id,
          team_member_id: memberId,
          entry_type: 'base',
          amount: Math.round(basePay * 100) / 100,
          description: `Base Pay - ${memberName} (${pc.pay_type} @ $${pc.base_rate})`,
        });
      }

      // --- Commissions ---
      const memberRules = (rules || []).filter(r => r.team_member_id === memberId);
      for (const rule of memberRules) {
        let commissionTotal = 0;

        // Find matching documents
        const matchedDocs = (documents || []).filter(doc => {
          // Module match
          const docModule = doc.module || 'auto_tint';
          if (rule.module_keys.length > 0 && !rule.module_keys.includes(docModule)) return false;
          // Assignment match
          if (rule.only_assigned && doc.assigned_team_member_id !== memberId) return false;
          return true;
        });

        for (const doc of matchedDocs) {
          if (rule.commission_type === 'revenue_percent') {
            const revenue = Number(doc.subtotal || 0);
            const commission = revenue * (Number(rule.commission_rate) / 100);
            commissionTotal += commission;

            entries.push({
              shop_id: shopId,
              pay_period_id,
              team_member_id: memberId,
              entry_type: 'commission',
              amount: Math.round(commission * 100) / 100,
              description: `${rule.label}: $${revenue.toFixed(2)} @ ${rule.commission_rate}%`,
              source_document_id: doc.id,
              source_module: doc.module,
              commission_rule_id: rule.id,
              starting_total: null,
              final_total: revenue,
              upsell_amount: null,
            });

          } else if (rule.commission_type === 'upsell_percent') {
            // Use override if set, otherwise use document's starting_total
            const booking = bookingByDocId.get(doc.id);
            const startingTotal = booking?.starting_total_override ?? Number(doc.starting_total || 0);
            const finalTotal = Number(doc.subtotal || 0);
            const upsell = finalTotal - startingTotal;

            if (upsell > 0) {
              const commission = upsell * (Number(rule.commission_rate) / 100);
              commissionTotal += commission;

              entries.push({
                shop_id: shopId,
                pay_period_id,
                team_member_id: memberId,
                entry_type: 'commission',
                amount: Math.round(commission * 100) / 100,
                description: `${rule.label}: $${upsell.toFixed(2)} upsell @ ${rule.commission_rate}%`,
                source_document_id: doc.id,
                source_module: doc.module,
                commission_rule_id: rule.id,
                starting_total: startingTotal,
                final_total: finalTotal,
                upsell_amount: upsell,
              });
            }

          } else if (rule.commission_type === 'flat_per_job') {
            commissionTotal += Number(rule.commission_rate);

            entries.push({
              shop_id: shopId,
              pay_period_id,
              team_member_id: memberId,
              entry_type: 'commission',
              amount: Number(rule.commission_rate),
              description: `${rule.label}: flat $${rule.commission_rate} per job`,
              source_document_id: doc.id,
              source_module: doc.module,
              commission_rule_id: rule.id,
            });
          }
        }
      }

      // --- Bonus Pool ---
      if (pc.bonus_pool_eligible && Number(pc.bonus_pool_weight) > 0 && bonusPoolAmount > 0) {
        const bonusShare = bonusPoolAmount * Number(pc.bonus_pool_weight);
        entries.push({
          shop_id: shopId,
          pay_period_id,
          team_member_id: memberId,
          entry_type: 'bonus_pool',
          amount: Math.round(bonusShare * 100) / 100,
          description: `Bonus Pool: ${(Number(pc.bonus_pool_weight) * 100).toFixed(0)}% of $${bonusPoolAmount.toFixed(2)} pool`,
        });
      }
    }

    // Insert all entries
    if (entries.length > 0) {
      const { error: insertError } = await supabase.from('team_pay_entries').insert(entries);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update pay period with pool data
    await supabase.from('team_pay_periods').update({
      bonus_pool_revenue: totalRevenue,
      bonus_pool_profit: netProfit,
      bonus_pool_amount: bonusPoolAmount,
      status: 'calculated',
      updated_at: new Date().toISOString(),
    }).eq('id', pay_period_id);

    return NextResponse.json({ success: true, entriesCreated: entries.length });
  }

  // --- Edit Pay Period ---
  if (action === 'edit_pay_period') {
    const { pay_period_id, ...fields } = data;
    if (!pay_period_id) return NextResponse.json({ error: 'pay_period_id required' }, { status: 400 });
    const { error } = await supabase.from('team_pay_periods').update({
      ...fields,
      updated_at: new Date().toISOString(),
    }).eq('id', pay_period_id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Delete Pay Period ---
  if (action === 'delete_pay_period') {
    const { pay_period_id } = data;
    if (!pay_period_id) return NextResponse.json({ error: 'pay_period_id required' }, { status: 400 });
    // Delete posted transactions for this period
    await supabase.from('transactions').delete().eq('shop_id', shopId).eq('job_id', `payroll-${pay_period_id}`);
    // Delete entries first (cascade should handle it but be explicit)
    await supabase.from('team_pay_entries').delete().eq('pay_period_id', pay_period_id).eq('shop_id', shopId);
    const { error } = await supabase.from('team_pay_periods').delete().eq('id', pay_period_id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Post to Ledger (auto-create transactions from pay entries) ---
  if (action === 'post_to_ledger') {
    const { pay_period_id } = data;
    if (!pay_period_id) return NextResponse.json({ error: 'pay_period_id required' }, { status: 400 });

    // Get the period
    const { data: period } = await supabase.from('team_pay_periods')
      .select('*').eq('id', pay_period_id).eq('shop_id', shopId).single();
    if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });

    // Delete any previously posted payroll transactions for this period
    await supabase.from('transactions')
      .delete()
      .eq('shop_id', shopId)
      .eq('job_id', `payroll-${pay_period_id}`);

    // Get all entries grouped by team member (include brand_ids for brand attribution)
    const { data: entries } = await supabase.from('team_pay_entries')
      .select('*, team_members(name, brand_ids)')
      .eq('pay_period_id', pay_period_id)
      .eq('shop_id', shopId);

    if (!entries || entries.length === 0) {
      return NextResponse.json({ success: true, transactionsCreated: 0 });
    }

    // Get brands for short_name lookup
    const { data: brandsData } = await supabase.from('brands')
      .select('id, short_name, name').eq('shop_id', shopId);
    const brandMap = new Map((brandsData || []).map(b => [b.id, b.short_name || b.name]));

    // Group entries by team member and entry type category
    const memberTotals = new Map<string, { name: string; brand: string; base: number; commission: number; bonus: number; adjustment: number; total: number }>();

    for (const entry of entries) {
      const memberId = entry.team_member_id;
      const memberData = entry.team_members as unknown as { name: string; brand_ids: number[] | null } | null;
      if (!memberTotals.has(memberId)) {
        // Determine brand from team member's brand_ids (use first brand, or 'default')
        const memberBrandIds = memberData?.brand_ids || [];
        const memberBrand = memberBrandIds.length > 0 ? (brandMap.get(memberBrandIds[0]) || 'default') : 'default';
        memberTotals.set(memberId, { name: memberData?.name || 'Unknown', brand: memberBrand, base: 0, commission: 0, bonus: 0, adjustment: 0, total: 0 });
      }
      const m = memberTotals.get(memberId)!;
      const amt = Number(entry.amount || 0);
      if (entry.entry_type === 'base') m.base += amt;
      else if (entry.entry_type === 'commission') m.commission += amt;
      else if (entry.entry_type === 'bonus_pool') m.bonus += amt;
      else m.adjustment += amt;
      m.total += amt;
    }

    // Create transactions for each team member
    const txnDate = period.period_end; // post on the last day of the period
    const transactions: Array<Record<string, unknown>> = [];

    for (const [, member] of memberTotals) {
      // Base pay as Payroll
      if (member.base > 0) {
        const { data: txnId } = await supabase.rpc('generate_transaction_id', { p_shop_id: shopId });
        transactions.push({
          shop_id: shopId,
          transaction_id: txnId || `TXN-${Date.now()}`,
          txn_date: txnDate,
          brand: member.brand,
          direction: 'OUT',
          event_type: 'EXPENSE',
          amount: Math.round(member.base * 100) / 100,
          category: 'Payroll',
          vendor_or_customer: member.name,
          memo: `${period.period_label || 'Pay Period'} - Base Pay`,
          posted_by: 'payroll_system',
          job_id: `payroll-${pay_period_id}`,
        });
      }

      // Commission as Commission
      if (member.commission > 0) {
        const { data: txnId } = await supabase.rpc('generate_transaction_id', { p_shop_id: shopId });
        transactions.push({
          shop_id: shopId,
          transaction_id: txnId || `TXN-${Date.now()}`,
          txn_date: txnDate,
          brand: member.brand,
          direction: 'OUT',
          event_type: 'EXPENSE',
          amount: Math.round(member.commission * 100) / 100,
          category: 'Commission',
          vendor_or_customer: member.name,
          memo: `${period.period_label || 'Pay Period'} - Commission`,
          posted_by: 'payroll_system',
          job_id: `payroll-${pay_period_id}`,
        });
      }

      // Bonus as Payroll (or separate category if you prefer)
      if (member.bonus > 0) {
        const { data: txnId } = await supabase.rpc('generate_transaction_id', { p_shop_id: shopId });
        transactions.push({
          shop_id: shopId,
          transaction_id: txnId || `TXN-${Date.now()}`,
          txn_date: txnDate,
          brand: member.brand,
          direction: 'OUT',
          event_type: 'EXPENSE',
          amount: Math.round(member.bonus * 100) / 100,
          category: 'Payroll',
          vendor_or_customer: member.name,
          memo: `${period.period_label || 'Pay Period'} - Bonus Pool`,
          posted_by: 'payroll_system',
          job_id: `payroll-${pay_period_id}`,
        });
      }

      // Adjustments
      if (member.adjustment !== 0) {
        const { data: txnId } = await supabase.rpc('generate_transaction_id', { p_shop_id: shopId });
        transactions.push({
          shop_id: shopId,
          transaction_id: txnId || `TXN-${Date.now()}`,
          txn_date: txnDate,
          brand: member.brand,
          direction: 'OUT',
          event_type: 'EXPENSE',
          amount: Math.round(Math.abs(member.adjustment) * 100) / 100,
          category: 'Payroll',
          vendor_or_customer: member.name,
          memo: `${period.period_label || 'Pay Period'} - Adjustment`,
          posted_by: 'payroll_system',
          job_id: `payroll-${pay_period_id}`,
        });
      }
    }

    if (transactions.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(transactions);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transactionsCreated: transactions.length });
  }

  // --- Finalize Pay Period ---
  if (action === 'finalize_pay_period') {
    const { pay_period_id } = data;
    const { error } = await supabase.from('team_pay_periods').update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: 'owner',
    }).eq('id', pay_period_id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Edit Pay Entry (override amount) ---
  if (action === 'edit_entry') {
    const { entry_id, amount, description, override_reason } = data;
    if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 });
    const { error } = await supabase.from('team_pay_entries').update({
      amount: Number(amount),
      description: description || undefined,
      override_by: 'owner',
      override_reason: override_reason || 'Manual adjustment',
    }).eq('id', entry_id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Delete Pay Entry ---
  if (action === 'delete_entry') {
    const { entry_id } = data;
    if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 });
    const { error } = await supabase.from('team_pay_entries').delete().eq('id', entry_id).eq('shop_id', shopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Add Manual Adjustment ---
  if (action === 'add_adjustment') {
    const { error } = await supabase.from('team_pay_entries').insert({
      shop_id: shopId,
      ...data,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // --- Override Starting Total on Booking ---
  if (action === 'override_starting_total') {
    const { booking_id, override_amount, reason } = data;
    const { error } = await supabase.from('auto_bookings').update({
      starting_total_override: override_amount,
      starting_total_override_reason: reason,
      starting_total_override_by: 'owner',
    }).eq('id', booking_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
