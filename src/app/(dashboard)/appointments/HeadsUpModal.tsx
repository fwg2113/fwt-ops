'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import Modal from '@/app/components/dashboard/Modal';
import type { Appointment } from './AppointmentCard';

interface OfferStatus {
  id: string;
  bookingId: string;
  mode: string;
  status: string;
  claimedTime: string | null;
  claimedAt: string | null;
  rescheduleRequested: boolean;
  sentAt: string;
  customerName: string;
  vehicle: string;
  appointmentType: string;
}

interface Props {
  appointments: Appointment[];
  selectedDate: string;
  onClose: () => void;
  onRefresh: () => void;
}

const DEFAULT_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30','18:00',
];

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function HeadsUpModal({ appointments, selectedDate, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<'individual' | 'pool' | 'manage'>('individual');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [manageSlots, setManageSlots] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferStatus[]>([]);
  const [pools, setPools] = useState<{ id: string; status: string; slots: Array<{ time: string; claimed_by: string | null }> }[]>([]);
  const [bypassTimeLimits, setBypassTimeLimits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Initialize manage slots when switching to manage tab
  useEffect(() => {
    if (tab !== 'manage') return;
    const activePool = pools.find(p => p.status === 'active');
    if (activePool) {
      setManageSlots(new Set((activePool.slots as Array<{ time: string }>).map(s => s.time)));
    }
  }, [tab, pools]);

  // Fetch existing offer statuses
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto/headsup/status?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
        setPools(data.pools || []);
      }
    } catch { /* silent */ }
  }, [selectedDate]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll status every 15s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Filter: only not-yet-notified appointments for sending
  const unnotified = useMemo(() =>
    appointments.filter(a => !a.headsup_notified_at),
  [appointments]);

  const selectedApt = useMemo(() =>
    unnotified.find(a => a.id === selectedCustomerId) || null,
  [unnotified, selectedCustomerId]);

  // Current time for slot expiry
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  function isSlotExpired(time: string, noticeMin: number): boolean {
    if (bypassTimeLimits) return false;
    const slotDate = new Date(`${selectedDate}T${time}:00`);
    const cutoff = new Date(slotDate.getTime() - noticeMin * 60 * 1000);
    return now > cutoff;
  }

  function toggleSlot(time: string) {
    setSelectedSlots(prev => {
      const next = new Set(prev);
      if (next.has(time)) next.delete(time);
      else next.add(time);
      return next;
    });
  }

  function quickFill(mode: 'next3' | 'afternoon' | 'all') {
    const nowHour = now.getHours();
    const nowMin = now.getMinutes();
    const slots = new Set<string>();
    for (const time of DEFAULT_SLOTS) {
      const [h, m] = time.split(':').map(Number);
      if (mode === 'next3') {
        const slotMinutes = h * 60 + m;
        const nowMinutes = nowHour * 60 + nowMin;
        if (slotMinutes >= nowMinutes + 30 && slotMinutes <= nowMinutes + 180) slots.add(time);
      } else if (mode === 'afternoon') {
        if (h >= 12) slots.add(time);
      } else {
        if (!isSlotExpired(time, 30)) slots.add(time);
      }
    }
    setSelectedSlots(slots);
  }

  async function handleSendIndividual() {
    if (!selectedApt || selectedSlots.size === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auto/headsup/send-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: selectedApt.id,
          slots: Array.from(selectedSlots).sort(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        setSentMessage(`Sent to ${selectedApt.customer_name}`);
        onRefresh();
        fetchStatus();
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch { setError('Failed to send'); }
    setSending(false);
  }

  async function handleSendPool() {
    if (unnotified.length === 0 || selectedSlots.size === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auto/headsup/send-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingIds: unnotified.map(a => a.id),
          slots: Array.from(selectedSlots).sort(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        setSentMessage(`Pool sent to ${unnotified.length} customer${unnotified.length !== 1 ? 's' : ''}`);
        onRefresh();
        fetchStatus();
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch { setError('Failed to send'); }
    setSending(false);
  }

  const dateDisplay = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Chip style
  const chipStyle = (selected: boolean, expired: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: RADIUS.md, cursor: expired ? 'not-allowed' : 'pointer',
    background: selected ? 'rgba(245,158,11,0.2)' : expired ? COLORS.pageBg : COLORS.inputBg,
    border: `2px solid ${selected ? '#f59e0b' : expired ? 'transparent' : COLORS.borderInput}`,
    color: selected ? '#f59e0b' : expired ? COLORS.textPlaceholder : COLORS.textPrimary,
    fontSize: FONT.sizeSm, fontWeight: selected ? 700 : 500,
    opacity: expired ? 0.4 : 1,
    transition: 'all 0.1s',
    textDecoration: expired ? 'line-through' : 'none',
  });

  return (
    <Modal title={`Flex-Wait -- ${dateDisplay}`} onClose={onClose} width={600}>
      {sent ? (
        <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>{sentMessage}</div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary, marginTop: 8 }}>
            Customers will receive an SMS with their personalized link.
          </div>
          <button onClick={onClose} style={{
            marginTop: SPACING.lg, padding: `${SPACING.md}px ${SPACING.xl}px`,
            background: COLORS.red, color: '#fff', border: 'none', borderRadius: RADIUS.md,
            cursor: 'pointer', fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
          }}>Done</button>
        </div>
      ) : (
        <>
          {/* Queue list */}
          <div style={{ marginBottom: SPACING.lg }}>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
              Today's Flex-Wait Queue ({appointments.length})
            </div>
            {appointments.length === 0 ? (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontStyle: 'italic' }}>No flex-wait appointments for today.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {appointments.map(apt => {
                  const offer = offers.find(o => o.bookingId === apt.id);
                  const isSelected = selectedCustomerId === apt.id && tab === 'individual';
                  return (
                    <div
                      key={apt.id}
                      onClick={() => { if (tab === 'individual' && !apt.headsup_notified_at) setSelectedCustomerId(apt.id); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: SPACING.md,
                        padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                        background: isSelected ? COLORS.activeBg : COLORS.inputBg,
                        border: isSelected ? `2px solid #f59e0b` : `1px solid ${COLORS.borderInput}`,
                        cursor: tab === 'individual' && !apt.headsup_notified_at ? 'pointer' : 'default',
                        opacity: apt.headsup_notified_at ? 0.6 : 1,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                          {apt.customer_name}
                        </div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>
                          {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                          {' -- '}Flex-Wait
                        </div>
                      </div>
                      {/* Status badge */}
                      {offer ? (
                        <span style={{
                          fontSize: FONT.sizeXs, fontWeight: 700, padding: '2px 8px', borderRadius: RADIUS.sm,
                          background: offer.status === 'claimed' ? 'rgba(34,197,94,0.15)' : offer.status === 'reschedule_requested' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: offer.status === 'claimed' ? '#22c55e' : offer.status === 'reschedule_requested' ? '#ef4444' : '#f59e0b',
                        }}>
                          {offer.status === 'claimed' ? `Claimed ${offer.claimedTime ? formatTimeDisplay(offer.claimedTime) : ''}` : offer.status === 'reschedule_requested' ? 'Reschedule' : 'Pending'}
                        </span>
                      ) : apt.headsup_notified_at ? (
                        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Sent</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tab selector */}
          {(() => {
            const pendingOffers = offers.filter(o => o.status === 'pending');
            const activePool = pools.find(p => p.status === 'active');
            const hasActive = pendingOffers.length > 0 || !!activePool;
            const tabs: { key: 'individual' | 'pool' | 'manage'; label: string; show: boolean }[] = [
              { key: 'individual', label: 'Individual', show: unnotified.length > 0 },
              { key: 'pool', label: `Pool (${unnotified.length})`, show: unnotified.length > 0 },
              { key: 'manage', label: 'Manage Slots', show: hasActive },
            ];
            const visibleTabs = tabs.filter(t => t.show);
            if (visibleTabs.length === 0) return null;
            return (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: SPACING.lg, background: COLORS.inputBg, borderRadius: RADIUS.md, padding: 3 }}>
                {visibleTabs.map(t => (
                  <button key={t.key} onClick={() => {
                    setTab(t.key);
                    setSelectedSlots(new Set());
                    setError(null);
                    setSaveMessage(null);
                    if (t.key === 'manage') {
                      // Initialize manage slots from active pool or first pending individual offer
                      if (activePool) {
                        setManageSlots(new Set(activePool.slots.map(s => s.time)));
                      } else if (pendingOffers.length > 0) {
                        const offer = pendingOffers[0];
                        // Need to fetch the offer's slots - use offered_slots from status
                        // For now just initialize empty; the API returns offered_slots
                      }
                    }
                  }}
                    style={{
                      flex: 1, padding: `${SPACING.sm}px`, borderRadius: RADIUS.sm, cursor: 'pointer',
                      background: tab === t.key ? COLORS.cardBg : 'transparent',
                      border: tab === t.key ? `1px solid ${COLORS.borderInput}` : '1px solid transparent',
                      color: tab === t.key ? COLORS.textPrimary : COLORS.textMuted,
                      fontSize: FONT.sizeSm, fontWeight: tab === t.key ? FONT.weightBold : FONT.weightMedium,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Individual: select customer prompt */}
              {tab === 'individual' && !selectedApt && (
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontStyle: 'italic', marginBottom: SPACING.lg }}>
                  Select a customer above to send them a heads-up.
                </div>
              )}

              {/* Slot picker (shows when: individual + customer selected, or pool tab) */}
              {((tab === 'individual' && selectedApt) || tab === 'pool') && (
                <div>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
                    {tab === 'individual' ? `Times to offer ${selectedApt?.customer_name.split(' ')[0]}` : 'Pool times (first come, first served)'}
                  </div>

                  {/* Quick fill buttons + bypass toggle */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: SPACING.md, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { label: 'Next 3 hrs', mode: 'next3' as const },
                      { label: 'Afternoon', mode: 'afternoon' as const },
                      { label: 'All open', mode: 'all' as const },
                    ].map(qf => (
                      <button key={qf.mode} onClick={() => quickFill(qf.mode)} style={{
                        padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                        background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                        color: COLORS.textSecondary, fontSize: FONT.sizeXs, fontWeight: 600,
                      }}>
                        {qf.label}
                      </button>
                    ))}
                    {selectedSlots.size > 0 && (
                      <button onClick={() => setSelectedSlots(new Set())} style={{
                        padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                        background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                        color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: 600,
                      }}>
                        Clear
                      </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={bypassTimeLimits} onChange={e => setBypassTimeLimits(e.target.checked)}
                        style={{ width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Override time limits</span>
                    </label>
                  </div>

                  {/* Time grid */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.lg }}>
                    {DEFAULT_SLOTS.map(time => {
                      const noticeMin = 0; // flex_wait has no fixed notice
                      const expired = isSlotExpired(time, noticeMin);
                      const selected = selectedSlots.has(time);
                      return (
                        <button
                          key={time}
                          onClick={() => !expired && toggleSlot(time)}
                          style={chipStyle(selected, expired)}
                        >
                          {formatTimeDisplay(time)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Error */}
                  {error && (
                    <div style={{ padding: '8px 12px', borderRadius: RADIUS.sm, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: FONT.sizeXs, fontWeight: 600, marginBottom: SPACING.md }}>
                      {error}
                    </div>
                  )}

                  {/* Send button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={tab === 'individual' ? handleSendIndividual : handleSendPool}
                      disabled={selectedSlots.size === 0 || sending}
                      style={{
                        padding: `${SPACING.md}px ${SPACING.xl}px`, borderRadius: RADIUS.md,
                        background: selectedSlots.size > 0 ? '#f59e0b' : COLORS.inputBg,
                        color: selectedSlots.size > 0 ? '#fff' : COLORS.textMuted,
                        border: 'none', cursor: selectedSlots.size > 0 ? 'pointer' : 'not-allowed',
                        fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                      }}
                    >
                      {sending ? 'Sending...' : tab === 'individual'
                        ? `Send to ${selectedApt?.customer_name.split(' ')[0]} (${selectedSlots.size} slot${selectedSlots.size !== 1 ? 's' : ''})`
                        : `Send to All ${unnotified.length} (${selectedSlots.size} slot${selectedSlots.size !== 1 ? 's' : ''})`
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Manage Slots tab */}
              {tab === 'manage' && (() => {
                const activePool = pools.find(p => p.status === 'active');
                const pendingIndividualOffers = offers.filter(o => o.status === 'pending' && o.mode === 'individual');

                // Get current live slots (from pool or individual offers)
                const currentSlots: Set<string> = new Set();
                const claimedSlots: Set<string> = new Set();
                if (activePool) {
                  for (const s of activePool.slots as Array<{ time: string; claimed_by: string | null }>) {
                    currentSlots.add(s.time);
                    if (s.claimed_by && s.claimed_by !== 'null') claimedSlots.add(s.time);
                  }
                }

                // Initialize manageSlots from current if empty
                if (manageSlots.size === 0 && currentSlots.size > 0) {
                  // Can't setState during render, use effect instead
                }

                const toggleManageSlot = (time: string) => {
                  if (claimedSlots.has(time)) return; // can't remove claimed slots
                  setManageSlots(prev => {
                    const next = new Set(prev);
                    if (next.has(time)) next.delete(time);
                    else next.add(time);
                    return next;
                  });
                };

                const handleSaveSlots = async () => {
                  setSaving(true);
                  setSaveMessage(null);
                  setError(null);
                  try {
                    const res = await fetch('/api/auto/headsup/update-slots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        poolId: activePool?.id || null,
                        offerId: !activePool && pendingIndividualOffers.length > 0 ? pendingIndividualOffers[0].id : null,
                        slots: Array.from(manageSlots).sort(),
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setSaveMessage(`Updated to ${data.slotCount} slot${data.slotCount !== 1 ? 's' : ''}. Changes are live.`);
                      fetchStatus();
                    } else {
                      setError(data.error || 'Failed to update');
                    }
                  } catch { setError('Failed to save'); }
                  setSaving(false);
                };

                // Compute what changed
                const added = [...manageSlots].filter(t => !currentSlots.has(t));
                const removed = [...currentSlots].filter(t => !manageSlots.has(t) && !claimedSlots.has(t));
                const hasChanges = added.length > 0 || removed.length > 0;

                return (
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
                      Toggle slots on/off -- changes appear on customer pages within 10 seconds
                    </div>

                    {/* Time grid */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.lg }}>
                      {DEFAULT_SLOTS.map(time => {
                        const isClaimed = claimedSlots.has(time);
                        const isActive = manageSlots.has(time);
                        const wasActive = currentSlots.has(time);
                        const isNew = isActive && !wasActive;
                        const isRemoved = !isActive && wasActive && !isClaimed;
                        return (
                          <button
                            key={time}
                            onClick={() => toggleManageSlot(time)}
                            style={{
                              padding: '8px 14px', borderRadius: RADIUS.md,
                              cursor: isClaimed ? 'not-allowed' : 'pointer',
                              background: isClaimed ? 'rgba(34,197,94,0.15)'
                                : isNew ? 'rgba(59,130,246,0.15)'
                                : isActive ? 'rgba(245,158,11,0.2)'
                                : isRemoved ? 'rgba(239,68,68,0.1)'
                                : COLORS.inputBg,
                              border: `2px solid ${isClaimed ? '#22c55e'
                                : isNew ? '#3b82f6'
                                : isActive ? '#f59e0b'
                                : isRemoved ? '#ef4444'
                                : COLORS.borderInput}`,
                              color: isClaimed ? '#22c55e'
                                : isNew ? '#3b82f6'
                                : isActive ? '#f59e0b'
                                : isRemoved ? '#ef4444'
                                : COLORS.textMuted,
                              fontSize: FONT.sizeSm, fontWeight: isActive || isClaimed ? 700 : 500,
                              opacity: isClaimed ? 0.7 : 1,
                              textDecoration: isRemoved ? 'line-through' : 'none',
                            }}
                          >
                            {formatTimeDisplay(time)}
                            {isClaimed && ' (claimed)'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Change summary */}
                    {hasChanges && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary, marginBottom: SPACING.md }}>
                        {added.length > 0 && <span style={{ color: '#3b82f6' }}>+{added.length} new </span>}
                        {removed.length > 0 && <span style={{ color: '#ef4444' }}>-{removed.length} removed </span>}
                      </div>
                    )}

                    {saveMessage && (
                      <div style={{ padding: '8px 12px', borderRadius: RADIUS.sm, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: FONT.sizeXs, fontWeight: 600, marginBottom: SPACING.md }}>
                        {saveMessage}
                      </div>
                    )}

                    {error && (
                      <div style={{ padding: '8px 12px', borderRadius: RADIUS.sm, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: FONT.sizeXs, fontWeight: 600, marginBottom: SPACING.md }}>
                        {error}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handleSaveSlots}
                        disabled={!hasChanges || saving}
                        style={{
                          padding: `${SPACING.md}px ${SPACING.xl}px`, borderRadius: RADIUS.md,
                          background: hasChanges ? '#f59e0b' : COLORS.inputBg,
                          color: hasChanges ? '#fff' : COLORS.textMuted,
                          border: 'none', cursor: hasChanges ? 'pointer' : 'not-allowed',
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
            );
          })()}
        </>
      )}
    </Modal>
  );
}
