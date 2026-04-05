import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST /api/auto/time-clock
// Clock in or clock out a team member via PIN
export async function POST(req: NextRequest) {
  try {
    const { teamMemberId, pin, action } = await req.json();

    if (!teamMemberId || !pin || !action) {
      return NextResponse.json(
        { error: 'teamMemberId, pin, and action are required' },
        { status: 400 }
      );
    }

    if (action !== 'clock_in' && action !== 'clock_out') {
      return NextResponse.json(
        { error: 'action must be clock_in or clock_out' },
        { status: 400 }
      );
    }

    // Verify PIN matches team member
    const { data: member, error: memberError } = await supabaseAdmin
      .from('team_members')
      .select('id, name, pin, shop_id, active')
      .eq('id', teamMemberId)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (!member.active) {
      return NextResponse.json({ error: 'Team member is inactive' }, { status: 403 });
    }

    if (member.pin !== pin) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const now = new Date().toISOString();

    if (action === 'clock_in') {
      // Check for existing open entry (prevent double clock-in)
      const { data: openEntry } = await supabaseAdmin
        .from('time_clock_entries')
        .select('id')
        .eq('team_member_id', teamMemberId)
        .is('clock_out', null)
        .limit(1)
        .single();

      if (openEntry) {
        return NextResponse.json(
          { error: 'Already clocked in. Clock out first.' },
          { status: 409 }
        );
      }

      const { data: entry, error: insertError } = await supabaseAdmin
        .from('time_clock_entries')
        .insert({
          shop_id: member.shop_id,
          team_member_id: teamMemberId,
          clock_in: now,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Clock in error:', insertError);
        return NextResponse.json({ error: 'Failed to clock in' }, { status: 500 });
      }

      return NextResponse.json({ entry, message: `${member.name} clocked in` });
    }

    // clock_out
    const { data: openEntry, error: findError } = await supabaseAdmin
      .from('time_clock_entries')
      .select('*')
      .eq('team_member_id', teamMemberId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (findError || !openEntry) {
      return NextResponse.json(
        { error: 'No open clock-in entry found' },
        { status: 404 }
      );
    }

    const clockInTime = new Date(openEntry.clock_in).getTime();
    const clockOutTime = new Date(now).getTime();
    const durationMinutes = Math.round((clockOutTime - clockInTime) / 60000);

    const { data: entry, error: updateError } = await supabaseAdmin
      .from('time_clock_entries')
      .update({
        clock_out: now,
        duration_minutes: durationMinutes,
      })
      .eq('id', openEntry.id)
      .select()
      .single();

    if (updateError) {
      console.error('Clock out error:', updateError);
      return NextResponse.json({ error: 'Failed to clock out' }, { status: 500 });
    }

    return NextResponse.json({ entry, message: `${member.name} clocked out (${durationMinutes} min)` });
  } catch (error) {
    console.error('Time clock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/auto/time-clock?shopId=1&teamMemberId=xxx&date=2026-04-04
// Returns time clock entries filtered by shop, optionally by member and date
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get('shopId');
    const teamMemberId = searchParams.get('teamMemberId');
    const date = searchParams.get('date');

    if (!shopId) {
      return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('time_clock_entries')
      .select('*, team_members(name, role)')
      .eq('shop_id', shopId)
      .order('clock_in', { ascending: false });

    if (teamMemberId) {
      query = query.eq('team_member_id', teamMemberId);
    }

    if (date) {
      // Filter entries where clock_in falls on the given date
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      query = query.gte('clock_in', dayStart).lte('clock_in', dayEnd);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Time clock fetch error:', error);
      return NextResponse.json({ error: 'Failed to load time clock entries' }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [] });
  } catch (error) {
    console.error('Time clock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
