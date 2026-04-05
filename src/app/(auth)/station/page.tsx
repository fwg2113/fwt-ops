'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

export default function StationLoginPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shake]);

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/station-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Invalid PIN');
        setPin('');
        setShake(true);
        setLoading(false);
        return;
      }

      const { token, user_name, team_member_id, role } = await res.json();
      sessionStorage.setItem('station_token', token);
      sessionStorage.setItem('station_user_name', user_name);
      sessionStorage.setItem('station_team_member_id', team_member_id);
      sessionStorage.setItem('station_role', role);
      router.push('/');
    } catch {
      setError('Connection error. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (key: string) => {
    if (key === 'clear') {
      setPin('');
      setError('');
    } else if (key === 'enter') {
      handleSubmit();
    } else if (pin.length < 6) {
      setPin(prev => prev + key);
    }
  };

  // Physical keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKey(e.key);
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        setPin('');
        setError('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const padSize = isMobile ? 64 : 76;
  const padGap = isMobile ? 10 : 12;
  const dotSize = isMobile ? 16 : 20;

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'enter'],
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xxl,
    }}>
      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: SPACING.xxxl, textAlign: 'center' }}>
        <div style={{
          fontSize: isMobile ? '2rem' : '2.5rem',
          fontWeight: FONT.weightBold,
          color: '#ffffff',
          letterSpacing: '-0.02em',
        }}>
          RevFlw
        </div>
        <div style={{
          marginTop: SPACING.sm,
          display: 'inline-block',
          padding: `${SPACING.xs}px ${SPACING.md}px`,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: RADIUS.md,
          color: 'rgba(255,255,255,0.5)',
          fontSize: FONT.sizeSm,
          fontWeight: FONT.weightMedium,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Station Mode
        </div>
      </div>

      {/* PIN dots */}
      <div
        style={{
          display: 'flex',
          gap: isMobile ? SPACING.md : SPACING.lg,
          justifyContent: 'center',
          marginBottom: SPACING.xxl,
          animation: shake ? 'shake 0.5s ease-in-out' : undefined,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: '50%',
              background: i < pin.length ? '#ffffff' : 'transparent',
              border: `2px solid ${i < pin.length ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
              transition: 'all 0.15s',
            }}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: COLORS.danger,
          fontSize: FONT.sizeBase,
          fontWeight: FONT.weightMedium,
          marginBottom: SPACING.lg,
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Number pad */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: padGap,
      }}>
        {numpadKeys.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: padGap, justifyContent: 'center' }}>
            {row.map((key) => {
              const isAction = key === 'clear' || key === 'enter';
              const isEnter = key === 'enter';
              const isClear = key === 'clear';

              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={loading}
                  style={{
                    width: padSize,
                    height: padSize,
                    borderRadius: RADIUS.xl,
                    border: `1px solid ${isEnter ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.1)'}`,
                    background: isEnter ? '#ffffff' : isClear ? 'transparent' : 'rgba(255,255,255,0.06)',
                    color: isEnter ? '#000000' : isClear ? 'rgba(255,255,255,0.4)' : '#ffffff',
                    fontSize: isAction ? FONT.sizeSm : (isMobile ? '1.25rem' : '1.4rem'),
                    fontWeight: FONT.weightSemibold,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: isAction ? '0.05em' : undefined,
                  }}
                >
                  {isEnter ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 10 4 15 9 20" />
                      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                    </svg>
                  ) : isClear ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                  ) : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: SPACING.xxxl,
        color: 'rgba(255,255,255,0.25)',
        fontSize: FONT.sizeSm,
        textAlign: 'center',
      }}>
        Enter your team PIN to access the dashboard
      </div>
    </div>
  );
}
