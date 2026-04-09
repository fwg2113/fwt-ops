'use client';

import { useMemo } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from './theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

// ============================================================================
// MINI TIMELINE
// Read-only compact vertical timeline for embedding in modals
// Same visual style as the full TimelineView — cards sized by duration,
// overlapping appointments laid out side-by-side like Google Calendar
// ============================================================================

interface TimelineAppointment {
  id?: string;
  customer_name: string;
  appointment_time: string | null;
  work_order_time?: string | null;
  appointment_type: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  duration_minutes: number | null;
  status: string;
  services_json?: unknown;
}

export interface GhostCard {
  time: string;           // "HH:MM" format
  durationMinutes: number;
  label: string;          // e.g. "2022 Ford Mustang Mach-E"
  services: string;       // e.g. "Full 2dr | WS"
  optionLabel?: string;   // e.g. "Option 1" for multi-option display
}

interface Props {
  appointments: TimelineAppointment[];
  loading?: boolean;
  dateLabel?: string;
  summary?: { total: number; dropoffs: number; waiting: number; headsups: number } | null;
  excludeId?: string;
  height?: number;
  ghostCards?: GhostCard[];
}

const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 19;
const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
const PIXELS_PER_HOUR = 80;
const TOTAL_HEIGHT = TOTAL_HOURS * PIXELS_PER_HOUR;
const TIME_GUTTER_WIDTH = 48;

const TYPE_COLORS: Record<string, string> = {
  dropoff: '#3b82f6',
  waiting: '#ef4444',
  headsup_30: '#f59e0b',
  headsup_60: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: 'HU 30m',
  headsup_60: 'HU 60m',
};

function timeToMinutes(time: string | null): number {
  if (!time) return (TIMELINE_START_HOUR + 1) * 60;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(time: string | null): string {
  if (!time) return 'TBD';
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildServiceSummary(servicesJson: unknown): string {
  if (!servicesJson || !Array.isArray(servicesJson)) return '';
  return (servicesJson as Array<{ label?: string; filmAbbrev?: string; filmName?: string }>)
    .map(s => {
      const parts = [s.label || ''];
      if (s.filmAbbrev || s.filmName) parts.push(s.filmAbbrev || s.filmName || '');
      return parts.join(' ');
    })
    .join(' | ');
}

// Compute overlap columns — assigns each appointment a column index and total columns in its group
function computeColumns(appts: { startMin: number; endMin: number; index: number }[]): Map<number, { col: number; totalCols: number }> {
  const result = new Map<number, { col: number; totalCols: number }>();
  if (appts.length === 0) return result;

  // Sort by start time, then by duration (longer first)
  const sorted = [...appts].sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  // Greedy column assignment
  const columns: { endMin: number; index: number }[][] = [];

  for (const apt of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1];
      if (apt.startMin >= lastInCol.endMin) {
        columns[c].push(apt);
        result.set(apt.index, { col: c, totalCols: 0 }); // totalCols set later
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([apt]);
      result.set(apt.index, { col: columns.length - 1, totalCols: 0 });
    }
  }

  // Now determine the max overlapping columns for each appointment
  // For simplicity, use the total number of columns
  const totalCols = columns.length;
  for (const [idx, val] of result) {
    result.set(idx, { ...val, totalCols });
  }

  return result;
}

export default function MiniTimeline({ appointments, loading, dateLabel, summary, excludeId, height, ghostCards }: Props) {
  const isMobile = useIsMobile();
  const PPH = isMobile ? 100 : PIXELS_PER_HOUR;
  const pxPerMin = PPH / 60;
  const totalHeight = TOTAL_HOURS * PPH;
  const scrollHeight = height || 400;
  const gutterWidth = isMobile ? 36 : TIME_GUTTER_WIDTH;

  const filtered = useMemo(() =>
    appointments
      .filter(a => a.status !== 'cancelled' && (!excludeId || a.id !== excludeId))
      .sort((a, b) => (a.appointment_time || '99:99').localeCompare(b.appointment_time || '99:99')),
    [appointments, excludeId]
  );

  // Resolve effective time: work_order_time > appointment_time
  const effectiveTime = (apt: TimelineAppointment) => apt.work_order_time || apt.appointment_time;

  // Ghost card indices start after real appointments
  const ghostStartIndex = filtered.length;

  // Compute overlap layout (includes ghost cards if present)
  const columnLayout = useMemo(() => {
    const items = filtered.map((apt, i) => {
      const startMin = timeToMinutes(effectiveTime(apt));
      const duration = apt.duration_minutes || 60;
      return { startMin, endMin: startMin + duration, index: i };
    });
    // Include ghost cards in overlap computation
    if (ghostCards) {
      ghostCards.forEach((gc, gi) => {
        const startMin = timeToMinutes(gc.time);
        items.push({ startMin, endMin: startMin + gc.durationMinutes, index: ghostStartIndex + gi });
      });
    }
    return computeColumns(items);
  }, [filtered, ghostCards, ghostStartIndex]);

  // Hour markers
  const hourMarkers = useMemo(() => {
    const markers = [];
    for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      markers.push({ hour: h, label: isMobile ? `${displayH}${ampm}` : `${displayH} ${ampm}`, top: (h - TIMELINE_START_HOUR) * PPH });
    }
    return markers;
  }, [isMobile, PPH]);

  if (loading) {
    return (
      <div style={{
        border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm,
        padding: SPACING.md, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeXs,
      }}>
        Loading schedule...
      </div>
    );
  }

  return (
    <div style={{
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    }}>
      {/* Header */}
      {(dateLabel || summary) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: `${SPACING.xs + 2}px ${SPACING.md}px`,
          background: COLORS.activeBg,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          {dateLabel && (
            <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textSecondary }}>
              {dateLabel}
            </span>
          )}
          {summary && (
            <div style={{ display: 'flex', gap: SPACING.md }}>
              {summary.dropoffs > 0 && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}><span style={{ color: '#3b82f6', fontWeight: FONT.weightSemibold }}>{summary.dropoffs}</span> drop</span>}
              {summary.waiting > 0 && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}><span style={{ color: '#ef4444', fontWeight: FONT.weightSemibold }}>{summary.waiting}</span> wait</span>}
              {summary.headsups > 0 && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}><span style={{ color: '#f59e0b', fontWeight: FONT.weightSemibold }}>{summary.headsups}</span> HU</span>}
            </div>
          )}
        </div>
      )}

      {/* Scrollable timeline */}
      <div style={{ height: scrollHeight, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ position: 'relative', display: 'flex', height: totalHeight }}>
          {/* Time gutter */}
          <div style={{
            width: gutterWidth, flexShrink: 0,
            borderRight: `1px solid ${COLORS.border}`,
            position: 'relative',
          }}>
            {hourMarkers.map(m => (
              <div key={m.hour} style={{
                position: 'absolute', top: m.top, right: 8,
                fontSize: '10px', color: COLORS.textMuted,
                fontWeight: FONT.weightMedium, lineHeight: 1,
                transform: 'translateY(-50%)',
              }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* Main area */}
          <div style={{ flex: 1, position: 'relative' }}>
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
                borderTop: '1px dashed rgba(255,255,255,0.04)',
              }} />
            ))}

            {/* Empty state */}
            {filtered.length === 0 && (
              <div style={{
                position: 'absolute', top: '40%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: FONT.sizeSm, color: COLORS.textMuted,
                whiteSpace: 'nowrap',
              }}>
                No appointments -- wide open
              </div>
            )}

            {/* Appointment blocks */}
            {filtered.map((apt, i) => {
              const resolvedTime = effectiveTime(apt);
              const startMin = timeToMinutes(resolvedTime);
              const duration = apt.duration_minutes || 60;
              const top = (startMin - TIMELINE_START_HOUR * 60) * pxPerMin;
              const cardHeight = Math.max(duration * pxPerMin, 24);
              const isPaid = apt.status === 'invoiced' || apt.status === 'completed';
              const typeColor = isPaid ? '#22c55e' : (TYPE_COLORS[apt.appointment_type] || '#6b7280');
              const layout = isMobile ? { col: 0, totalCols: 1 } : (columnLayout.get(i) || { col: 0, totalCols: 1 });
              const serviceSummary = buildServiceSummary(apt.services_json);
              const isCompact = cardHeight < 45;

              // Side-by-side layout for overlapping appointments (single column on mobile)
              const colWidth = 100 / layout.totalCols;
              const leftPct = layout.col * colWidth;

              return (
                <div
                  key={apt.id || i}
                  style={{
                    position: 'absolute',
                    top,
                    left: `calc(${leftPct}% + 3px)`,
                    width: `calc(${colWidth}% - 6px)`,
                    height: cardHeight,
                    background: `${typeColor}18`,
                    border: `1px solid ${typeColor}40`,
                    borderLeft: `3px solid ${typeColor}`,
                    borderRadius: RADIUS.sm,
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'center',
                    padding: isCompact ? '2px 8px' : '4px 10px',
                  }}
                >
                  {/* Row 1: Time + Type + Duration */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: isCompact ? '10px' : FONT.sizeXs,
                    lineHeight: 1.3,
                  }}>
                    <span style={{ fontWeight: FONT.weightBold, color: typeColor }}>
                      {formatTime(resolvedTime)}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: FONT.weightSemibold,
                      color: typeColor, opacity: 0.8,
                    }}>
                      {TYPE_LABELS[apt.appointment_type]} {duration}m
                    </span>
                  </div>

                  {/* Row 2: Vehicle */}
                  <div style={{
                    fontSize: isCompact ? '10px' : FONT.sizeXs,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.textPrimary,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}>
                    {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                  </div>

                  {/* Row 3: Services (if enough room) */}
                  {!isCompact && serviceSummary && (
                    <div style={{
                      fontSize: '10px',
                      color: COLORS.textMuted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      lineHeight: 1.3,
                    }}>
                      {serviceSummary}
                    </div>
                  )}

                  {/* Row 4: Customer (if enough room) */}
                  {!isCompact && (
                    <div style={{
                      fontSize: '10px',
                      color: COLORS.textTertiary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      lineHeight: 1.3,
                    }}>
                      {apt.customer_name}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ghost card previews */}
            {ghostCards && ghostCards.map((gc, gi) => {
              const ghostStartMin = timeToMinutes(gc.time);
              const ghostTop = (ghostStartMin - TIMELINE_START_HOUR * 60) * pxPerMin;
              const ghostHeight = Math.max(gc.durationMinutes * pxPerMin, 24);
              const ghostLayout = isMobile ? { col: 0, totalCols: 1 } : (columnLayout.get(ghostStartIndex + gi) || { col: 0, totalCols: 1 });
              const ghostColWidth = 100 / ghostLayout.totalCols;
              const ghostLeftPct = ghostLayout.col * ghostColWidth;
              const ghostCompact = ghostHeight < 45;

              // Check if ghost overlaps any real appointment
              const hasOverlap = filtered.some(apt => {
                const aStart = timeToMinutes(effectiveTime(apt));
                const aEnd = aStart + (apt.duration_minutes || 60);
                const gEnd = ghostStartMin + gc.durationMinutes;
                return ghostStartMin < aEnd && gEnd > aStart;
              });

              const ghostColor = hasOverlap ? '#f59e0b' : '#8b5cf6';

              return (
                <div
                  key={`ghost-${gi}`}
                  style={{
                    position: 'absolute',
                    top: ghostTop,
                    left: `calc(${ghostLeftPct}% + 3px)`,
                    width: `calc(${ghostColWidth}% - 6px)`,
                    height: ghostHeight,
                    background: `${ghostColor}12`,
                    border: `1.5px dashed ${ghostColor}50`,
                    borderLeft: `3px dashed ${ghostColor}`,
                    borderRadius: RADIUS.sm,
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'center',
                    padding: ghostCompact ? '2px 8px' : '4px 10px',
                    opacity: 0.85,
                  }}
                >
                  {/* Row 1: Time + Preview badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: ghostCompact ? '10px' : FONT.sizeXs,
                    lineHeight: 1.3,
                  }}>
                    <span style={{ fontWeight: FONT.weightBold, color: ghostColor }}>
                      {gc.optionLabel || formatTime(gc.time)}
                    </span>
                    <span style={{
                      fontSize: '8px', fontWeight: 700,
                      color: ghostColor, textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {gc.optionLabel ? formatTime(gc.time) : 'Preview'} {gc.durationMinutes}m
                    </span>
                    {hasOverlap && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ghostColor} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                    )}
                  </div>

                  {/* Row 2: Vehicle */}
                  <div style={{
                    fontSize: ghostCompact ? '10px' : FONT.sizeXs,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.textPrimary,
                    opacity: 0.7,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}>
                    {gc.label}
                  </div>

                  {/* Row 3: Services (if enough room) */}
                  {!ghostCompact && gc.services && (
                    <div style={{
                      fontSize: '10px',
                      color: COLORS.textMuted,
                      opacity: 0.6,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      lineHeight: 1.3,
                    }}>
                      {gc.services}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
