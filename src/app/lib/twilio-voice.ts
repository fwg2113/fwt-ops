/**
 * Twilio REST API helper for server-side voice operations.
 * Call control, conference management, warm transfers.
 * Ported from FWG-ops with shop_id scoping for SaaS.
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
  }
  return { accountSid, authToken };
}

function authHeader() {
  const { accountSid, authToken } = getCredentials();
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

/** Redirect an active call to new TwiML */
export async function redirectCall(callSid: string, twimlUrl: string) {
  const { accountSid } = getCredentials();
  const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Calls/${callSid}.json`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ Url: twimlUrl }),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio redirectCall error:', err);
    throw new Error(err.message || 'Failed to redirect call');
  }
  return res.json();
}

/** Create a new outbound call */
export async function createCall(params: {
  to: string;
  from: string;
  url: string;
  statusCallback?: string;
  statusCallbackEvent?: string[];
}) {
  const { accountSid } = getCredentials();
  const body: Record<string, string> = {
    To: params.to,
    From: params.from,
    Url: params.url,
  };
  if (params.statusCallback) {
    body.StatusCallback = params.statusCallback;
    body.StatusCallbackMethod = 'POST';
  }
  if (params.statusCallbackEvent) {
    body.StatusCallbackEvent = params.statusCallbackEvent.join(' ');
  }

  const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio createCall error:', err);
    throw new Error(err.message || 'Failed to create call');
  }
  return res.json();
}

/** Hang up an active call */
export async function hangupCall(callSid: string) {
  const { accountSid } = getCredentials();
  const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Calls/${callSid}.json`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ Status: 'completed' }),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio hangupCall error:', err);
    throw new Error(err.message || 'Failed to hang up call');
  }
  return res.json();
}

/** Find an in-progress conference by friendly name */
export async function findConference(friendlyName: string) {
  const { accountSid } = getCredentials();
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences.json?FriendlyName=${encodeURIComponent(friendlyName)}&Status=in-progress`,
    { headers: { 'Authorization': authHeader() } }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio findConference error:', err);
    throw new Error(err.message || 'Failed to find conference');
  }
  const data = await res.json();
  return data.conferences?.[0] || null;
}

/** Hold or unhold a conference participant */
export async function holdParticipant(conferenceSid: string, callSid: string, hold: boolean) {
  const { accountSid } = getCredentials();
  const body: Record<string, string> = { Hold: hold ? 'true' : 'false' };
  if (hold) {
    body.HoldUrl = 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.soft-rock';
  }
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences/${conferenceSid}/Participants/${callSid}.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio holdParticipant error:', err);
    throw new Error(err.message || 'Failed to hold/unhold participant');
  }
  return res.json();
}

/** Set endConferenceOnExit on a conference participant */
export async function setEndConferenceOnExit(conferenceSid: string, callSid: string, endOnExit: boolean) {
  const { accountSid } = getCredentials();
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences/${conferenceSid}/Participants/${callSid}.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ EndConferenceOnExit: endOnExit ? 'true' : 'false' }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio setEndConferenceOnExit error:', err);
    throw new Error(err.message || 'Failed to update participant');
  }
  return res.json();
}

/** Remove a participant from a conference */
export async function removeParticipant(conferenceSid: string, callSid: string) {
  const { accountSid } = getCredentials();
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences/${conferenceSid}/Participants/${callSid}.json`,
    {
      method: 'DELETE',
      headers: { 'Authorization': authHeader() },
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = await res.json();
    console.error('Twilio removeParticipant error:', err);
    throw new Error(err.message || 'Failed to remove participant');
  }
  return true;
}

/** List participants in a conference */
export async function listParticipants(conferenceSid: string) {
  const { accountSid } = getCredentials();
  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences/${conferenceSid}/Participants.json`,
    { headers: { 'Authorization': authHeader() } }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error('Twilio listParticipants error:', err);
    throw new Error(err.message || 'Failed to list participants');
  }
  const data = await res.json();
  return data.participants || [];
}
