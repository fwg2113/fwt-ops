import { NextResponse } from 'next/server';

// POST /api/auth/station-logout
// Clears the station_token HttpOnly cookie. Called on sign-out from station mode.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('station_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // expire immediately
  });
  return res;
}
