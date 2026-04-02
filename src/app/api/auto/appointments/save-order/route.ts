import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/appointments/save-order
// Persists the work order positions to work_order_time on each booking
// Body: { positions: [{ id: string, minutes: number }] }
export async function POST(request: NextRequest) {
  try {
    const { positions } = await request.json();

    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: 'Positions array required' }, { status: 400 });
    }

    // Convert minutes to time strings and batch update
    const updates = positions.map((p: { id: string; minutes: number }) => {
      const h = Math.floor(p.minutes / 60);
      const m = p.minutes % 60;
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      return supabaseAdmin
        .from('auto_bookings')
        .update({ work_order_time: timeStr })
        .eq('id', p.id);
    });

    await Promise.all(updates);

    return NextResponse.json({ success: true, count: positions.length });
  } catch (error) {
    console.error('Save order error:', error);
    return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
  }
}
