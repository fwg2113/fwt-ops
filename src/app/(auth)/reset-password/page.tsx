'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash after the reset
    // link click. The @supabase/ssr client picks it up automatically.
    // We verify the session exists before showing the form.
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setReady(true);
      } else {
        setError('Invalid or expired reset link. Please request a new one from the login page.');
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push('/');
    }, 2000);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1117', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#1a1d27', borderRadius: 12,
        border: '1px solid #2a2f3a', padding: 40,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: '#dc2626', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 24, height: 24 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', margin: 0 }}>RevFlw</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
            {success ? 'Password updated successfully' : 'Reset your password'}
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Password updated
            </div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>
              Redirecting to dashboard...
            </div>
          </div>
        ) : !ready && error ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              padding: '14px 18px', borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', fontSize: 14, marginBottom: 20,
            }}>
              {error}
            </div>
            <button
              onClick={() => router.push('/login')}
              style={{
                padding: '12px 24px', borderRadius: 8,
                background: '#374151', border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                style={{
                  width: '100%', padding: '12px 16px', fontSize: 16,
                  background: '#0f1117', color: '#ffffff',
                  border: '1px solid #374151', borderRadius: 8, outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  width: '100%', padding: '12px 16px', fontSize: 16,
                  background: '#0f1117', color: '#ffffff',
                  border: '1px solid #374151', borderRadius: 8, outline: 'none',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: 14,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !ready}
              style={{
                width: '100%', padding: '14px 20px', borderRadius: 8,
                background: '#dc2626', border: 'none', color: '#fff',
                fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
                opacity: loading || !ready ? 0.7 : 1,
              }}
            >
              {loading ? 'Updating password...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
