// ============================================================================
// PATCH /api/documents/[id]/upsell-override
// PIN-gated endpoint to manually override the upsell amount on a document.
// Only sets `documents.upsell_override` -- the original starting_total,
// subtotal, and auto-calculated upsell_amount are NEVER touched.
// Records audit trail (who, why, when, before/after).
//
// To clear an override, pass `clear: true` (no PIN required for clearing
// since it just falls back to the auto value).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { pin, new_upsell_amount, reason, shopId, clear } = body;

    const sid = shopId || 1;

    // Fetch the current document (needed for both clear and set paths)
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, booking_id, subtotal, starting_total, upsell_amount, upsell_override')
      .eq('id', documentId)
      .eq('shop_id', sid)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // ---- CLEAR PATH (no PIN required) ----
    if (clear) {
      await supabaseAdmin
        .from('documents')
        .update({ upsell_override: null })
        .eq('id', documentId);

      if (doc.booking_id) {
        await supabaseAdmin
          .from('auto_bookings')
          .update({
            starting_total_override: null,
            starting_total_override_reason: null,
            starting_total_override_by: null,
            starting_total_override_at: null,
            upsell_override_before: null,
            upsell_override_after: null,
          })
          .eq('id', doc.booking_id);
      }

      return NextResponse.json({
        success: true,
        cleared: true,
        upsell_amount: Number(doc.upsell_amount || 0),
      });
    }

    // ---- SET PATH (requires PIN + permission + reason) ----
    if (pin == null || pin === '') {
      return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
    }
    if (new_upsell_amount == null || isNaN(Number(new_upsell_amount)) || Number(new_upsell_amount) < 0) {
      return NextResponse.json({ error: 'Valid new_upsell_amount required (>= 0)' }, { status: 400 });
    }
    if (!reason || !String(reason).trim()) {
      return NextResponse.json({ error: 'Reason is required for audit trail' }, { status: 400 });
    }

    // Verify PIN belongs to active member with upsell_override permission
    const { data: member, error: pinError } = await supabaseAdmin
      .from('team_members')
      .select('id, name, active, team_roles(permissions)')
      .eq('pin', String(pin))
      .eq('shop_id', sid)
      .single();

    if (pinError || !member || !member.active) {
      return NextResponse.json({ valid: false, error: 'Invalid PIN' }, { status: 401 });
    }

    const roleData = member.team_roles as unknown as { permissions: Record<string, boolean> } | null;
    const perms = roleData?.permissions || {};
    const allowed = Boolean(perms.full_access || perms.upsell_override);

    if (!allowed) {
      return NextResponse.json({ error: 'Your role does not allow upsell overrides' }, { status: 403 });
    }

    const newUpsell = Number(new_upsell_amount);
    const upsellBefore = Number(doc.upsell_override ?? doc.upsell_amount ?? 0);

    // Set ONLY the upsell_override column. Original data untouched.
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({ upsell_override: newUpsell })
      .eq('id', documentId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    // Record audit trail on the linked booking
    if (doc.booking_id) {
      await supabaseAdmin
        .from('auto_bookings')
        .update({
          starting_total_override_reason: String(reason).trim(),
          starting_total_override_by: member.name,
          starting_total_override_at: new Date().toISOString(),
          upsell_override_before: upsellBefore,
          upsell_override_after: newUpsell,
        })
        .eq('id', doc.booking_id);
    }

    return NextResponse.json({
      success: true,
      upsell_override: newUpsell,
      override_by: member.name,
    });
  } catch (err) {
    console.error('Upsell override error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
