'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';
import { MODULE_LABELS, MODULE_COLORS } from './AppointmentCard';
import SendDirectionsModal from './SendDirectionsModal';

// Short abbreviations for mobile module badges
const MODULE_ABBREVS: Record<string, string> = {
  auto_tint: 'WT',
  flat_glass: 'FLAT',
  detailing: 'Detail',
  ceramic_coating: 'CC',
  ppf: 'PPF',
  wraps: 'WRAP',
};
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
  isMobile?: boolean;
  isTablet?: boolean;
  onEdit: (apt: Appointment) => void;
  onStatusChange: (id: string, status: string) => void;
  onOrderChange: (positions: { id: string; minutes: number }[]) => void;
  onDurationChange: (id: string, newDuration: number) => void;
  onAction: (buttonKey: string, apt: Appointment, anchorRect?: DOMRect) => void;
  buttonsConfig?: ActionButtonConfig[];
  onAddLinkedSlot?: (apt: Appointment) => void;
  teamMembers?: TeamMember[];
  onAssign?: (aptId: string, teamMemberId: string | null) => void;
  onAssignMulti?: (aptId: string, teamMemberIds: string[]) => void;
  teamAssignmentConfig?: { enabled: boolean; requiredBeforeCheckin: boolean };
  moduleColorMap?: Record<string, string>;
  moduleLabelMap?: Record<string, string>;
  typeColorMap?: Record<string, string>;
}

// Timeline config
const TIMELINE_START_HOUR = 7;
const MIN_END_HOUR = 19; // default 7pm, extends dynamically if appointments run later
const PIXELS_PER_HOUR = 120;
const PIXELS_PER_HOUR_MOBILE = 260; // scaled so 30min cards (130px min) match the timeline
const PIXELS_PER_HOUR_TABLET = 180; // accounts for bottom action bar on touch cards
const PIXELS_PER_MIN = PIXELS_PER_HOUR / 60;
const SNAP_MINUTES = 15;
const TIME_GUTTER_WIDTH = 64;
const TIME_GUTTER_WIDTH_MOBILE = 44;

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

// Produce a solid dark card background from a module color.
// Takes the hue from the module color, keeps enough saturation and lightness
// that each module is clearly distinct. Dark enough for white text.
function solidCardBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const d = max - min;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  // HSL to RGB: S=0.50 for rich color, L=0.28 for clearly visible on dark bg
  const s = 0.50, l = 0.28;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  const sector = Math.floor(h * 6);
  if (sector === 0 || sector === 6) { r1 = c; g1 = x; }
  else if (sector === 1) { r1 = x; g1 = c; }
  else if (sector === 2) { g1 = c; b1 = x; }
  else if (sector === 3) { g1 = x; b1 = c; }
  else if (sector === 4) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
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

// Build individual service lines for mobile -- each service gets its own prominent line
function buildMobileServiceLines(servicesJson: unknown): string[] {
  if (!servicesJson || !Array.isArray(servicesJson)) return [];
  return (servicesJson as Array<{ label?: string; filmAbbrev?: string; filmName?: string; shade?: string; description?: string }>)
    .map(s => {
      if (s.description && !s.label) return s.description; // generic line items
      const parts: string[] = [];
      if (s.label) parts.push(s.label);
      if (s.filmAbbrev || s.filmName) parts.push(s.filmAbbrev || s.filmName || '');
      if (s.shade) parts.push(s.shade);
      return parts.join(' - ');
    })
    .filter(Boolean);
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
  appointments, isMobile, isTablet, onEdit, onStatusChange, onOrderChange, onDurationChange, onAction, buttonsConfig, onAddLinkedSlot, teamMembers, onAssign, onAssignMulti, teamAssignmentConfig, moduleColorMap, moduleLabelMap, typeColorMap,
}: Props) {
  // isTouch = any touch device (phone or tablet) -- controls button sizing, badge position
  const isTouch = isMobile || isTablet;
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

  const PPH = isMobile ? PIXELS_PER_HOUR_MOBILE : isTablet ? PIXELS_PER_HOUR_TABLET : PIXELS_PER_HOUR;
  const PPM = PPH / 60;
  const GUTTER = isMobile ? TIME_GUTTER_WIDTH_MOBILE : TIME_GUTTER_WIDTH;
  const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const TIMELINE_HEIGHT = TOTAL_HOURS * PPH;

  // Mobile-aware position calculator
  const toPosition = useCallback((minutes: number) => {
    return (minutes - TIMELINE_START_HOUR * 60) * PPM;
  }, [PPM]);

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
  const [assignDropdownRect, setAssignDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const [directionsModalApt, setDirectionsModalApt] = useState<Appointment | null>(null);

  // Work order positions — use work_order_time if saved, otherwise fall back to appointment_time
  const [workOrder, setWorkOrder] = useState<Map<string, number>>(() => {
    const order = new Map<string, number>();
    appointments.forEach(apt => {
      const savedTime = apt.work_order_time || apt.appointment_time;
      order.set(apt.id, timeToMinutes(savedTime));
    });
    return order;
  });
  // Keep workOrderRef in sync with the live state so drag-end handlers
  // (running inside event-listener closures) can read the latest positions
  // without needing to reinstall their listeners.
  useEffect(() => { workOrderRef.current = workOrder; }, [workOrder]);
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

  // Refs that always point at the latest workOrder + appointments so the
  // drag-end handlers (which run inside event listener closures) can access
  // current state without reinstalling listeners on every change.
  const workOrderRef = useRef<Map<string, number>>(new Map());
  const appointmentsRef = useRef(appointments);
  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);

  // Auto-save the current order to the DB. Called on drag-end so the user
  // never has to remember to click "Save Order" — the cards just stick where
  // you put them. Without this, any unsaved drag is lost on the next HMR
  // reload, page refresh, or component remount.
  const autoSaveOrder = useCallback(() => {
    const apts = appointmentsRef.current;
    const map = workOrderRef.current;
    const positions = apts.map(apt => ({
      id: apt.id,
      minutes: map.get(apt.id) ?? timeToMinutes(apt.appointment_time),
    }));
    onOrderChange(positions);
  }, [onOrderChange]);

  // Frozen column assignments: snapshot taken when drag/resize starts so other cards don't shift
  const frozenColumnsRef = useRef<Map<string, { column: number; totalColumns: number }> | null>(null);
  // Always-current ref to live column assignments (set after computation below)
  const liveColumnsRef = useRef<Map<string, { column: number; totalColumns: number }>>(new Map());

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
    // Freeze column assignments so other cards don't shift during drag
    frozenColumnsRef.current = new Map(liveColumnsRef.current);
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

    function onUp() {
      setDragId(null);
      // Auto-save so the user never has to remember to click "Save Order".
      // Without this, the new position only lives in local state and gets
      // wiped on the next HMR / refresh / remount.
      autoSaveOrder();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragId, linkedLocked, appointments, workOrder, autoSaveOrder]);

  // Resize — drag bottom edge to change duration
  const handleResizeStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { y: e.clientY, duration: localDurations.get(id) || 60 };
    frozenColumnsRef.current = new Map(liveColumnsRef.current);
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

  // ============================================================================
  // TOUCH DRAG + RESIZE (mobile)
  // ============================================================================
  const touchDragRef = useRef<{ id: string; startY: number; startMin: number } | null>(null);
  const touchResizeRef = useRef<{ id: string; startY: number; startDuration: number } | null>(null);

  const handleTouchDragStart = useCallback((e: React.TouchEvent, id: string) => {
    const touch = e.touches[0];
    if (!touch) return;
    const startMin = workOrder.get(id) || 0;
    // Freeze column assignments so other cards don't shift during touch drag
    frozenColumnsRef.current = new Map(liveColumnsRef.current);
    touchDragRef.current = { id, startY: touch.clientY, startMin };
  }, [workOrder]);

  const handleTouchDragMove = useCallback((e: React.TouchEvent) => {
    if (!touchDragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    try { e.preventDefault(); } catch { /* passive listener */ }
    const deltaY = touch.clientY - touchDragRef.current.startY;
    const deltaMins = Math.round((deltaY / PPM) / SNAP_MINUTES) * SNAP_MINUTES;
    const newMin = Math.max(TIMELINE_START_HOUR * 60, Math.min(TIMELINE_END_HOUR * 60 - 15, touchDragRef.current.startMin + deltaMins));
    const dragId = touchDragRef.current.id;
    setWorkOrder(prev => { const n = new Map(prev); n.set(dragId, newMin); return n; });
  }, [PPM, TIMELINE_END_HOUR]);

  const handleTouchDragEnd = useCallback(() => {
    const wasDragging = !!touchDragRef.current;
    touchDragRef.current = null;
    frozenColumnsRef.current = null;
    if (wasDragging) {
      // Persist the new position immediately so a refresh / HMR doesn't lose it
      autoSaveOrder();
    }
  }, [autoSaveOrder]);

  const handleTouchResizeStart = useCallback((e: React.TouchEvent, id: string) => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    const startDuration = localDurations.get(id) || 60;
    frozenColumnsRef.current = new Map(liveColumnsRef.current);
    touchResizeRef.current = { id, startY: touch.clientY, startDuration };
  }, [localDurations]);

  const handleTouchResizeMove = useCallback((e: React.TouchEvent) => {
    if (!touchResizeRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    try { e.preventDefault(); } catch { /* passive listener */ }
    const deltaY = touch.clientY - touchResizeRef.current.startY;
    const deltaMins = Math.round((deltaY / PPM) / SNAP_MINUTES) * SNAP_MINUTES;
    const newDuration = Math.max(15, touchResizeRef.current.startDuration + deltaMins);
    const resizeId = touchResizeRef.current.id;
    setLocalDurations(prev => { const n = new Map(prev); n.set(resizeId, newDuration); return n; });
  }, [PPM]);

  const handleTouchResizeEnd = useCallback(() => {
    if (touchResizeRef.current) {
      const dur = localDurations.get(touchResizeRef.current.id);
      if (dur) onDurationChange(touchResizeRef.current.id, dur);
    }
    touchResizeRef.current = null;
    frozenColumnsRef.current = null;
  }, [localDurations, onDurationChange]);

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
    hourMarkers.push({ hour: h, label: isMobile ? `${displayH}${ampm}` : `${displayH}:00 ${ampm}`, top: (h - TIMELINE_START_HOUR) * PPH });
  }

  const activeAppointments = appointments.filter(a => a.status !== 'cancelled');

  // Compute overlap column assignments (Google Calendar-style side-by-side)
  // During drag/resize, use frozen assignments so other cards don't shift
  const liveColumnAssignments = useMemo(() => assignColumns(
    activeAppointments,
    (apt) => workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time),
    (apt) => localDurations.get(apt.id) || apt.duration_minutes || 60,
  ), [activeAppointments, workOrder, localDurations]);

  // Keep the ref in sync so drag start handlers can snapshot it
  liveColumnsRef.current = liveColumnAssignments;

  const isDraggingOrResizing = !!(dragId || resizeId || touchDragRef.current || touchResizeRef.current);
  const columnAssignments = (isDraggingOrResizing && frozenColumnsRef.current)
    ? frozenColumnsRef.current
    : liveColumnAssignments;

  // Keep frozen ref in sync when not interacting
  useEffect(() => {
    if (!isDraggingOrResizing) {
      frozenColumnsRef.current = null;
    }
  }, [isDraggingOrResizing]);

  // Mobile overlap resolution: push overlapping cards down so they don't cover each other
  const mobileTopOffsets = useMemo(() => {
    if (!isMobile) return new Map<string, number>();
    const offsets = new Map<string, number>();
    // Sort by start time
    const sorted = [...activeAppointments].sort((a, b) => {
      const aMin = workOrder.get(a.id) ?? timeToMinutes(a.appointment_time);
      const bMin = workOrder.get(b.id) ?? timeToMinutes(b.appointment_time);
      return aMin - bMin;
    });
    // Track the visual bottom of each placed card (in pixels)
    const placedBottoms: { top: number; bottom: number }[] = [];
    const MOBILE_MIN_CARD_HEIGHT = 130; // must match rendered min height
    for (const apt of sorted) {
      const startMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
      const duration = localDurations.get(apt.id) || apt.duration_minutes || 60;
      const naturalTop = toPosition(startMin);
      const cardHeight = Math.max(duration * PPM, MOBILE_MIN_CARD_HEIGHT);
      // Find if this card overlaps any already-placed card
      let adjustedTop = naturalTop;
      for (const placed of placedBottoms) {
        if (adjustedTop < placed.bottom && (adjustedTop + cardHeight) > placed.top) {
          // Overlap -- push below
          adjustedTop = placed.bottom + 4; // 4px gap
        }
      }
      offsets.set(apt.id, adjustedTop - naturalTop);
      placedBottoms.push({ top: adjustedTop, bottom: adjustedTop + cardHeight });
    }
    return offsets;
  }, [isMobile, activeAppointments, workOrder, localDurations, toPosition, PPM]);

  // Calculate extra height needed for pushed-down mobile cards
  const mobileExtraHeight = useMemo(() => {
    if (!isMobile || mobileTopOffsets.size === 0) return 0;
    let maxBottom = 0;
    for (const apt of activeAppointments) {
      const startMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
      const duration = localDurations.get(apt.id) || apt.duration_minutes || 60;
      const naturalTop = toPosition(startMin);
      const offset = mobileTopOffsets.get(apt.id) || 0;
      const cardHeight = Math.max(duration * PPM, 120);
      const bottom = naturalTop + offset + cardHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return Math.max(0, maxBottom - TIMELINE_HEIGHT);
  }, [isMobile, mobileTopOffsets, activeAppointments, workOrder, localDurations, toPosition, PPM, TIMELINE_HEIGHT]);

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
      {(
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
      )}

      {/* Timeline */}
      <div style={{
        position: 'relative', display: 'flex',
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.borderAccent}`,
        borderRadius: RADIUS.xl,
        overflow: isMobile ? 'visible' : 'auto',
        minWidth: 0,
      }}>
        {/* Time gutter */}
        <div style={{
          width: GUTTER, flexShrink: 0,
          borderRight: `1px solid ${COLORS.border}`,
          position: 'relative', height: TIMELINE_HEIGHT + mobileExtraHeight,
        }}>
          {hourMarkers.map(m => (
            <div key={m.hour} style={{
              position: 'absolute', top: m.top, right: isMobile ? 4 : 8,
              fontSize: isMobile ? '0.6rem' : FONT.sizeXs, color: COLORS.textMuted,
              fontWeight: FONT.weightMedium, lineHeight: 1,
              transform: 'translateY(-50%)',
            }}>
              {m.label}
            </div>
          ))}
        </div>

        {/* Main area */}
        <div ref={timelineRef} style={{ flex: 1, position: 'relative', height: TIMELINE_HEIGHT + mobileExtraHeight }}>
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
              position: 'absolute', top: m.top + PPH / 2, left: 0, right: 0,
              borderTop: '1px dashed rgba(255,255,255,0.03)',
            }} />
          ))}

          {/* Appointment cards */}
          {activeAppointments.map(apt => {
            const workMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
            const duration = localDurations.get(apt.id) || apt.duration_minutes || 60;
            const top = toPosition(workMin);
            const MOBILE_MIN_CARD_H = 130; // must fit: time + services + customer + action bar
            const height = Math.max(duration * PPM, isMobile ? MOBILE_MIN_CARD_H : 20);
            const typeColor = typeColorMap?.[apt.appointment_type] || TYPE_COLORS[apt.appointment_type] || '#6b7280';
            const isPaid = apt.status === 'invoiced' || apt.status === 'paid';
            const leftBlockColor = isPaid ? '#22c55e' : typeColor;
            const modColor = moduleColorMap?.[apt.module] || MODULE_COLORS[apt.module] || '#6b7280';
            const statusColor = STATUS_COLORS[apt.status] || COLORS.textMuted;
            const isCompact = !isMobile && duration <= 30;
            const isTiny = !isMobile && duration <= 15;
            const isDragging = dragId === apt.id;
            const isResizing = resizeId === apt.id;
            const isInteracting = isDragging || isResizing;
            const serviceSummary = buildServiceSummary(apt.services_json);
            const scheduledTime = formatTime(timeToMinutes(apt.appointment_time));
            const workOrderTime = formatTime(workMin);
            const scheduledDiffers = Math.abs(workMin - timeToMinutes(apt.appointment_time)) >= 15;

            // Column positioning: single column on mobile, overlap columns on desktop
            const colInfo = isMobile
              ? { column: 0, totalColumns: 1 }
              : (columnAssignments.get(apt.id) || { column: 0, totalColumns: 1 });
            const COL_GAP = 3; // px gap between columns
            const colWidthPercent = 100 / colInfo.totalColumns;
            const leftPercent = colInfo.column * colWidthPercent;
            const cardLeft = `calc(${leftPercent}% + ${COL_GAP / 2}px)`;
            const cardWidth = `calc(${colWidthPercent}% - ${COL_GAP}px)`;
            const isNarrow = !isMobile && colInfo.totalColumns >= 3;
            // Card text colors
            const cardTextPrimary = 'rgba(255,255,255,0.95)';
            const cardTextSecondary = 'rgba(255,255,255,0.7)';
            const cardTextMuted = 'rgba(255,255,255,0.5)';

            // ---- MOBILE CARD LAYOUT ----
            if (isMobile) {
              // Build detailed service lines for mobile (each service on its own line)
              const serviceLines = buildMobileServiceLines(apt.services_json);
              const mobileModuleLabel = MODULE_ABBREVS[apt.module] || moduleLabelMap?.[apt.module] || MODULE_LABELS[apt.module] || apt.module;
              const mobileOffset = mobileTopOffsets.get(apt.id) || 0;
              const mobileTop = top + mobileOffset;

              const isTouchDragging = touchDragRef.current?.id === apt.id;
              const isTouchResizing = touchResizeRef.current?.id === apt.id;

              return (
                <div
                  key={apt.id}
                  style={{
                    position: 'absolute', top: mobileTop, left: 2, right: 2,
                    height, display: 'flex', flexDirection: 'column',
                    background: solidCardBg(modColor),
                    border: `1px solid ${solidCardBg(modColor)}`,
                    borderRadius: RADIUS.md,
                    overflow: 'hidden',
                    zIndex: isTouchDragging || isTouchResizing ? 100 : 10,
                    boxShadow: isTouchDragging ? '0 8px 24px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.3)',
                    userSelect: 'none',
                    opacity: isTouchDragging ? 0.92 : 1,
                    transition: isTouchDragging || isTouchResizing ? 'none' : 'box-shadow 0.2s',
                  }}
                >
                  {/* Drag grip handle (top) + link indicator */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: 22, flexShrink: 0,
                      background: 'rgba(255,255,255,0.05)',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      position: 'relative',
                    }}
                  >
                    {/* Drag area (center) */}
                    <div
                      onTouchStart={e => handleTouchDragStart(e, apt.id)}
                      onTouchMove={handleTouchDragMove}
                      onTouchEnd={handleTouchDragEnd}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', touchAction: 'none', cursor: 'grab',
                      }}
                    >
                      <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.3)' }} />
                    </div>
                    {/* Link indicator (right side of grip bar) */}
                    {apt.linked_group_id && (
                      <button
                        onClick={() => setLinkedLocked(prev => !prev)}
                        style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '2px 6px', borderRadius: 10,
                          background: linkedLocked ? `${COLORS.info}25` : 'rgba(255,255,255,0.1)',
                          border: `1px solid ${linkedLocked ? COLORS.info + '60' : 'rgba(255,255,255,0.2)'}`,
                          color: linkedLocked ? COLORS.info : 'rgba(255,255,255,0.5)',
                          cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700,
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                        {(apt.linked_slots?.length || 0) + 1}
                      </button>
                    )}
                  </div>

                  {/* Top section: type strip + content */}
                  <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    {/* Left type strip */}
                    <div style={{
                      width: 6, flexShrink: 0,
                      background: leftBlockColor,
                    }} />

                    {/* Content */}
                    <div style={{
                      flex: 1, minWidth: 0,
                      padding: '6px 10px',
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', gap: 1,
                    }}>
                      {/* Row 1: Time + Type + Duration + Price + Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: '0.85rem', fontWeight: 800, color: cardTextPrimary,
                        }}>
                          {workOrderTime}
                        </span>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 600, color: cardTextSecondary,
                          textTransform: 'uppercase',
                        }}>
                          {TYPE_LABELS[apt.appointment_type]} / {duration}m
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{
                          fontSize: '0.85rem', fontWeight: 800, color: cardTextPrimary,
                        }}>
                          ${Number(apt.balance_due).toFixed(0)}
                        </span>
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                          background: apt.status === 'in_progress' || apt.status === 'completed' || apt.status === 'invoiced' ? '#22c55e' : '#6b7280',
                        }} />
                      </div>

                      {/* Row 2: Services -- THE STAR OF THE SHOW */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 1,
                        overflow: 'hidden',
                      }}>
                        {serviceLines.length > 0 ? serviceLines.map((line, i) => (
                          <div key={i} style={{
                            fontSize: '0.82rem', fontWeight: 700, color: cardTextPrimary,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {line}
                          </div>
                        )) : serviceSummary ? (
                          <div style={{
                            fontSize: '0.82rem', fontWeight: 700, color: cardTextPrimary,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {serviceSummary}
                          </div>
                        ) : null}
                      </div>

                      {/* Row 3: Customer + team */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.7rem', color: cardTextMuted, marginTop: 1,
                      }}>
                        <span>{apt.customer_name}</span>
                        {(apt.assigned_team_member_names?.length > 0 || apt.assigned_team_member_name) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
                            </svg>
                            {(apt.assigned_team_member_names?.length > 0
                              ? apt.assigned_team_member_names.map(n => n.split(' ')[0]).join(', ')
                              : apt.assigned_team_member_name?.split(' ')[0]) || ''}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Module badge -- top center, hidden on short cards */}
                  {duration > 30 && (
                    <div style={{
                      position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                      zIndex: 2, pointerEvents: 'none',
                    }}>
                      <span style={{
                        fontSize: '1.1rem', fontWeight: 800,
                        color: 'rgba(255,255,255,0.35)',
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                      }}>
                        {mobileModuleLabel}
                      </span>
                    </div>
                  )}

                  {/* Bottom action bar */}
                  <div style={{
                    display: 'flex', gap: 1, borderTop: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.2)', flexShrink: 0,
                    flexWrap: 'wrap',
                  }}>
                    <ConfigurableActions
                      appointment={apt}
                      buttonsConfig={buttons}
                      actioned={actioned.get(apt.id) || new Set()}
                      onAction={(key, a, rect) => { markActioned(a.id, key); onAction(key, a, rect); }}
                      compact={false}
                      mobile={true}
                    />
                    {/* Directions + Send for off-site consultations */}
                    {(() => {
                      const locationMatch = apt.notes?.match(/Location:\s*(.+)/);
                      if (!locationMatch) return null;
                      const address = locationMatch[1].trim();
                      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                      const assignedMember = teamMembers?.find(tm => tm.id === apt.assigned_team_member_id);
                      const memberPhone = assignedMember?.phone;
                      return (
                        <>
                          <button
                            onClick={() => window.open(mapsUrl, '_blank')}
                            style={{
                              padding: '8px 0', flex: 1, textAlign: 'center',
                              background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)',
                              color: 'rgba(255,255,255,0.85)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            Map
                          </button>
                          <button
                            onClick={() => setDirectionsModalApt(apt)}
                            style={{
                              padding: '8px 0', flex: 1, textAlign: 'center',
                              background: 'transparent', border: 'none',
                              color: '#3b82f6', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            Send
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  {/* Resize grip handle (bottom) */}
                  <div
                    onTouchStart={e => handleTouchResizeStart(e, apt.id)}
                    onTouchMove={handleTouchResizeMove}
                    onTouchEnd={handleTouchResizeEnd}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: 18, flexShrink: 0, cursor: 'ns-resize',
                      background: 'rgba(255,255,255,0.05)',
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      touchAction: 'none',
                    }}
                  >
                    <div style={{
                      width: 32, height: 4, borderRadius: 2,
                      background: 'rgba(255,255,255,0.3)',
                    }} />
                  </div>
                </div>
              );
            }

            // ---- DESKTOP / TABLET CARD LAYOUT ----
            return (
              <div
                key={apt.id}
                style={{
                  position: 'absolute', top, left: cardLeft, width: cardWidth, height,
                  display: 'flex', flexDirection: isTouch ? 'column' : 'row',
                  background: solidCardBg(modColor),
                  border: `1px solid ${solidCardBg(modColor)}`,
                  borderRadius: RADIUS.md,
                  overflow: 'hidden',
                  cursor: isTouch ? 'default' : (isDragging ? 'grabbing' : 'grab'),
                  zIndex: isInteracting ? 100 : 10,
                  opacity: isDragging ? 0.92 : 1,
                  boxShadow: isDragging
                    ? `0 8px 24px rgba(0,0,0,0.4)`
                    : `0 1px 4px rgba(0,0,0,0.3)`,
                  transition: isInteracting ? 'none' : 'top 0.3s ease, height 0.3s ease, box-shadow 0.2s',
                  userSelect: 'none',
                }}
                onMouseDown={isTouch ? undefined : (e => handleDragStart(e, apt.id))}
              >
                {/* Module badge: centered on desktop, top-right on tablet */}
                {isTouch ? (
                  !isTiny && !isNarrow && (
                    <div style={{
                      position: 'absolute', top: 4, right: 8,
                      zIndex: 2, pointerEvents: 'none',
                    }}>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800,
                        color: 'rgba(255,255,255,0.7)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        padding: '2px 8px', borderRadius: 4,
                        textTransform: 'uppercase', letterSpacing: '1px',
                        whiteSpace: 'nowrap',
                      }}>
                        {moduleLabelMap?.[apt.module] || MODULE_LABELS[apt.module] || apt.module}
                      </span>
                    </div>
                  )
                ) : (
                  !isTiny && (
                  <div style={{
                    position: 'absolute', bottom: isCompact ? 2 : 4, left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1, pointerEvents: 'none',
                  }}>
                    <span style={{
                      fontSize: isCompact ? '0.55rem' : '0.65rem',
                      fontWeight: 800,
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      padding: isCompact ? '1px 6px' : '2px 10px',
                      borderRadius: RADIUS.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      whiteSpace: 'nowrap',
                    }}>
                      {moduleLabelMap?.[apt.module] || MODULE_LABELS[apt.module] || apt.module}
                    </span>
                  </div>
                  )
                )}

                {/* Main row: type block + content + info strip */}
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Type block (far left) */}
                <div style={{
                  width: isNarrow ? 60 : 92,
                  flexShrink: 0,
                  background: leftBlockColor,
                  borderRight: `1px solid ${leftBlockColor}`,
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
                  {/* Row 1: Vehicle (or consultation description) + link indicator + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 0 }}>
                    <span style={{
                      fontSize: isTiny ? '0.6rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                      fontWeight: FONT.weightSemibold, color: cardTextPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {apt.appointment_type === 'consultation'
                        ? serviceSummary.split(':')[0] || serviceSummary
                        : `${apt.vehicle_year} ${apt.vehicle_make} ${apt.vehicle_model}`
                      }
                    </span>
                    {apt.window_status === 'previously' && !isTiny && (
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.05em',
                        color: '#f59e0b', background: 'rgba(245,158,11,0.15)',
                        border: '1px solid rgba(245,158,11,0.35)',
                        padding: '0px 4px', borderRadius: 3,
                        whiteSpace: 'nowrap', lineHeight: '1.4', flexShrink: 0,
                      }}>PT</span>
                    )}
                    {!isTiny && apt.linked_group_id && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        flexShrink: 0,
                      }}>
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setLinkedLocked(prev => !prev); }}
                          title={linkedLocked ? 'Linked -- click to unlink (move independently)' : 'Unlinked -- click to link (move together)'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 8, cursor: 'pointer',
                            background: linkedLocked ? `${COLORS.info}20` : 'transparent',
                            border: `1px solid ${linkedLocked ? COLORS.info + '50' : COLORS.borderInput}`,
                            color: linkedLocked ? COLORS.info : COLORS.textMuted,
                            fontSize: '0.55rem', fontWeight: 600,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                          {(apt.linked_slots?.length || 0) + 1}
                        </button>
                        {onAddLinkedSlot && (
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onAddLinkedSlot(apt); }}
                            title="Add linked slot"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 14, height: 14, borderRadius: '50%', padding: 0,
                              background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                              color: COLORS.textMuted, cursor: 'pointer',
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                        )}
                      </span>
                    )}
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: apt.status === 'in_progress' || apt.status === 'completed' || apt.status === 'invoiced' ? '#22c55e' : '#6b7280',
                    }} />
                  </div>

                  {/* Row 2: Services / consultation notes */}
                  {!isTiny && (
                    <div style={{
                      fontSize: isCompact ? FONT.sizeXs : FONT.sizeSm,
                      fontWeight: apt.appointment_type === 'consultation' ? FONT.weightMedium : FONT.weightSemibold,
                      color: apt.appointment_type === 'consultation' ? cardTextSecondary : cardTextPrimary,
                      marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {apt.appointment_type === 'consultation'
                        ? (serviceSummary.includes(':') ? serviceSummary.split(':').slice(1).join(':').trim() : '')
                        : serviceSummary
                      }
                    </div>
                  )}

                  {/* Row 3: Customer + assigned team member */}
                  {!isCompact && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      fontSize: FONT.sizeXs, color: cardTextSecondary, marginTop: 4,
                    }}>
                      <span>{apt.customer_name}</span>
                      {apt.customer_phone && <span>{formatPhone(apt.customer_phone)}</span>}
                      {/* Assigned team members display + assign button */}
                      {teamAssignmentConfig?.enabled !== false && teamMembers && teamMembers.length > 0 && onAssignMulti && (
                        <span
                          onMouseDown={e => e.stopPropagation()}
                          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          <button
                            onClick={(e) => {
                              if (assignDropdownId === apt.id) {
                                setAssignDropdownId(null);
                                setAssignDropdownRect(null);
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setAssignDropdownRect({ top: rect.bottom + 4, left: rect.left });
                                setAssignDropdownId(apt.id);
                              }
                            }}
                            title={apt.assigned_team_member_names?.length ? `Assigned: ${apt.assigned_team_member_names.join(', ')}` : 'Assign team member'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                              color: apt.assigned_team_member_ids?.length > 0 ? COLORS.info : COLORS.textMuted,
                              fontSize: FONT.sizeXs,
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="8" cy="5" r="3" />
                              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
                            </svg>
                            {apt.assigned_team_member_names?.length > 0
                              ? apt.assigned_team_member_names.join(', ')
                              : 'Assign'}
                          </button>
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
                      {(apt.assigned_team_member_names?.length > 0 || apt.assigned_team_member_name) && (
                        <span style={{ color: cardTextMuted, flexShrink: 0 }}>
                          / {apt.assigned_team_member_names?.length > 0
                            ? apt.assigned_team_member_names.map(n => n.split(' ')[0]).join(', ')
                            : apt.assigned_team_member_name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Desktop only: Action buttons (middle-right) + Info strip (far right) */}
                {!isTouch && !isNarrow && (
                <>
                <div
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
                    flexWrap: 'wrap',
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
                  {/* Directions + Send buttons for off-site appointments */}
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
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setDirectionsModalApt(apt); }}
                          title="Send directions to team"
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
                      </>
                    );
                  })()}
                </div>

                {apt.appointment_type !== 'consultation' && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start',
                  padding: isTiny ? '2px 8px' : isCompact ? '4px 12px' : `${SPACING.sm}px 12px`,
                  borderLeft: `1px solid ${modColor}15`,
                  flexShrink: 0, minWidth: isTiny ? 50 : 70,
                  gap: isTiny ? 0 : 2,
                }}>
                  {(() => {
                    // Two-number price display:
                    // - Final Total (large): paid → total_paid (the actual all-in
                    //   the customer paid, including deposit). Unpaid → subtotal
                    //   (the menu-price estimate).
                    // - Balance Due (small): always shown as confirmation. $0
                    //   for paid rows, the remaining amount for unpaid rows.
                    //   Hidden only on tiny cards (no room).
                    const isPaidApt = apt.status === 'invoiced';
                    const finalTotal = isPaidApt
                      ? Number(apt.total_paid || 0)
                      : Number(apt.subtotal || 0);
                    const balanceDue = Number(apt.balance_due || 0);
                    return (
                      <>
                        <span style={{
                          fontSize: isTiny ? '0.65rem' : isCompact ? FONT.sizeXs : FONT.sizeSm,
                          fontWeight: FONT.weightBold, color: cardTextPrimary,
                        }}>
                          ${finalTotal.toFixed(0)}
                        </span>
                        {!isTiny && (
                          <span style={{
                            fontSize: '0.6rem',
                            color: balanceDue > 0 ? cardTextPrimary : cardTextMuted,
                            whiteSpace: 'nowrap',
                          }}>
                            Bal ${balanceDue.toFixed(0)}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {!isTiny && scheduledDiffers && (
                    <span style={{ fontSize: '0.6rem', color: cardTextMuted, whiteSpace: 'nowrap' }}>
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
                </>
                )}
                </div>

                {/* Tablet: bottom action bar (touch-friendly) */}
                {isTouch && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      display: 'flex', gap: 1, borderTop: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.2)', flexShrink: 0,
                    }}
                  >
                    <ConfigurableActions
                      appointment={apt}
                      buttonsConfig={buttons}
                      actioned={actioned.get(apt.id) || new Set()}
                      onAction={(key, a, rect) => { markActioned(a.id, key); onAction(key, a, rect); }}
                      compact={false}
                      mobile={true}
                    />
                  </div>
                )}

                {/* Resize handle (desktop only) */}
                {!isTouch && (
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
                )}
              </div>
            );
          })}

          {/* Linked appointment connectors (desktop only) */}
          {!isMobile && (() => {
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
                top: toPosition(workMin),
                height: Math.max(duration * PPM, 20),
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

          {/* Current time line -- uses PPH for mobile-aware positioning */}
          <CurrentTimeLine endHour={TIMELINE_END_HOUR} ppm={PPM} />
        </div>
      </div>

      {/* Multi-Assign Dropdown (fixed position, outside card overflow) */}
      {assignDropdownId && assignDropdownRect && teamMembers && onAssignMulti && (() => {
        const apt = appointments.find(a => a.id === assignDropdownId);
        if (!apt) return null;
        return (
          <MultiAssignDropdown
            appointment={apt}
            teamMembers={teamMembers}
            anchorPos={assignDropdownRect}
            onAssign={(ids) => { onAssignMulti(apt.id, ids); }}
            onClose={() => { setAssignDropdownId(null); setAssignDropdownRect(null); }}
          />
        );
      })()}

      {/* Send Directions Modal */}
      {directionsModalApt && (() => {
        const apt = directionsModalApt;
        const locationMatch = apt.notes?.match(/Location:\s*(.+)/);
        const address = locationMatch ? locationMatch[1].trim() : '';
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
        const workMin = workOrder.get(apt.id) ?? timeToMinutes(apt.appointment_time);
        return (
          <SendDirectionsModal
            customerName={apt.customer_name}
            appointmentTime={formatTime(workMin)}
            notes={buildServiceSummary(apt.services_json)}
            address={address}
            mapsUrl={mapsUrl}
            teamMembers={teamMembers || []}
            assignedTeamMemberId={apt.assigned_team_member_id}
            onClose={() => setDirectionsModalApt(null)}
          />
        );
      })()}
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

function MultiAssignDropdown({
  appointment,
  teamMembers,
  onAssign,
  onClose,
  anchorPos,
}: {
  appointment: Appointment;
  teamMembers: TeamMember[];
  onAssign: (memberIds: string[]) => void;
  onClose: () => void;
  anchorPos?: { top: number; left: number };
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const aptModule = appointment.module || 'auto_tint';

  // Sort: module-matching members first, then alphabetical
  const sorted = [...teamMembers].sort((a, b) => {
    const aMatch = a.module_permissions.includes(aptModule) ? 0 : 1;
    const bMatch = b.module_permissions.includes(aptModule) ? 0 : 1;
    return aMatch - bMatch || a.name.localeCompare(b.name);
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const currentIds = appointment.assigned_team_member_ids || [];

  return (
    <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: anchorPos?.top ?? 100,
        left: anchorPos?.left ?? 100,
        zIndex: 9999, minWidth: 200, maxHeight: 300, overflowY: 'auto',
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.borderAccent}`,
        borderRadius: RADIUS.md,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '4px 0',
      }}
    >
      <div style={{ padding: '4px 12px', fontSize: '9px', color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Assign Team
      </div>
      {sorted.map(tm => {
        const isAssigned = currentIds.includes(tm.id);
        const hasModule = tm.module_permissions.includes(aptModule);
        return (
          <button
            key={tm.id}
            onClick={() => {
              const updated = isAssigned
                ? currentIds.filter((id: string) => id !== tm.id)
                : [...currentIds, tm.id];
              onAssign(updated);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', textAlign: 'left',
              padding: '6px 12px', background: 'transparent', border: 'none',
              fontSize: FONT.sizeXs, color: COLORS.textPrimary, cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: `2px solid ${isAssigned ? '#22c55e' : COLORS.borderInput}`,
              background: isAssigned ? '#22c55e' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isAssigned && <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
            </div>
            <span>{tm.name}</span>
            {!hasModule && (
              <span style={{ fontSize: '9px', color: COLORS.textPlaceholder, marginLeft: 'auto' }}>other dept</span>
            )}
          </button>
        );
      })}
      <div style={{ padding: '4px 12px', borderTop: `1px solid ${COLORS.border}`, marginTop: 4 }}>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '4px', background: 'none', border: 'none',
            cursor: 'pointer', color: COLORS.textMuted, fontSize: FONT.sizeXs, textAlign: 'center',
          }}
        >
          Done
        </button>
      </div>
    </div>
    </>
  );
}

function CurrentTimeLine({ endHour, ppm }: { endHour: number; ppm: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < TIMELINE_START_HOUR * 60 || mins > endHour * 60) return null;

  const top = (mins - TIMELINE_START_HOUR * 60) * ppm;

  return (
    <div style={{
      position: 'absolute', top, left: 0, right: 0,
      zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'center',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.red, marginLeft: -4 }} />
      <div style={{ flex: 1, height: 2, background: COLORS.red }} />
    </div>
  );
}
