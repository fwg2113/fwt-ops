import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

// POST /api/voice/token
// Generate JWT access token for browser-based calling (Twilio Voice SDK)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identity = body.identity || 'ops-dashboard';

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const apiKey = process.env.TWILIO_API_KEY!;
    const apiSecret = process.env.TWILIO_API_SECRET!;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID!;

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });

    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
      ttl: 3600,
    });
    token.addGrant(voiceGrant);

    return NextResponse.json({ token: token.toJwt(), identity });
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
