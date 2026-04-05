'use client';

import { useState, useEffect, useCallback } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { DashboardCard } from '@/app/components/dashboard';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface ClockEntry {
  id: string;
  team_member_name: string;
  clock_in: string;
  clock_out: string | null;
  duration_hours: number | null;
}

interface ClockResult {
  action: 'clock_in' | 'clock_out';
  team_member_name: string;
  time: string;
  duration_hours?: number;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

export default function TimeClockPage() {
  const isMobile = useIsMobile();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClockResult | null>(null);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<ClockEntry[]>([]);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/auto/time-clock?today=true');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        setResult(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const handleSubmit = async () => {
    if (pin.length < 3) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Step 1: Verify PIN to identify the person
      const verifyRes = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.error || 'Invalid PIN');
        setPin('');
        setLoading(false);
        return;
      }

      const { team_member_id } = await verifyRes.json();

      // Step 2: Clock in or out (auto-detect)
      const clockRes = await fetch('/api/auto/time-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id }),
      });

      if (!clockRes.ok) {
        const data = await clockRes.json();
        setError(data.error || 'Clock action failed');
        setPin('');
        setLoading(false);
        return;
      }

      const clockData: ClockResult = await clockRes.json();
      setResult(clockData);
      setPin('');
      fetchEntries();
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
      setResult(null);
    } else if (key === 'enter') {
      handleSubmit();
    } else if (pin.length < 6) {
      setPin(prev => prev + key);
    }
  };

  // Handle physical keyboard
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
        setResult(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const padSize = isMobile ? 64 : 80;
  const padGap = isMobile ? 10 : 14;
  const dotSize = isMobile ? 18 : 22;

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'enter'],
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.pageBg,
      padding: isMobile ? SPACING.lg : SPACING.xxxl,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: SPACING.xxl,
    }}>
      {/* Clock icon */}
      <div style={{ textAlign: 'center', paddingTop: isMobile ? SPACING.lg : SPACING.xxxl }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <h1 style={{
          color: COLORS.textPrimary,
          fontSize: isMobile ? '1.5rem' : FONT.sizePageTitle,
          fontWeight: FONT.weightBold,
          margin: `${SPACING.sm}px 0 0`,
        }}>
          Time Clock
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeLg, margin: `${SPACING.xs}px 0 0` }}>
          Enter your PIN to clock in or out
        </p>
      </div>

      {/* PIN display */}
      <div style={{
        display: 'flex',
        gap: isMobile ? SPACING.md : SPACING.lg,
        justifyContent: 'center',
        minHeight: dotSize + 16,
        alignItems: 'center',
      }}>
        {pin.length > 0 ? (
          Array.from({ length: pin.length }).map((_, i) => (
            <div key={i} style={{
              width: dotSize, height: dotSize, borderRadius: '50%',
              background: COLORS.red, border: `2px solid ${COLORS.red}`,
              transition: 'all 0.15s',
            }} />
          ))
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              width: dotSize, height: dotSize, borderRadius: '50%',
              background: 'transparent', border: `2px solid ${COLORS.borderInput}`,
            }} />
          ))
        )}
      </div>

      {/* Result / Error message */}
      {result && (
        <div style={{
          background: result.action === 'clock_in' ? COLORS.successBg : COLORS.infoBg,
          border: `1px solid ${result.action === 'clock_in' ? COLORS.success : COLORS.info}`,
          borderRadius: RADIUS.lg,
          padding: `${SPACING.lg}px ${SPACING.xxl}px`,
          textAlign: 'center',
        }}>
          <div style={{
            color: result.action === 'clock_in' ? COLORS.success : COLORS.info,
            fontSize: isMobile ? FONT.sizeLg : FONT.sizeXl,
            fontWeight: FONT.weightSemibold,
          }}>
            {result.team_member_name} clocked {result.action === 'clock_in' ? 'in' : 'out'} at {formatTime(result.time)}
            {result.action === 'clock_out' && result.duration_hours != null && (
              <span> ({formatDuration(result.duration_hours)})</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: COLORS.dangerBg,
          border: `1px solid ${COLORS.danger}`,
          borderRadius: RADIUS.lg,
          padding: `${SPACING.md}px ${SPACING.xxl}px`,
          color: COLORS.danger,
          fontSize: FONT.sizeLg,
          fontWeight: FONT.weightMedium,
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
                    border: `1px solid ${isEnter ? COLORS.red : COLORS.borderInput}`,
                    background: isEnter ? COLORS.red : isClear ? 'transparent' : COLORS.inputBg,
                    color: isEnter ? '#ffffff' : isClear ? COLORS.textMuted : COLORS.textPrimary,
                    fontSize: isAction ? (isMobile ? FONT.sizeSm : FONT.sizeMd) : (isMobile ? '1.25rem' : '1.5rem'),
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
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 10 4 15 9 20" />
                      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                    </svg>
                  ) : isClear ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Today's activity */}
      <div style={{ width: '100%', maxWidth: 600, marginTop: SPACING.xl }}>
        <DashboardCard
          title="Today's Activity"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        >
          {entries.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: COLORS.textMuted,
              fontSize: FONT.sizeBase,
              padding: `${SPACING.xxl}px 0`,
            }}>
              No clock entries today
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${SPACING.md}px ${SPACING.lg}px`,
                    background: COLORS.inputBg,
                    borderRadius: RADIUS.md,
                    flexWrap: 'wrap',
                    gap: SPACING.sm,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, minWidth: 0 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: entry.clock_out ? COLORS.textMuted : COLORS.success,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      color: COLORS.textPrimary,
                      fontSize: FONT.sizeBase,
                      fontWeight: FONT.weightMedium,
                    }}>
                      {entry.team_member_name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.lg }}>
                    <span style={{ color: COLORS.textSecondary, fontSize: FONT.sizeMd }}>
                      {formatTime(entry.clock_in)}
                    </span>
                    <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                      {' -- '}
                    </span>
                    <span style={{
                      color: entry.clock_out ? COLORS.textSecondary : COLORS.success,
                      fontSize: FONT.sizeMd,
                      fontWeight: entry.clock_out ? FONT.weightNormal : FONT.weightMedium,
                    }}>
                      {entry.clock_out ? formatTime(entry.clock_out) : 'Working...'}
                    </span>
                    {entry.duration_hours != null && (
                      <span style={{
                        color: COLORS.textMuted,
                        fontSize: FONT.sizeSm,
                        marginLeft: SPACING.xs,
                      }}>
                        {formatDuration(entry.duration_hours)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
