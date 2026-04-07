// ============================================================================
// GOOGLE CALENDAR INTEGRATION
// OAuth token management + Calendar event CRUD
// One-way sync: Supabase -> Google Calendar
// ============================================================================

import { supabaseAdmin } from './supabase-server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId?: string;
}

// ============================================================================
// OAUTH HELPERS
// ============================================================================

export function getAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return res.json();
}

// Get a valid access token for a shop (refreshes if expired)
async function getAccessToken(shopId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('shop_config')
    .select('google_calendar_connected, google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
    .eq('id', shopId)
    .single();

  if (!data?.google_calendar_connected || !data.google_calendar_access_token) return null;

  // Check if token is expired (with 5 min buffer)
  const expiry = data.google_calendar_token_expiry ? new Date(data.google_calendar_token_expiry) : null;
  const isExpired = !expiry || expiry.getTime() < Date.now() + 5 * 60 * 1000;

  if (!isExpired) return data.google_calendar_access_token;

  // Refresh the token
  if (!data.google_calendar_refresh_token) return null;

  try {
    const tokens = await refreshAccessToken(data.google_calendar_refresh_token);
    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    await supabaseAdmin
      .from('shop_config')
      .update({
        google_calendar_access_token: tokens.access_token,
        google_calendar_token_expiry: newExpiry.toISOString(),
      })
      .eq('id', shopId);

    return tokens.access_token;
  } catch (err) {
    console.error('Google token refresh failed:', err);
    // Mark as disconnected if refresh fails
    await supabaseAdmin
      .from('shop_config')
      .update({ google_calendar_connected: false })
      .eq('id', shopId);
    return null;
  }
}

// Get the user's email from the access token
export async function getUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch { return null; }
}

// ============================================================================
// CALENDAR EVENT CRUD
// ============================================================================

// Google Calendar color IDs: 1=lavender, 2=sage, 3=grape, 4=flamingo,
// 5=banana, 6=tangerine, 7=peacock, 8=graphite, 9=blueberry, 10=basil, 11=tomato

const APPOINTMENT_TYPE_COLORS: Record<string, string> = {
  dropoff: '7',     // peacock (blue)
  waiting: '6',     // tangerine (orange)
  headsup_30: '5',  // banana (yellow)
  headsup_60: '5',  // banana (yellow)
};

export async function createCalendarEvent(
  shopId: number,
  bookingId: string,
  data: {
    customerName: string;
    vehicleStr: string;
    appointmentDate: string;
    appointmentTime: string | null;
    appointmentType: string;
    services: string;
    subtotal: number;
    depositPaid: number;
    balanceDue: number;
    notes?: string;
    durationMinutes?: number;
    customerPhone?: string;
  }
): Promise<string | null> {
  const accessToken = await getAccessToken(shopId);
  if (!accessToken) return null;

  const { data: config } = await supabaseAdmin
    .from('shop_config')
    .select('google_calendar_id, shop_timezone')
    .eq('id', shopId)
    .single();

  const calendarId = config?.google_calendar_id || 'primary';
  const tz = config?.shop_timezone || 'America/New_York';

  // Build event times
  const duration = data.durationMinutes || 60;
  const time = data.appointmentTime || '08:00';
  const startDt = `${data.appointmentDate}T${time}:00`;
  const endDate = new Date(`${data.appointmentDate}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + duration);
  const endDt = endDate.toISOString().replace('Z', '').split('.')[0];

  const isHeadsUp = data.appointmentType === 'headsup_30' || data.appointmentType === 'headsup_60';
  const typeLabel = data.appointmentType === 'dropoff' ? 'Drop-Off'
    : data.appointmentType === 'waiting' ? 'Waiting'
    : data.appointmentType === 'headsup_30' ? '30m Heads-Up'
    : data.appointmentType === 'headsup_60' ? '60m Heads-Up'
    : data.appointmentType || '';

  const summary = `${data.customerName} - ${data.vehicleStr}`;
  const description = [
    `Type: ${typeLabel}`,
    `Services: ${data.services}`,
    `Total: $${data.subtotal}`,
    data.depositPaid > 0 ? `Deposit Paid: $${data.depositPaid}` : null,
    data.balanceDue > 0 ? `Balance Due: $${data.balanceDue}` : null,
    data.customerPhone ? `Phone: ${data.customerPhone}` : null,
    data.notes ? `Notes: ${data.notes}` : null,
  ].filter(Boolean).join('\n');

  const event: CalendarEvent = {
    summary,
    description,
    start: { dateTime: startDt, timeZone: tz },
    end: { dateTime: endDt, timeZone: tz },
    colorId: APPOINTMENT_TYPE_COLORS[data.appointmentType] || '7',
  };

  // For heads-up appointments, make it an all-day-ish event (morning block)
  if (isHeadsUp) {
    event.start = { dateTime: `${data.appointmentDate}T08:00:00`, timeZone: tz };
    event.end = { dateTime: `${data.appointmentDate}T09:00:00`, timeZone: tz };
  }

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      console.error('Google Calendar create event failed:', await res.text());
      return null;
    }

    const created = await res.json();
    const eventId = created.id;

    // Store event ID on the booking
    if (eventId && bookingId) {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ gcal_event_id: eventId })
        .eq('id', bookingId);
    }

    return eventId;
  } catch (err) {
    console.error('Google Calendar create event error:', err);
    return null;
  }
}

export async function updateCalendarEvent(
  shopId: number,
  eventId: string,
  updates: Partial<{
    summary: string;
    description: string;
    startDateTime: string;
    endDateTime: string;
    colorId: string;
    status: string; // 'cancelled' to delete
  }>
): Promise<boolean> {
  const accessToken = await getAccessToken(shopId);
  if (!accessToken) return false;

  const { data: config } = await supabaseAdmin
    .from('shop_config')
    .select('google_calendar_id, shop_timezone')
    .eq('id', shopId)
    .single();

  const calendarId = config?.google_calendar_id || 'primary';
  const tz = config?.shop_timezone || 'America/New_York';

  const body: Record<string, unknown> = {};
  if (updates.summary) body.summary = updates.summary;
  if (updates.description) body.description = updates.description;
  if (updates.startDateTime) body.start = { dateTime: updates.startDateTime, timeZone: tz };
  if (updates.endDateTime) body.end = { dateTime: updates.endDateTime, timeZone: tz };
  if (updates.colorId) body.colorId = updates.colorId;
  if (updates.status) body.status = updates.status;

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return res.ok;
  } catch (err) {
    console.error('Google Calendar update event error:', err);
    return false;
  }
}

export async function deleteCalendarEvent(shopId: number, eventId: string): Promise<boolean> {
  const accessToken = await getAccessToken(shopId);
  if (!accessToken) return false;

  const { data: config } = await supabaseAdmin
    .from('shop_config')
    .select('google_calendar_id')
    .eq('id', shopId)
    .single();

  const calendarId = config?.google_calendar_id || 'primary';

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 404; // 404 = already deleted
  } catch (err) {
    console.error('Google Calendar delete event error:', err);
    return false;
  }
}

// ============================================================================
// CONVENIENCE: sync a booking to Google Calendar
// Call this after any booking is created or confirmed
// ============================================================================

export async function syncBookingToCalendar(shopId: number, booking: {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_type: string;
  services_json: Array<{ label?: string; filmName?: string; film_name?: string }>;
  subtotal: number;
  deposit_paid: number;
  balance_due: number;
  duration_minutes?: number | null;
  notes?: string | null;
}): Promise<void> {
  const vehicleStr = [booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(' ');
  const services = booking.services_json.map(s => s.label || s.filmName || s.film_name || '').filter(Boolean).join(', ');

  await createCalendarEvent(shopId, booking.id, {
    customerName: booking.customer_name || 'Customer',
    vehicleStr,
    appointmentDate: booking.appointment_date,
    appointmentTime: booking.appointment_time,
    appointmentType: booking.appointment_type || 'dropoff',
    services,
    subtotal: booking.subtotal || 0,
    depositPaid: booking.deposit_paid || 0,
    balanceDue: booking.balance_due || 0,
    durationMinutes: booking.duration_minutes || 60,
    customerPhone: booking.customer_phone || undefined,
    notes: booking.notes || undefined,
  });
}
