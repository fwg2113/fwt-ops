'use client';

import { useState, useCallback } from 'react';
import { COLORS, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useStationMode } from './StationModeProvider';

// ============================================================================
// PIN ESCALATION OVERLAY
// Full-screen PIN pad that appears when a station user tries to access
// a restricted page. On valid PIN, escalates access temporarily.
// ============================================================================

export default function PinEscalationOverlay() {
  const { showPinOverlay, onPinSuccess, dismissPinOverlay } = useStationMode();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigit = useCallback((digit: string) => {
    if (pin.length >= 6) return;
    setPin(prev => prev + digit);
    setError('');
  }, [pin]);

  const handleClear = useCallback(() => {
    setPin('');
    setError('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 3 || checking) return;
    setChecking(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, shopId: 1 }),
      });
      const data = await res.json();

      if (data.valid) {
        // Check if this user has elevated permissions
        const perms = data.rolePermissions || {};
        if (perms.full_access || Object.values(perms).some(v => v === true)) {
          onPinSuccess({
            teamMemberId: data.teamMemberId,
            name: data.name,
            role: data.role,
            permissions: perms,
          });
          setPin('');
        } else {
          setError('This PIN does not have elevated access');
          triggerShake();
        }
      } else {
        setError('Invalid PIN');
        triggerShake();
      }
    } catch {
      setError('Verification failed');
      triggerShake();
    }
    setChecking(false);
  }, [pin, checking, onPinSuccess]);

  function triggerShake() {
    setShake(true);
    setPin('');
    setTimeout(() => setShake(false), 500);
  }

  if (!showPinOverlay) return null;

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 340, padding: 32,
        textAlign: 'center',
      }}>
        {/* Header */}
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: 'rgba(220,38,38,0.15)', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          Authorization Required
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
          Enter your PIN to access this feature
        </div>

        {/* PIN display */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24,
          animation: shake ? 'pinShake 0.4s ease' : undefined,
        }}>
          {pin.length > 0 ? (
            Array.from({ length: pin.length }).map((_, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: '#dc2626',
                transition: 'background 0.15s',
              }} />
            ))
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: '#374151',
              }} />
            ))
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {/* Number pad */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, marginBottom: 16,
        }}>
          {digits.map(d => (
            <button key={d} onClick={() => handleDigit(d)} style={{
              height: 56, borderRadius: RADIUS.md, border: 'none',
              background: '#1f2937', color: '#fff', fontSize: 22, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.1s',
            }}>
              {d}
            </button>
          ))}
          <button onClick={handleClear} style={{
            height: 56, borderRadius: RADIUS.md, border: 'none',
            background: '#1f2937', color: '#9ca3af', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}>
            Clear
          </button>
          <button onClick={() => handleDigit('0')} style={{
            height: 56, borderRadius: RADIUS.md, border: 'none',
            background: '#1f2937', color: '#fff', fontSize: 22, fontWeight: 600,
            cursor: 'pointer',
          }}>
            0
          </button>
          <button onClick={handleSubmit} disabled={pin.length < 3 || checking} style={{
            height: 56, borderRadius: RADIUS.md, border: 'none',
            background: pin.length >= 3 ? '#dc2626' : '#374151',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: pin.length >= 4 ? 'pointer' : 'default',
            opacity: checking ? 0.7 : 1,
          }}>
            {checking ? '...' : 'Go'}
          </button>
        </div>

        {/* Cancel */}
        <button onClick={dismissPinOverlay} style={{
          background: 'none', border: 'none', color: '#6b7280',
          fontSize: 14, cursor: 'pointer', padding: '8px 16px',
        }}>
          Cancel
        </button>

        <style>{`
          @keyframes pinShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-10px); }
            40% { transform: translateX(10px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
          }
        `}</style>
      </div>
    </div>
  );
}
