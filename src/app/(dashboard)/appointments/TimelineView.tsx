'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';
import { MODULE_LABELS, MODULE_COLORS } from './AppointmentCard';
import ConfigurableActions, { type ActionButtonConfig, DEFAULT_BUTTONS_CONFIG } from './ConfigurableActions';

// ============================================================================
// TIMELINE VIEW
// Google Calendar-style vertical timeline from 7am to 7pm
// Cards sized by duration, draggable for reordering, resizable
// ============================================================================

interface TeamMember {
  id: string;
  name: string;
  phone: string | null;
  module_permissions: string[];
}

interface Props {
  appointments: Appointment[];
  onEdit: (apt: Appointment) => void;
  onStatusChange: (id: string, status: string) => void;
  onOrderChange: (positions: { id: string; minutes: number }[]) => void;
  onDurationChange: (id: string, newDuration: number) => void;
  onAction: (buttonKey: string, apt: Appointment, anchorRect?: DOMRect) => void;
  buttonsConfig?: ActionButtonConfig[];
  onAddLinkedSlot?: (apt: Appointment) => void;
  teamMembers?: TeamMember[];
  onAssign?: (aptId: string, teamMemberId: string | null) => void;
  moduleColorMap?: Record<string, string>;
  moduleLabelMap?: Record<string, string>;
}

// Timeline config
const TIMELINE_START_HOUR = 7;
const MIN_END_HOUR = 19; // default 7pm, extends dynamically if appointments run later
const PIXELS_PER_HOUR = 120;
const PIXELS_PER_MIN = PIXELS_PER_HOUR / 60;
const SNAP_MINUTES = 15;
const TIME_GUTTER_WIDTH = 64;

const TYPE_COLORS: Record<string, string> = {
  dropoff: '#3b82f6',
  waiting: '#ef4444',
  headsup_30: '#f59e0b',
  headsup_60: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: '30m Heads-Up',
  headsup_60: '60m Heads-Up',
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

// ============================================================================
// OVERLAP COLUMN ASSIGNMENT (Google Calendar-style)
// Pure function: takes appointments with their positions/durations,
// returns a map of appointmentId -> { column, totalColumns }
// ============================================================================

interface ColumnAssignment {
  column: number;
  totalColumns: number;
}

function assignColumns(
  appointments: Appointment[],
  getStart: (apt: Appointment) => number,
  getDuration: (apt: Appointment) => number,
): Map<string, ColumnAssignment> {
  if (appointments.length === 0) return new Map();

  // Build time ranges and sort by start, then longest duration first
  const items = appointments.map(apt => ({
    id: apt.id,
    linkedGroupId: apt.linked_group_id || null,
    start: getStart(apt),
    end: getStart(apt) + getDuration(apt),
  }));
  items.sort((a, b) => a.start - b.start);

  // Build overlap clusters using union-find approach:
  // Two appointments are in the same cluster if their time ranges overlap.
  // We merge transitively (if A overlaps B and B overlaps C, all three are one cluster).
  const clusterMap = new Map<string, number>(); // id -> cluster index
  const clusters: typeof items[] = [];

  for (const item of items) {
    // Find which existing cluster this item overlaps with
    let mergedClusterIdx = -1;
    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      // Check if item overlaps any member of this cluster
      const overlaps = cluster.some(m => item.start < m.end && item.end > m.start);
      if (overlaps) {
        if (mergedClusterIdx === -1) {
          // First overlapping cluster — join it
          mergedClusterIdx = ci;
          cluster.push(item);
          clusterMap.set(item.id, ci);
        } else {
          // Second overlapping cluster — merge into the first
          const targetCluster = clusters[mergedClusterIdx];
          for (const m of cluster) {
            targetCluster.push(m);
            clusterMap.set(m.id, mergedClusterIdx);
          }
          clusters[ci] = []; // empty this cluster (will be skipped)
        }
      }
    }
    if (mergedClusterIdx === -1) {
      // No overlap — new cluster
      clusterMap.set(item.id, clusters.length);
      clusters.push([item]);
    }
  }

  // For each cluster, assign columns greedily
  const result = new Map<string, ColumnAssignment>();

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;
    if (cluster.length === 1) {
      result.set(cluster[0].id, { column: 0, totalColumns: 1 });
      continue;
    }

    // Sort within cluster: by start time only (no duration sorting)
    // Duration-based sorting was causing linked cards to swap columns on resize
    cluster.sort((a, b) => a.start - b.start);

    // Greedy column assignment: for each item, find the lowest column
    // where no existing item in that column overlaps this item's time range
    const columnEndTimes: number[] = []; // columnEndTimes[col] = latest end time in that column
    const columnItems: typeof items[] = []; // items assigned to each column
    const assignments = new Map<string, number>(); // id -> column

    for (const item of cluster) {
      let assignedCol = -1;

      // For linked appointments, try to place adjacent to siblings
      if (item.linkedGroupId) {
        const siblingCols: number[] = [];
        assignments.forEach((col, id) => {
          const sibling = cluster.find(c => c.id === id);
          if (sibling && sibling.linkedGroupId === item.linkedGroupId) {
            siblingCols.push(col);
          }
        });
        if (siblingCols.length > 0) {
          // Try the column right after the highest sibling column
          const maxSibCol = Math.max(...siblingCols);
          const tryCol = maxSibCol + 1;
          if (tryCol >= columnItems.length || !columnItems[tryCol]?.some(m => item.start < m.end && item.end > m.start)) {
            assignedCol = tryCol;
          }
        }
      }

      // Standard greedy: find lowest available column
      if (assignedCol === -1) {
        for (let col = 0; col < columnItems.length; col++) {
          const overlapsCol = columnItems[col]?.some(m => item.start < m.end && item.end > m.start);
          if (!overlapsCol) {
            assignedCol = col;
            break;
          }
        }
      }

      // Need a new column
      if (assignedCol === -1) {
        assignedCol = columnItems.length;
      }

      // Ensure arrays are large enough
      while (columnItems.length <= assignedCol) {
        columnItems.push([]);
        columnEndTimes.push(0);
      }

      columnItems[assignedCol].push(item);
      columnEndTimes[assignedCol] = Math.max(columnEndTimes[assignedCol], item.end);
      assignments.set(item.id, assignedCol);
    }

    const totalColumns = columnItems.length;
    assignments.forEach((col, id) => {
      result.set(id, { column: col, totalColumns });
    });
  }

  return result;
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
  appointments, onEdit, onStatusChange, onOrderChange, onDurationChange, onAction, buttonsConfig, onAddLinkedSlot, teamMembers, onAssign, moduleColorMap, moduleLabelMap,
}: Props) {
  const buttons = buttonsConfig || DEFAULT_BUTTONS_CONFIG;

  // Dynamic timeline end: extends past 7pm if any appointment runs later
  const TIMELINE_END_HOUR = useMemo(() => {
    let latestEnd = MIN_END_HOUR * 60; // 7pm in minutes
    for (const apt of appointments) {
      const startMin = timeToMinutes(apt.work_order_time || apt.appointment_time);
      const duration = apt.duration_minutes || 60;
      const endMin = startMin + duration;
      if (endMin > latestEnd) latestEnd = endMin;
    }
    // Round up to next full hour + 1 buffer hour
    return Math.max(MIN_END_HOUR, Math.ceil(latestEnd / 60) + 1);
  }, [appointments]);

  const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const TIMELINE_HEIGHT = TOTAL_HOURS * PIXELS_PER_HOUR;

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

  // Assign dropdown state
  const [assignDropdownId, setAssignDropdownId] = useState<string | null>(null);

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
  const dragStartXRef = useRef(0);
  const lastSwapXRef = useRef(0);
  const resizeStartRef = useRef({ y: 0, duration: 0 });
  const timelineRef = useRef<HTMLDivElement>(null);

  // Linked column swap overrides: maps linked_group_id -> ordered array of appointment ids
  // This controls which linked card appears in which column
  const [linkedColumnOrder, setLinkedColumnOrder] = useState<Map<string, string[]>>(new Map());

  // Drag — absolute position on timeline, snapped to 15-min grid
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const cardTopPx = minutesToPosition(workOrder.get(id) || 0);
    const mouseRelY = e.clientY - rect.top;
    dragOffsetRef.current = mouseRelY - cardTopPx;
    dragStartXRef.current = e.clientX;
    lastSwapXRef.current = e.clientX;
    setDragId(id);
  }, [workOrder]);

  // Track whether linked appointments should move together
  const [linkedLocked, setLinkedLocked] = useState(true);

  useEffect(() => {
    if (!dragId) return;

    // Find siblings if this is a linked appointment and lock is on
    const draggedApt = appointments.find(a => a.id === dragId);
    const linkedSiblingIds = (linkedLocked && draggedApt?.linked_group_id)
      ? appointments.filter(a => a.linked_group_id === draggedApt.linked_group_id && a.id !== dragId).map(a => a.id)
      : [];
    // Calculate the time offsets of siblings relative to the dragged card
    const siblingOffsets = new Map<string, number>();
    if (linkedSiblingIds.length > 0) {
      const dragStart = workOrder.get(dragId) || 0;
      for (const sibId of linkedSiblingIds) {
        siblingOffsets.set(sibId, (workOrder.get(sibId) || 0) - dragStart);
      }
    }

    const SWAP_THRESHOLD = 40; // px of horizontal movement to trigger a swap

    function onMove(e: MouseEvent) {
      if (!dragId || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();

      // Vertical movement (time change)
      const relY = e.clientY - rect.top - dragOffsetRef.current;
      const rawMin = (relY / PIXELS_PER_MIN) + TIMELINE_START_HOUR * 60;
      const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
      const clamped = Math.max(TIMELINE_START_HOUR * 60, Math.min(TIMELINE_END_HOUR * 60 - 15, snapped));
      setWorkOrder(prev => {
        const n = new Map(prev);
        n.set(dragId, clamped);
        for (const sibId of linkedSiblingIds) {
          const offset = siblingOffsets.get(sibId) || 0;
          const sibMin = Math.max(TIMELINE_START_HOUR * 60, Math.min(TIMELINE_END_HOUR * 60 - 15, clamped + offset));
          n.set(sibId, sibMin);
        }
        return n;
      });

      // Horizontal movement (column swap for linked cards)
      if (linkedLocked && draggedApt?.linked_group_id && linkedSiblingIds.length > 0) {
        const deltaX = e.clientX - lastSwapXRef.current;
        if (Math.abs(deltaX) > SWAP_THRESHOLD) {
          const groupId = draggedApt.linked_group_id;
          const direction = deltaX > 0 ? 1 : -1; // right = +1, left = -1

          setLinkedColumnOrder(prev => {
            const n = new Map(prev);
            // Get current order or build from all group members
            const allInGroup = [dragId, ...linkedSiblingIds];
            let order = n.get(groupId) || [...allInGroup];
            // Ensure all members are in the order array
            for (const mid of allInGroup) {
              if (!order.includes(mid)) order.push(mid);
            }
            const currentIdx = order.indexOf(dragId);
            const targetIdx = currentIdx + direction;
            if (targetIdx >= 0 && targetIdx < order.length) {
              // Swap positions
              const newOrder = [...order];
              [newOrder[currentIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[currentIdx]];
              n.set(groupId, newOrder);
            }
            return n;
          });
          lastSwapXRef.current = e.clientX;
        }
      }
    }

    function onUp() { setDragId(null); }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragId, linkedLocked, appointments, workOrder]);

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

  // Compute overlap column assignments (Google Calendar-style side-by-side)
  const columnAssignments = assignColumns(
    activeAppointments,
    (apt) => workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time),
    (apt) => localDurations.get(apt.id) || apt.duration_minutes || 60,
  );

  // Apply linked column order swaps: override column indices based on user drag reordering
  linkedColumnOrder.forEach((order, groupId) => {
    // Find all assignments for this group
    const groupApts = activeAppointments.filter(a => a.linked_group_id === groupId);
    if (groupApts.length < 2) return;
    // Get their current column assignments
    const assignments = groupApts.map(a => ({ id: a.id, col: columnAssignments.get(a.id) })).filter(a => a.col);
    if (assignments.length < 2) return;
    // Sort by current column to get the column slots available
    assignments.sort((a, b) => (a.col!.column) - (b.col!.column));
    const columnSlots = assignments.map(a => a.col!.column);
    // Remap based on the user's desired order
    for (let i = 0; i < order.length && i < columnSlots.length; i++) {
      const aptId = order[i];
      const existing = columnAssignments.get(aptId);
      if (existing) {
        columnAssignments.set(aptId, { column: columnSlots[i], totalColumns: existing.totalColumns });
      }
    }
  });

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
            const isPaid = apt.status === 'invoiced' || apt.status === 'paid';
            const leftBlockColor = isPaid ? '#22c55e' : typeColor;
            const modColor = moduleColorMap?.[apt.module] || MODULE_COLORS[apt.module] || '#6b7280';
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

            // Column positioning for overlap handling
            const colInfo = columnAssignments.get(apt.id) || { column: 0, totalColumns: 1 };
            const COL_GAP = 3; // px gap between columns
            const colWidthPercent = 100 / colInfo.totalColumns;
            const leftPercent = colInfo.column * colWidthPercent;
            // Use calc() for left/width to account for edge padding and gaps
            const cardLeft = `calc(${leftPercent}% + ${COL_GAP / 2}px)`;
            const cardWidth = `calc(${colWidthPercent}% - ${COL_GAP}px)`;
            const isNarrow = colInfo.totalColumns >= 3;
            // Card text colors -- brighter than page defaults since cards have tinted backgrounds
            const cardTextPrimary = 'rgba(255,255,255,0.95)';
            const cardTextSecondary = 'rgba(255,255,255,0.7)';
            const cardTextMuted = 'rgba(255,255,255,0.5)';

            return (
              <div
                key={apt.id}
                style={{
                  position: 'absolute', top, left: cardLeft, width: cardWidth, height,
                  display: 'flex',
                  background: `color-mix(in srgb, ${modColor} 25%, ${COLORS.cardBg} 75%)`,
                  border: `1px solid ${modColor}80`,
                  borderRadius: RADIUS.md,
                  overflow: 'hidden',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: isInteracting ? 100 : 10,
                  opacity: isDragging ? 0.92 : 1,
                  boxShadow: isDragging
                    ? `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${modColor}40`
                    : `0 0 12px ${modColor}20, 0 0 4px ${modColor}10`,
                  transition: isInteracting ? 'none' : 'top 0.3s ease, height 0.3s ease, box-shadow 0.2s',
                  userSelect: 'none',
                }}
                onMouseDown={e => handleDragStart(e, apt.id)}
              >
                {/* Type block (far left) — green when paid, type color otherwise */}
                <div style={{
                  width: isNarrow ? 60 : 92,
                  flexShrink: 0,
                  background: `${leftBlockColor}80`,
                  borderRight: `1px solid ${leftBlockColor}99`,
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
                  {/* Row 1: Vehicle + module badge + link indicator + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 0 }}>
                    <span style={{
                      fontSize: isTiny ? '0.6rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                      fontWeight: FONT.weightSemibold, color: cardTextPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                    </span>
                    {!isTiny && (apt.module !== 'auto_tint' || apt.linked_group_id) && (() => {
                      const modColor = moduleColorMap?.[apt.module] || MODULE_COLORS[apt.module] || '#6b7280';
                      return (
                        <span style={{
                          fontSize: '0.55rem', fontWeight: FONT.weightSemibold,
                          color: modColor, background: `${modColor}18`,
                          border: `1px solid ${modColor}35`,
                          padding: '1px 5px', borderRadius: RADIUS.sm,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {moduleLabelMap?.[apt.module] || MODULE_LABELS[apt.module] || apt.module}
                        </span>
                      );
                    })()}
                    {!isTiny && apt.linked_group_id && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        fontSize: '0.55rem', fontWeight: FONT.weightMedium,
                        color: COLORS.textMuted, flexShrink: 0,
                      }} title="Linked appointment group">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
                          <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
                        </svg>
                        1/{(apt.linked_slots?.length || 0) + 1}
                        {onAddLinkedSlot && (
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onAddLinkedSlot(apt); }}
                            title="Add linked slot"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 14, height: 14, borderRadius: '50%', padding: 0,
                              background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                              color: COLORS.textMuted, cursor: 'pointer', marginLeft: 2,
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                        )}
                      </span>
                    )}
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
                      color: cardTextPrimary,
                      marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {serviceSummary}
                    </div>
                  )}

                  {/* Row 3: Customer + assigned team member (normal cards) */}
                  {!isCompact && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      fontSize: FONT.sizeXs, color: cardTextSecondary, marginTop: 4,
                    }}>
                      <span>{apt.customer_name}</span>
                      {apt.customer_phone && <span>{formatPhone(apt.customer_phone)}</span>}
                      {apt.assigned_team_member_name && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          color: cardTextMuted,
                        }}>
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="8" cy="5" r="3" />
                            <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
                          </svg>
                          {apt.assigned_team_member_name}
                        </span>
                      )}
                      {/* Assign button */}
                      {teamMembers && teamMembers.length > 0 && onAssign && (
                        <span
                          onMouseDown={e => e.stopPropagation()}
                          style={{ position: 'relative', display: 'inline-flex' }}
                        >
                          <button
                            onClick={() => setAssignDropdownId(assignDropdownId === apt.id ? null : apt.id)}
                            title={apt.assigned_team_member_name ? `Assigned to ${apt.assigned_team_member_name}` : 'Assign team member'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18, borderRadius: '50%',
                              background: apt.assigned_team_member_id ? `${COLORS.info}25` : 'transparent',
                              border: `1px solid ${apt.assigned_team_member_id ? COLORS.info + '50' : COLORS.borderInput}`,
                              color: apt.assigned_team_member_id ? COLORS.info : COLORS.textMuted,
                              cursor: 'pointer', padding: 0,
                              transition: 'all 0.15s',
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="8" cy="5" r="3" />
                              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
                            </svg>
                          </button>
                          {assignDropdownId === apt.id && (
                            <AssignDropdown
                              appointment={apt}
                              teamMembers={teamMembers}
                              onAssign={(memberId) => {
                                onAssign(apt.id, memberId);
                                setAssignDropdownId(null);
                              }}
                              onClose={() => setAssignDropdownId(null)}
                            />
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  {isCompact && !isTiny && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: '0.6rem', color: cardTextSecondary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{apt.customer_name}</span>
                      {apt.assigned_team_member_name && (
                        <span style={{ color: cardTextMuted, flexShrink: 0 }}>
                          / {apt.assigned_team_member_name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons (middle-right) — driven by shop config */}
                {!isNarrow && (
                <div
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
                    gap: isTiny ? 2 : 3,
                    padding: isTiny ? '2px 4px' : isCompact ? '4px 6px' : `${SPACING.sm}px 6px`,
                    flexShrink: 0,
                  }}
                >
                  <ConfigurableActions
                    appointment={apt}
                    buttonsConfig={buttons}
                    actioned={actioned.get(apt.id) || new Set()}
                    onAction={(key, a, rect) => { markActioned(a.id, key); onAction(key, a, rect); }}
                    compact={isTiny}
                  />
                  {/* Directions button for off-site appointments with a location */}
                  {(() => {
                    const locationMatch = apt.notes?.match(/Location:\s*(.+)/);
                    if (!locationMatch) return null;
                    const address = locationMatch[1].trim();
                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                    return (
                      <>
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); window.open(mapsUrl, '_blank'); }}
                          title={`Directions to ${address}`}
                          style={{
                            padding: isTiny ? '2px 6px' : '3px 10px',
                            borderRadius: 4, cursor: 'pointer',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'rgba(255,255,255,0.85)',
                            fontSize: isTiny ? '0.55rem' : FONT.sizeXs,
                            fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.2,
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                          </svg>
                          {isTiny ? '' : 'Directions'}
                        </button>
                        {(() => {
                          // Find assigned team member's phone
                          const assignedMember = teamMembers?.find(tm => tm.id === apt.assigned_team_member_id);
                          const memberPhone = assignedMember?.phone;
                          const smsBody = `Directions for your ${formatTime(workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time))} consultation: ${mapsUrl}`;

                          if (memberPhone) {
                            return (
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  const btn = e.currentTarget as HTMLButtonElement;
                                  btn.textContent = 'Sending...';
                                  // Send via Twilio API
                                  fetch('/api/auto/send-sms', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ to: memberPhone, message: smsBody }),
                                  }).then(res => {
                                    if (res.ok) {
                                      btn.textContent = 'Sent!';
                                      btn.style.color = '#22c55e';
                                      btn.style.borderColor = '#22c55e';
                                    } else {
                                      window.open(`sms:${memberPhone}?body=${encodeURIComponent(smsBody)}`, '_self');
                                    }
                                    setTimeout(() => { btn.textContent = 'Send'; btn.style.color = '#3b82f6'; btn.style.borderColor = 'rgba(255,255,255,0.2)'; }, 2000);
                                  }).catch(() => {
                                    window.open(`sms:${memberPhone}?body=${encodeURIComponent(smsBody)}`, '_self');
                                  });
                                }}
                                title={`Send directions to ${assignedMember.name}`}
                                style={{
                                  padding: isTiny ? '2px 6px' : '3px 10px',
                                  borderRadius: 4, cursor: 'pointer',
                                  background: 'rgba(0,0,0,0.35)',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  color: '#3b82f6',
                                  fontSize: isTiny ? '0.55rem' : FONT.sizeXs,
                                  fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.2,
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.11 2 2 0 0 1 4.11 2h3"/>
                                </svg>
                                {isTiny ? '' : 'Send'}
                              </button>
                            );
                          }
                          // No phone -- show copy link fallback
                          return (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(mapsUrl);
                                const btn = e.currentTarget as HTMLButtonElement;
                                const origText = btn.querySelector('span')?.textContent || '';
                                const span = btn.querySelector('span');
                                if (span) { span.textContent = 'Copied!'; }
                                btn.style.color = '#22c55e';
                                btn.style.borderColor = '#22c55e';
                                setTimeout(() => { if (span) span.textContent = origText; btn.style.color = '#3b82f6'; btn.style.borderColor = 'rgba(255,255,255,0.2)'; }, 1500);
                              }}
                              title="Copy directions link (add phone to team member to enable sending)"
                              style={{
                                padding: isTiny ? '2px 6px' : '3px 10px',
                                borderRadius: 4, cursor: 'pointer',
                                background: 'rgba(0,0,0,0.35)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#3b82f6',
                                fontSize: isTiny ? '0.55rem' : FONT.sizeXs,
                                fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.2,
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                              {!isTiny && <span>Copy Link</span>}
                            </button>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
                )}

                {/* Info strip (far right) — price, scheduled time, duration */}
                {!isNarrow && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start',
                  padding: isTiny ? '2px 8px' : isCompact ? '4px 12px' : `${SPACING.sm}px 12px`,
                  borderLeft: `1px solid ${modColor}15`,
                  flexShrink: 0, minWidth: isTiny ? 50 : 70,
                  gap: isTiny ? 0 : 2,
                }}>
                  <span style={{
                    fontSize: isTiny ? '0.65rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                    fontWeight: FONT.weightBold, color: cardTextPrimary,
                  }}>
                    ${Number(apt.balance_due).toFixed(0)}
                  </span>
                  {!isTiny && scheduledDiffers && (
                    <span style={{
                      fontSize: '0.6rem', color: cardTextMuted,
                      whiteSpace: 'nowrap',
                    }}>
                      Sched {scheduledTime}
                    </span>
                  )}
                  {!isTiny && (
                    <span style={{ fontSize: '0.55rem', color: cardTextMuted }}>
                      #{apt.booking_id}
                    </span>
                  )}
                </div>
                )}

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

          {/* Linked appointment connectors */}
          {(() => {
            // Find linked groups with multiple cards visible
            const linkedGroups = new Map<string, Array<{ id: string; col: ColumnAssignment; top: number; height: number }>>();
            activeAppointments.forEach(apt => {
              if (!apt.linked_group_id) return;
              const colInfo = columnAssignments.get(apt.id);
              if (!colInfo || colInfo.totalColumns <= 1) return;
              const workMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
              const duration = localDurations.get(apt.id) || apt.duration_minutes || 60;
              if (!linkedGroups.has(apt.linked_group_id)) linkedGroups.set(apt.linked_group_id, []);
              linkedGroups.get(apt.linked_group_id)!.push({
                id: apt.id,
                col: colInfo,
                top: minutesToPosition(workMin),
                height: Math.max(duration * PIXELS_PER_MIN, 20),
              });
            });

            const connectors: React.ReactNode[] = [];
            linkedGroups.forEach((cards, groupId) => {
              if (cards.length < 2) return;
              // Sort by column index
              const sorted = [...cards].sort((a, b) => a.col.column - b.col.column);
              // Draw a connector between each adjacent pair
              for (let i = 0; i < sorted.length - 1; i++) {
                const left = sorted[i];
                const right = sorted[i + 1];
                const colWidth = 100 / left.col.totalColumns;
                // Position the connector at the boundary between the two columns
                const connectorLeftPercent = (left.col.column + 1) * colWidth;
                // Vertical center of the overlap region
                const overlapTop = Math.max(left.top, right.top);
                const overlapBottom = Math.min(left.top + left.height, right.top + right.height);
                const connectorTop = overlapTop + (overlapBottom - overlapTop) / 2 - 10;

                connectors.push(
                  <button
                    key={`link-${groupId}-${i}`}
                    onClick={() => setLinkedLocked(prev => !prev)}
                    title={linkedLocked ? 'Click to unlink (move independently)' : 'Click to link (move together)'}
                    style={{
                      position: 'absolute',
                      top: connectorTop,
                      left: `calc(${connectorLeftPercent}% - 10px)`,
                      width: 20, height: 20,
                      borderRadius: '50%',
                      background: linkedLocked ? `${COLORS.info}30` : COLORS.inputBg,
                      border: `2px solid ${linkedLocked ? COLORS.info : COLORS.borderInput}`,
                      color: linkedLocked ? COLORS.info : COLORS.textMuted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', zIndex: 50, padding: 0,
                      transition: 'all 0.15s',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      {linkedLocked ? (
                        <>
                          <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
                          <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
                        </>
                      ) : (
                        <>
                          <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
                          <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
                          <line x1="4" y1="4" x2="12" y2="12" strokeWidth="2" />
                        </>
                      )}
                    </svg>
                  </button>
                );
              }
            });
            return connectors;
          })()}

          {/* Current time line */}
          <CurrentTimeLine endHour={TIMELINE_END_HOUR} />
        </div>
      </div>
    </div>
  );
}

// TAction component moved to ConfigurableActions.tsx — buttons are now config-driven

function AssignDropdown({
  appointment,
  teamMembers,
  onAssign,
  onClose,
}: {
  appointment: Appointment;
  teamMembers: TeamMember[];
  onAssign: (memberId: string | null) => void;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter team members by this appointment's module
  const aptModule = appointment.module || 'auto_tint';
  const filtered = teamMembers.filter(tm =>
    tm.module_permissions.includes(aptModule)
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4,
        zIndex: 200, minWidth: 160, maxHeight: 240, overflowY: 'auto',
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.borderAccent}`,
        borderRadius: RADIUS.md,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '4px 0',
      }}
    >
      {/* Unassign option */}
      {appointment.assigned_team_member_id && (
        <button
          onClick={() => onAssign(null)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '6px 12px', background: 'transparent', border: 'none',
            fontSize: FONT.sizeXs, color: COLORS.textMuted, cursor: 'pointer',
            fontStyle: 'italic',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          Unassign
        </button>
      )}
      {filtered.length === 0 && (
        <div style={{
          padding: '8px 12px', fontSize: FONT.sizeXs, color: COLORS.textMuted,
          fontStyle: 'italic',
        }}>
          No team members for {MODULE_LABELS[aptModule] || aptModule}
        </div>
      )}
      {filtered.map(tm => {
        const isSelected = appointment.assigned_team_member_id === tm.id;
        return (
          <button
            key={tm.id}
            onClick={() => onAssign(tm.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', textAlign: 'left',
              padding: '6px 12px', background: isSelected ? COLORS.hoverBg : 'transparent',
              border: 'none', fontSize: FONT.sizeXs,
              color: isSelected ? COLORS.textPrimary : COLORS.textTertiary,
              fontWeight: isSelected ? FONT.weightSemibold : FONT.weightNormal,
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: isSelected ? COLORS.info : COLORS.borderInput,
              color: isSelected ? '#fff' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: FONT.weightBold, flexShrink: 0,
            }}>
              {tm.name.charAt(0).toUpperCase()}
            </span>
            {tm.name}
          </button>
        );
      })}
    </div>
  );
}

function CurrentTimeLine({ endHour }: { endHour: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < TIMELINE_START_HOUR * 60 || mins > endHour * 60) return null;

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
