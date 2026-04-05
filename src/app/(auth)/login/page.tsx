'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : authError.message
      );
      setLoading(false);
      return;
    }

    // Redirect to dashboard
    router.push('/');
    router.refresh();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createSupabaseBrowser();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: '#dc2626', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 24, height: 24 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 12h18M12 3v18" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', margin: 0 }}>RevFlw</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Reset your password'}
          </p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '12px 16px', fontSize: 16,
                  background: '#0f1117', color: '#ffffff',
                  border: '1px solid #374151', borderRadius: 8,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '12px 16px', fontSize: 16,
                  background: '#0f1117', color: '#ffffff',
                  border: '1px solid #374151', borderRadius: 8,
                  outline: 'none',
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
              disabled={loading}
              style={{
                width: '100%', padding: '14px 20px', borderRadius: 8,
                background: '#dc2626', border: 'none', color: '#fff',
                fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setMode('reset'); setError(''); }}
              style={{
                width: '100%', padding: '10px', marginTop: 12,
                background: 'none', border: 'none', color: '#6b7280',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            {resetSent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#22c55e', marginBottom: 16 }}>
                  Check your email for a password reset link.
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setResetSent(false); }}
                  style={{
                    padding: '10px 20px', background: 'none',
                    border: '1px solid #374151', borderRadius: 8,
                    color: '#9ca3af', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{
                      width: '100%', padding: '12px 16px', fontSize: 16,
                      background: '#0f1117', color: '#ffffff',
                      border: '1px solid #374151', borderRadius: 8,
                      outline: 'none',
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
                  disabled={loading}
                  style={{
                    width: '100%', padding: '14px 20px', borderRadius: 8,
                    background: '#dc2626', border: 'none', color: '#fff',
                    fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                  style={{
                    width: '100%', padding: '10px', marginTop: 12,
                    background: 'none', border: 'none', color: '#6b7280',
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Back to sign in
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
