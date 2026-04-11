'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';

// ============================================================================
// TIMELINE VIEW
// Google Calendar-style vertical timeline from 7am to 7pm
// Cards sized by duration, draggable for reordering, resizable
// ============================================================================

interface Props {
  appointments: Appointment[];
  onEdit: (apt: Appointment) => void;
  onStatusChange: (id: string, status: string) => void;
  onOrderChange: (positions: { id: string; minutes: number }[]) => void;
  onDurationChange: (id: string, newDuration: number) => void;
  onReady: (apt: Appointment) => void;
  onMessage: (apt: Appointment) => void;
}

// Timeline config
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 19;
const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
const PIXELS_PER_HOUR = 120;
const PIXELS_PER_MIN = PIXELS_PER_HOUR / 60;
const SNAP_MINUTES = 15;
const TIMELINE_HEIGHT = TOTAL_HOURS * PIXELS_PER_HOUR;
const TIME_GUTTER_WIDTH = 64;

const TYPE_COLORS: Record<string, string> = {
  dropoff: '#3b82f6',
  waiting: '#ef4444',
  flex_wait: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  flex_wait: 'Flex-Wait',
};

const STATUS_COLORS: Record<string, string> = {
  booked: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  invoiced: '#22c55e',
  cancelled: '#ef4444',
  no_show: '#ef4444',
};

function timeToMinutes(time: string | null): number {
  if (!time) return (TIMELINE_START_HOUR + 1) * 60;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToPosition(minutes: number): number {
  return (minutes - TIMELINE_START_HOUR * 60) * PIXELS_PER_MIN;
}

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function buildServiceSummary(servicesJson: unknown): string {
  if (!servicesJson || !Array.isArray(servicesJson)) return '';
  return (servicesJson as Array<{ label?: string; filmAbbrev?: string; filmName?: string; shade?: string }>)
    .map(s => {
      const parts = [s.label || ''];
      if (s.filmAbbrev || s.filmName) parts.push(s.filmAbbrev || s.filmName || '');
      if (s.shade) parts.push(s.shade);
      return parts.join(' ');
    })
    .join(' | ');
}

export default function TimelineView({
  appointments, onEdit, onStatusChange, onOrderChange, onDurationChange, onReady, onMessage,
}: Props) {
  // Track which actions have been performed (turn button green)
  const [actioned, setActioned] = useState<Map<string, Set<string>>>(new Map());

  function markActioned(aptId: string, action: string) {
    setActioned(prev => {
      const next = new Map(prev);
      const actions = new Set(next.get(aptId) || []);
      actions.add(action);
      next.set(aptId, actions);
      return next;
    });
  }

  function isActioned(aptId: string, action: string): boolean {
    return actioned.get(aptId)?.has(action) || false;
  }

  // Work order positions — use work_order_time if saved, otherwise fall back to appointment_time
  const [workOrder, setWorkOrder] = useState<Map<string, number>>(() => {
    const order = new Map<string, number>();
    appointments.forEach(apt => {
      const savedTime = apt.work_order_time || apt.appointment_time;
      order.set(apt.id, timeToMinutes(savedTime));
    });
    return order;
  });
  const [localDurations, setLocalDurations] = useState<Map<string, number>>(() => {
    const durations = new Map<string, number>();
    appointments.forEach(apt => durations.set(apt.id, apt.duration_minutes || 60));
    return durations;
  });

  // Only add NEW appointments that appear (don't reset existing positions)
  const prevIdsRef = useRef(new Set(appointments.map(a => a.id)));
  useEffect(() => {
    const currentIds = new Set(appointments.map(a => a.id));
    let changed = false;
    appointments.forEach(apt => {
      if (!prevIdsRef.current.has(apt.id)) {
        // New appointment — add to work order
        setWorkOrder(prev => { const next = new Map(prev); next.set(apt.id, timeToMinutes(apt.appointment_time)); return next; });
        setLocalDurations(prev => { const next = new Map(prev); next.set(apt.id, apt.duration_minutes || 60); return next; });
        changed = true;
      }
    });
    // Remove appointments that no longer exist
    prevIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        setWorkOrder(prev => { const next = new Map(prev); next.delete(id); return next; });
        setLocalDurations(prev => { const next = new Map(prev); next.delete(id); return next; });
        changed = true;
      }
    });
    if (changed) prevIdsRef.current = currentIds;
  }, [appointments]);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [resizeId, setResizeId] = useState<string | null>(null);
  const dragOffsetRef = useRef(0);
  const resizeStartRef = useRef({ y: 0, duration: 0 });
  const timelineRef = useRef<HTMLDivElement>(null);

  // Drag — absolute position on timeline, snapped to 15-min grid
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const cardTopPx = minutesToPosition(workOrder.get(id) || 0);
    const mouseRelY = e.clientY - rect.top;
    dragOffsetRef.current = mouseRelY - cardTopPx;
    setDragId(id);
  }, [workOrder]);

  useEffect(() => {
    if (!dragId) return;

    function onMove(e: MouseEvent) {
      if (!dragId || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top - dragOffsetRef.current;
      const rawMin = (relY / PIXELS_PER_MIN) + TIMELINE_START_HOUR * 60;
      const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
      const clamped = Math.max(TIMELINE_START_HOUR * 60, Math.min(TIMELINE_END_HOUR * 60 - 15, snapped));
      setWorkOrder(prev => { const n = new Map(prev); n.set(dragId, clamped); return n; });
    }

    function onUp() { setDragId(null); }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragId]);

  // Resize — drag bottom edge to change duration
  const handleResizeStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { y: e.clientY, duration: localDurations.get(id) || 60 };
    setResizeId(id);
  }, [localDurations]);

  useEffect(() => {
    if (!resizeId) return;

    function onMove(e: MouseEvent) {
      if (!resizeId) return;
      const deltaY = e.clientY - resizeStartRef.current.y;
      const deltaMins = Math.round(deltaY / PIXELS_PER_MIN / SNAP_MINUTES) * SNAP_MINUTES;
      const newDuration = Math.max(15, resizeStartRef.current.duration + deltaMins);
      setLocalDurations(prev => { const n = new Map(prev); n.set(resizeId, newDuration); return n; });
    }

    function onUp() {
      if (resizeId) {
        const dur = localDurations.get(resizeId);
        if (dur) onDurationChange(resizeId, dur);
      }
      setResizeId(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizeId, localDurations, onDurationChange]);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  function handleSaveOrder() {
    const positions = appointments.map(apt => ({
      id: apt.id,
      minutes: workOrder.get(apt.id) || timeToMinutes(apt.appointment_time),
    }));
    setSaveStatus('saving');
    onOrderChange(positions);
    // Visual confirmation
    setTimeout(() => setSaveStatus('saved'), 300);
    setTimeout(() => setSaveStatus('idle'), 2000);
  }

  function handleReset() {
    const order = new Map<string, number>();
    const durations = new Map<string, number>();
    appointments.forEach(apt => {
      order.set(apt.id, timeToMinutes(apt.appointment_time));
      durations.set(apt.id, apt.duration_minutes || 60);
    });
    setWorkOrder(order);
    setLocalDurations(durations);
  }

  // Hour markers
  const hourMarkers = [];
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    hourMarkers.push({ hour: h, label: `${displayH}:00 ${ampm}`, top: (h - TIMELINE_START_HOUR) * PIXELS_PER_HOUR });
  }

  const activeAppointments = appointments.filter(a => a.status !== 'cancelled');

  return (
    <div>
      {/* Save/Reset bar */}
      <div style={{
        display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, justifyContent: 'flex-end',
      }}>
        <button onClick={handleReset} style={{
          padding: '8px 20px', borderRadius: RADIUS.md, cursor: 'pointer',
          background: 'transparent', color: COLORS.textMuted,
          border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
          transition: 'all 0.15s',
        }}>
          Reset Order
        </button>
        <button onClick={handleSaveOrder} style={{
          padding: '8px 20px', borderRadius: RADIUS.md, cursor: 'pointer',
          background: saveStatus === 'saved' ? '#22c55e' : COLORS.red,
          color: '#fff',
          border: `1px solid ${saveStatus === 'saved' ? '#22c55e' : COLORS.red}`,
          fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
          transition: 'all 0.3s',
        }}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Order'}
        </button>
      </div>

      {/* Timeline */}
      <div style={{
        position: 'relative', display: 'flex',
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.borderAccent}`,
        borderRadius: RADIUS.xl, overflow: 'hidden',
      }}>
        {/* Time gutter */}
        <div style={{
          width: TIME_GUTTER_WIDTH, flexShrink: 0,
          borderRight: `1px solid ${COLORS.border}`,
          position: 'relative', height: TIMELINE_HEIGHT,
        }}>
          {hourMarkers.map(m => (
            <div key={m.hour} style={{
              position: 'absolute', top: m.top, right: 8,
              fontSize: FONT.sizeXs, color: COLORS.textMuted,
              fontWeight: FONT.weightMedium, lineHeight: 1,
              transform: 'translateY(-50%)',
            }}>
              {m.label}
            </div>
          ))}
        </div>

        {/* Main area */}
        <div ref={timelineRef} style={{ flex: 1, position: 'relative', height: TIMELINE_HEIGHT }}>
          {/* Hour lines */}
          {hourMarkers.map(m => (
            <div key={m.hour} style={{
              position: 'absolute', top: m.top, left: 0, right: 0,
              borderTop: m.hour === TIMELINE_START_HOUR ? 'none' : `1px solid ${COLORS.border}`,
            }} />
          ))}
          {/* Half-hour lines */}
          {hourMarkers.slice(0, -1).map(m => (
            <div key={`h-${m.hour}`} style={{
              position: 'absolute', top: m.top + PIXELS_PER_HOUR / 2, left: 0, right: 0,
              borderTop: '1px dashed rgba(255,255,255,0.03)',
            }} />
          ))}

          {/* Appointment cards */}
          {activeAppointments.map(apt => {
            const workMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
            const duration = localDurations.get(apt.id) || apt.duration_minutes || 60;
            const top = minutesToPosition(workMin);
            const height = Math.max(duration * PIXELS_PER_MIN, 20);
            const typeColor = TYPE_COLORS[apt.appointment_type] || '#6b7280';
            const statusColor = STATUS_COLORS[apt.status] || COLORS.textMuted;
            const isCompact = duration <= 30;
            const isTiny = duration <= 15;
            const isDragging = dragId === apt.id;
            const isResizing = resizeId === apt.id;
            const isInteracting = isDragging || isResizing;
            const serviceSummary = buildServiceSummary(apt.services_json);
            const scheduledTime = formatTime(timeToMinutes(apt.appointment_time));
            const workOrderTime = formatTime(workMin);
            const scheduledDiffers = Math.abs(workMin - timeToMinutes(apt.appointment_time)) >= 15;

            return (
              <div
                key={apt.id}
                style={{
                  position: 'absolute', top, left: 8, right: 8, height,
                  display: 'flex',
                  background: `${typeColor}20`,
                  border: `1px solid ${typeColor}50`,
                  borderRadius: RADIUS.md,
                  overflow: 'hidden',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: isInteracting ? 100 : 10,
                  opacity: isDragging ? 0.92 : 1,
                  boxShadow: isDragging
                    ? `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${typeColor}40`
                    : `0 0 12px ${typeColor}25, 0 0 4px ${typeColor}15`,
                  transition: isInteracting ? 'none' : 'top 0.3s ease, height 0.3s ease, box-shadow 0.2s',
                  userSelect: 'none',
                }}
                onMouseDown={e => handleDragStart(e, apt.id)}
              >
                {/* Type block (far left) — colored block with time, type, duration */}
                <div style={{
                  width: 92,
                  flexShrink: 0,
                  background: `${typeColor}35`,
                  borderRight: `1px solid ${typeColor}50`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: isTiny ? '1px 4px' : '4px 6px',
                  gap: isTiny ? 0 : 2,
                }}>
                  <span style={{
                    fontSize: isTiny ? '0.6rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                    fontWeight: FONT.weightBold,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                  }}>
                    {workOrderTime}
                  </span>
                  <span style={{
                    fontSize: isTiny ? '0.5rem' : '0.6rem',
                    fontWeight: FONT.weightBold,
                    color: '#fff',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}>
                    {TYPE_LABELS[apt.appointment_type]}
                  </span>
                  <span style={{
                    fontSize: isTiny ? '0.5rem' : '0.6rem',
                    fontWeight: FONT.weightBold,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}>
                    {duration}m
                  </span>
                </div>

                {/* Content area */}
                <div style={{
                  flex: 1, minWidth: 0,
                  padding: isTiny ? '2px 8px' : isCompact ? '4px 10px' : `${SPACING.sm}px ${SPACING.md}px`,
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                  {/* Row 1: Vehicle + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 0 }}>
                    <span style={{
                      fontSize: isTiny ? '0.6rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                      fontWeight: FONT.weightSemibold, color: COLORS.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                    </span>
                    {!isTiny && (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: apt.status === 'in_progress' || apt.status === 'completed' || apt.status === 'invoiced' ? '#22c55e' : '#6b7280',
                      }} />
                    )}
                  </div>

                  {/* Row 2: Services (emphasized — this is the actual work) */}
                  {!isTiny && (
                    <div style={{
                      fontSize: isCompact ? FONT.sizeXs : FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: COLORS.textPrimary,
                      marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {serviceSummary}
                    </div>
                  )}

                  {/* Row 3: Customer (normal cards) */}
                  {!isCompact && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4,
                    }}>
                      <span>{apt.customer_name}</span>
                      {apt.customer_phone && <span>{formatPhone(apt.customer_phone)}</span>}
                    </div>
                  )}
                  {isCompact && !isTiny && (
                    <div style={{
                      fontSize: '0.6rem', color: COLORS.textMuted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
                    }}>
                      {apt.customer_name}
                    </div>
                  )}
                </div>

                {/* Action buttons (middle-right) */}
                <div
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
                    gap: isTiny ? 2 : 3,
                    padding: isTiny ? '2px 4px' : isCompact ? '4px 6px' : `${SPACING.sm}px 6px`,
                    flexShrink: 0,
                  }}
                >
                  <TAction label="Edit" compact={false} onClick={() => onEdit(apt)} />
                  {apt.appointment_type === 'flex_wait' && (
                    <TAction
                      label="Send Flex-Wait"
                      compact={false}
                      color={isActioned(apt.id, 'headsup') ? '#22c55e' : '#f59e0b'}
                      filled={isActioned(apt.id, 'headsup')}
                      onClick={() => {
                        markActioned(apt.id, 'headsup');
                        // TODO: Wire to Communication module — sends SMS with tokenized time slot link
                        console.log('Send heads-up link to:', apt.customer_name, apt.customer_phone);
                      }}
                    />
                  )}
                  {apt.status === 'booked' && (
                    <TAction label="Check In" compact={false} color={COLORS.warning} onClick={() => onStatusChange(apt.id, 'in_progress')} />
                  )}
                  {apt.status === 'in_progress' && (
                    <TAction label="Undo" compact={false} color={COLORS.textMuted} onClick={() => onStatusChange(apt.id, 'booked')} />
                  )}
                  <TAction
                    label="Ready"
                    compact={false}
                    color={isActioned(apt.id, 'ready') ? '#22c55e' : COLORS.textMuted}
                    filled={isActioned(apt.id, 'ready')}
                    onClick={() => { markActioned(apt.id, 'ready'); onReady(apt); }}
                  />
                  <TAction
                    label="Message"
                    compact={false}
                    color={isActioned(apt.id, 'message') ? '#22c55e' : '#3b82f6'}
                    filled={isActioned(apt.id, 'message')}
                    onClick={() => { markActioned(apt.id, 'message'); onMessage(apt); }}
                  />
                  <TAction
                    label="Invoice"
                    compact={false}
                    color={isActioned(apt.id, 'invoice') ? '#22c55e' : COLORS.yellowSolid}
                    filled={isActioned(apt.id, 'invoice')}
                    onClick={() => { markActioned(apt.id, 'invoice'); onStatusChange(apt.id, 'invoiced'); }}
                  />
                </div>

                {/* Info strip (far right) — price, scheduled time, duration */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start',
                  padding: isTiny ? '2px 8px' : isCompact ? '4px 12px' : `${SPACING.sm}px 12px`,
                  borderLeft: `1px solid ${typeColor}15`,
                  flexShrink: 0, minWidth: isTiny ? 50 : 70,
                  gap: isTiny ? 0 : 2,
                }}>
                  <span style={{
                    fontSize: isTiny ? '0.65rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                    fontWeight: FONT.weightBold, color: COLORS.textPrimary,
                  }}>
                    ${Number(apt.balance_due).toFixed(0)}
                  </span>
                  {!isTiny && scheduledDiffers && (
                    <span style={{
                      fontSize: '0.6rem', color: COLORS.textMuted,
                      whiteSpace: 'nowrap',
                    }}>
                      Sched {scheduledTime}
                    </span>
                  )}
                  {!isTiny && (
                    <span style={{ fontSize: '0.55rem', color: COLORS.textMuted }}>
                      #{apt.booking_id}
                    </span>
                  )}
                </div>

                {/* Resize handle */}
                <div
                  onMouseDown={e => handleResizeStart(e, apt.id)}
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 8, cursor: 'ns-resize',
                    background: isResizing ? `${typeColor}30` : 'transparent',
                    borderTop: `2px solid ${isResizing ? typeColor : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.background = `${typeColor}20`; el.style.borderTopColor = typeColor; }}
                  onMouseLeave={e => { if (!isResizing) { const el = e.currentTarget; el.style.background = 'transparent'; el.style.borderTopColor = 'transparent'; } }}
                />
              </div>
            );
          })}

          {/* Current time line */}
          <CurrentTimeLine />
        </div>
      </div>
    </div>
  );
}

function TAction({ label, onClick, color, compact, filled }: {
  label: string; onClick: () => void; color?: string; compact?: boolean; filled?: boolean;
}) {
  const c = color || COLORS.textMuted;
  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      onMouseDown={e => e.stopPropagation()}
      style={{
        padding: compact ? '2px 6px' : '3px 10px',
        borderRadius: 4, cursor: 'pointer',
        background: filled ? `${c}30` : `${c}12`,
        border: `1px solid ${filled ? c : `${c}25`}`,
        color: c,
        fontSize: compact ? '0.55rem' : FONT.sizeXs,
        fontWeight: FONT.weightSemibold,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  );
}

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < TIMELINE_START_HOUR * 60 || mins > TIMELINE_END_HOUR * 60) return null;

  return (
    <div style={{
      position: 'absolute', top: minutesToPosition(mins), left: 0, right: 0,
      zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'center',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.red, marginLeft: -4 }} />
      <div style={{ flex: 1, height: 2, background: COLORS.red }} />
    </div>
  );
}
