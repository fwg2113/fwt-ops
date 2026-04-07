import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// PATCH: Save view preferences for a specific page
// Body: { page: string, modules: string[] }
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    // Verify the user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { page, modules } = body;

    if (!page || !Array.isArray(modules)) {
      return NextResponse.json({ error: 'page (string) and modules (string[]) required' }, { status: 400 });
    }

    // Look up team member
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: teamMember } = await admin
      .from('team_members')
      .select('id, view_preferences')
      .eq('auth_user_id', user.id)
      .eq('active', true)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: 'No team member record found' }, { status: 403 });
    }

    // Merge new page preference into existing preferences
    const existing = (teamMember.view_preferences as Record<string, string[]>) || {};
    const updated = { ...existing, [page]: modules };

    const { error: updateError } = await admin
      .from('team_members')
      .update({ view_preferences: updated })
      .eq('id', teamMember.id);

    if (updateError) {
      console.error('Update view_preferences error:', updateError);
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
    }

    return NextResponse.json({ viewPreferences: updated });
  } catch (err) {
    console.error('Preferences error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
