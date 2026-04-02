import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// GET /api/auto/inquiries
// Returns all vehicle inquiries (booking_source = 'phone')
export const GET = withShopAuth(async ({ shopId }) => {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('auto_bookings')
      .select('*')
      .eq('shop_id', shopId)
      .eq('booking_source', 'phone')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to load inquiries' }, { status: 500 });
    }

    return NextResponse.json({ inquiries: data || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PATCH /api/auto/inquiries — update inquiry status/notes
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { data, error } = await supabase
      .from('auto_bookings')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    return NextResponse.json({ success: true, inquiry: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
