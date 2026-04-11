'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface SlotData {
  time: string;
  display: string;
  status: 'available' | 'taken' | 'expired' | 'yours' | 'claimed' | 'held' | 'your_hold';
  holdSecondsLeft?: number;
}

interface PageData {
  shopName: string;
  shopPhone: string;
  customerFirstName: string;
  vehicle: string | null;
  appointmentDate: string;
  appointmentDateDisplay: string;
  noticeMinutes: number;
  offerStatus: string;
  claimedTime: string | null;
  slots: SlotData[];
}

export default function HeadsUpSlotPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimedDisplay, setClaimedDisplay] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [rescheduled, setRescheduled] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newTimeRequested, setNewTimeRequested] = useState(false);
  const [requestingNewTime, setRequestingNewTime] = useState(false);
  const [holdingSlot, setHoldingSlot] = useState(false);
  const [holdExpiry, setHoldExpiry] = useState<number | null>(null); // timestamp when hold expires
  const [holdCountdown, setHoldCountdown] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0); // timestamp of last fetch, for local countdown interpolation
  const [tickCounter, setTickCounter] = useState(0); // forces re-render every second

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto/headsup/slots?token=${token}`);
      if (!res.ok) { setError('This link is no longer valid.'); return; }
      const d = await res.json();
      setData(d);
      setFetchedAt(Date.now());
      if (d.offerStatus === 'claimed' && d.claimedTime) {
        setClaimed(true);
        setClaimedDisplay(d.claimedTime);
      }
      if (d.offerStatus === 'reschedule_requested') {
        setRescheduled(true);
      }
    } catch {
      setError('Unable to load. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Poll every 10 seconds for real-time slot updates
  useEffect(() => {
    if (claimed || rescheduled || error) return;
    const interval = setInterval(fetchSlots, 10000);
    return () => clearInterval(interval);
  }, [fetchSlots, claimed, rescheduled, error]);

  // Tick every second to interpolate held countdowns between polls
  useEffect(() => {
    if (claimed || rescheduled || error) return;
    const interval = setInterval(() => setTickCounter(c => c + 1), 1000);
    return () => clearInterval(interval);
  }, [claimed, rescheduled, error]);

  // Hold countdown timer
  useEffect(() => {
    if (!holdExpiry) { setHoldCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((holdExpiry - Date.now()) / 1000));
      setHoldCountdown(remaining);
      if (remaining <= 0) {
        setHoldExpiry(null);
        setSelectedTime(null);
        fetchSlots(); // refresh to release the hold visually
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdExpiry, fetchSlots]);

  async function handleSelectSlot(time: string) {
    if (holdingSlot) return;
    // Deselect if tapping same slot
    if (selectedTime === time) {
      setSelectedTime(null);
      setHoldExpiry(null);
      setClaimError(null);
      return;
    }
    setHoldingSlot(true);
    setClaimError(null);
    try {
      const res = await fetch('/api/auto/headsup/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, time }),
      });
      const result = await res.json();
      if (result.success) {
        setSelectedTime(time);
        setHoldExpiry(Date.now() + 90 * 1000); // 90 second hold
      } else {
        const msgs: Record<string, string> = {
          slot_taken: 'That slot was just claimed.',
          slot_held: 'Someone else is selecting that slot right now.',
          slot_expired: 'That time has passed.',
        };
        setClaimError(msgs[result.error] || 'Unable to select. Try another time.');
        fetchSlots();
      }
    } catch {
      setClaimError('Something went wrong. Try again.');
    } finally {
      setHoldingSlot(false);
    }
  }

  async function handleClaim() {
    if (!selectedTime) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch('/api/auto/headsup/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, time: selectedTime }),
      });
      const result = await res.json();
      if (result.success) {
        const slot = data?.slots.find(s => s.time === selectedTime);
        setClaimed(true);
        setClaimedDisplay(slot?.display || selectedTime);
      } else {
        const msgs: Record<string, string> = {
          slot_taken: 'Someone just grabbed that slot. Pick another one.',
          slot_expired: 'That time has passed the notice window.',
          already_claimed: 'You already picked a time.',
        };
        setClaimError(msgs[result.error] || 'Unable to claim. Please try again.');
        fetchSlots(); // refresh to show updated statuses
      }
    } catch {
      setClaimError('Something went wrong. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  async function handleReschedule() {
    setRescheduling(true);
    try {
      const res = await fetch('/api/auto/headsup/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (result.success) setRescheduled(true);
    } catch { /* silent */ }
    setRescheduling(false);
  }

  async function handleRequestNewTime() {
    setRequestingNewTime(true);
    try {
      const res = await fetch('/api/auto/headsup/request-new-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (result.success) setNewTimeRequested(true);
    } catch { /* silent */ }
    setRequestingNewTime(false);
  }

  // -- STYLES (mobile-first, clean, large touch targets) --
  const pageStyle: React.CSSProperties = {
    maxWidth: 480, margin: '0 auto', padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a1a', minHeight: '100vh',
    background: '#fafafa',
  };
  const headerStyle: React.CSSProperties = {
    textAlign: 'center', marginBottom: 24,
  };
  const shopNameStyle: React.CSSProperties = {
    fontSize: '0.8rem', fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8,
  };
  const greetingStyle: React.CSSProperties = {
    fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 4px',
  };
  const subStyle: React.CSSProperties = {
    fontSize: '0.9rem', color: '#6b7280',
  };
  const slotCardStyle = (status: string, isSelected: boolean): React.CSSProperties => {
    const canSelect = status === 'available' || status === 'your_hold';
    const isHeld = status === 'held';
    return {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', borderRadius: 12, marginBottom: 10,
      cursor: canSelect ? 'pointer' : 'default',
      background: isSelected ? '#dc2626' : isHeld ? '#fef3c7' : canSelect ? '#fff' : '#f3f4f6',
      border: isSelected ? '2px solid #dc2626' : isHeld ? '2px solid #f59e0b' : canSelect ? '2px solid #e5e7eb' : '2px solid #f3f4f6',
      opacity: canSelect || isSelected || isHeld ? 1 : 0.5,
      transition: 'all 0.15s',
    };
  };
  const slotTimeStyle = (isSelected: boolean): React.CSSProperties => ({
    fontSize: '1.2rem', fontWeight: 700,
    color: isSelected ? '#fff' : '#1a1a1a',
  });
  const slotStatusLabel = (slot: SlotData, isSelected: boolean): string => {
    if (isSelected) return holdCountdown > 0 ? `Selected -- ${holdCountdown}s` : 'Selected';
    if (slot.status === 'available') return 'Available';
    if (slot.status === 'your_hold') return holdCountdown > 0 ? `Selected -- ${holdCountdown}s` : 'Selected';
    if (slot.status === 'held') return slot.holdSecondsLeft ? `Held -- ${slot.holdSecondsLeft}s` : 'Held';
    if (slot.status === 'taken') return 'Taken';
    if (slot.status === 'yours') return 'Yours';
    return 'Expired';
  };
  const slotStatusStyle = (status: string, isSelected: boolean): React.CSSProperties => ({
    fontSize: '0.75rem', fontWeight: 600,
    color: isSelected ? 'rgba(255,255,255,0.8)' : status === 'taken' ? '#ef4444' : status === 'held' ? '#f59e0b' : status === 'expired' ? '#9ca3af' : '#22c55e',
    textTransform: 'uppercase',
  });
  const confirmBtnStyle: React.CSSProperties = {
    width: '100%', padding: '16px', borderRadius: 12,
    background: selectedTime ? '#dc2626' : '#d1d5db',
    color: '#fff', fontSize: '1rem', fontWeight: 700,
    border: 'none', cursor: selectedTime ? 'pointer' : 'not-allowed',
    marginTop: 16, transition: 'background 0.15s',
  };
  const rescheduleStyle: React.CSSProperties = {
    textAlign: 'center', marginTop: 24, paddingTop: 24,
    borderTop: '1px solid #e5e7eb',
  };
  const centerCardStyle: React.CSSProperties = {
    textAlign: 'center', padding: '48px 24px',
    background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
  };

  // -- LOADING --
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...centerCardStyle, color: '#6b7280' }}>Loading...</div>
      </div>
    );
  }

  // -- ERROR --
  if (error || !data) {
    return (
      <div style={pageStyle}>
        <div style={centerCardStyle}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>{error || 'Something went wrong'}</div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Please contact the shop if you need assistance.</div>
        </div>
      </div>
    );
  }

  // -- CLAIMED (success state) --
  if (claimed) {
    return (
      <div style={pageStyle}>
        <div style={centerCardStyle}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>You're all set!</div>
          <div style={{ fontSize: '1.1rem', color: '#374151', marginBottom: 4 }}>
            Your appointment is at <strong>{claimedDisplay}</strong> today.
          </div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: 24 }}>Please arrive 5 minutes early.</div>
          {data.shopPhone && (
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Questions? Call or text: <a href={`tel:${data.shopPhone}`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>{data.shopPhone}</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -- RESCHEDULED --
  if (rescheduled) {
    return (
      <div style={pageStyle}>
        <div style={centerCardStyle}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>No problem!</div>
          <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>We've let the team know you need to reschedule. Someone will reach out.</div>
        </div>
      </div>
    );
  }

  // -- NEW TIME REQUESTED --
  if (newTimeRequested) {
    return (
      <div style={pageStyle}>
        <div style={centerCardStyle}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>New time requested!</div>
          <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>The team has been notified and will send you a new time slot shortly. Keep an eye on your texts.</div>
        </div>
      </div>
    );
  }

  // -- SLOT PICKER (main state) --
  const availableSlots = data.slots.filter(s => s.status === 'available' || s.status === 'your_hold' || s.status === 'held');

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={shopNameStyle}>{data.shopName}</div>
        <h1 style={greetingStyle}>Hi {data.customerFirstName}!</h1>
        <div style={subStyle}>Pick your time for today</div>
        {data.vehicle && <div style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 600, marginTop: 8 }}>{data.vehicle}</div>}
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 2 }}>{data.appointmentDateDisplay}</div>
      </div>

      {/* Slots */}
      {availableSlots.length === 0 ? (
        <div style={{ ...centerCardStyle, marginBottom: 16 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>These time slots have expired.</div>
          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 16 }}>No worries -- tap below and the team will send you a fresh time.</div>
          <button
            onClick={handleRequestNewTime}
            disabled={requestingNewTime}
            style={{
              width: '100%', padding: '14px', borderRadius: 10,
              background: '#f59e0b', color: '#fff', fontSize: '1rem', fontWeight: 700,
              border: 'none', cursor: 'pointer',
            }}
          >
            {requestingNewTime ? 'Requesting...' : 'Request a New Time'}
          </button>
        </div>
      ) : (
        <div>
          {data.slots.map(slot => {
            const isSelected = selectedTime === slot.time;
            const canTap = slot.status === 'available' || slot.status === 'your_hold';
            return (
              <div
                key={slot.time}
                onClick={() => canTap ? handleSelectSlot(slot.time) : undefined}
                style={slotCardStyle(slot.status, isSelected)}
              >
                <span style={slotTimeStyle(isSelected)}>{slot.display}</span>
                {(() => {
                  // Show circle countdown for holds (own or others)
                  // For own hold: use client-side holdCountdown (ticks every second)
                  // For others' holds: interpolate from server holdSecondsLeft minus elapsed since fetch
                  let seconds = 0;
                  if (isSelected || slot.status === 'your_hold') {
                    seconds = holdCountdown;
                  } else if (slot.status === 'held' && slot.holdSecondsLeft) {
                    const elapsed = Math.floor((Date.now() - fetchedAt) / 1000);
                    seconds = Math.max(0, slot.holdSecondsLeft - elapsed);
                    void tickCounter; // reference to trigger re-render
                  }
                  if (seconds > 0 && (isSelected || slot.status === 'held' || slot.status === 'your_hold')) {
                    const isOwn = isSelected || slot.status === 'your_hold';
                    return (
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(245,158,11,0.15)',
                        border: `2px solid ${isOwn ? 'rgba(255,255,255,0.5)' : '#f59e0b'}`,
                      }}>
                        <span style={{
                          fontSize: '1rem', fontWeight: 800,
                          color: isOwn ? '#fff' : '#f59e0b',
                          lineHeight: 1,
                        }}>
                          {seconds}
                        </span>
                      </div>
                    );
                  }
                  // Regular text status
                  return (
                    <span style={slotStatusStyle(slot.status, isSelected)}>
                      {slotStatusLabel(slot, isSelected)}
                    </span>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Claim error */}
      {claimError && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, marginTop: 8 }}>
          {claimError}
        </div>
      )}

      {/* Confirm button */}
      {availableSlots.length > 0 && (
        <button
          onClick={handleClaim}
          disabled={!selectedTime || claiming}
          style={confirmBtnStyle}
        >
          {claiming ? 'Confirming...' : selectedTime
            ? (holdCountdown > 0 ? `Confirm Time (${holdCountdown}s)` : 'Confirm Time')
            : 'Select a time above'}
        </button>
      )}

      {/* Reschedule */}
      <div style={rescheduleStyle}>
        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 8 }}>Need to reschedule instead?</div>
        <button
          onClick={handleReschedule}
          disabled={rescheduling}
          style={{
            padding: '10px 24px', borderRadius: 8,
            background: 'transparent', border: '1px solid #d1d5db',
            color: '#6b7280', fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {rescheduling ? 'Submitting...' : 'I need to reschedule'}
        </button>
      </div>
    </div>
  );
}
