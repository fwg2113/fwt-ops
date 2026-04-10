'use client';

import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import { StatusBadge } from '@/app/components/dashboard';

interface Appointment {
  id: string;
  booking_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  appointment_type: string;
  appointment_date: string;
  appointment_time: string | null;
  duration_minutes: number | null;
  services_json: unknown;
  subtotal: number;
  discount_amount: number;
  deposit_paid: number;
  balance_due: number;
  discount_code: string | null;
  status: string;
  calendar_title: string | null;
  class_keys: string | null;
  booking_source: string;
  work_order_time: string | null;
  notes: string | null;
}

interface Props {
  appointment: Appointment;
  onEdit: (apt: Appointment) => void;
  onStatusChange: (id: string, status: string) => void;
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'red'> = {
  booked: 'info',
  confirmed: 'info',
  in_progress: 'warning',
  completed: 'success',
  invoiced: 'success',
  cancelled: 'danger',
  no_show: 'danger',
};

const TYPE_COLORS: Record<string, string> = {
  dropoff: '#3b82f6',
  waiting: '#ef4444',
  headsup_30: '#f59e0b',
  headsup_60: '#f59e0b',
  warranty: '#8b5cf6',
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: '30m Heads-Up',
  headsup_60: '60m Heads-Up',
  warranty: 'Warranty',
};

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
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

export type { Appointment };

export default function AppointmentCard({ appointment: apt, onEdit, onStatusChange }: Props) {
  const typeColor = TYPE_COLORS[apt.appointment_type] || '#6b7280';
  const serviceSummary = buildServiceSummary(apt.services_json);

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: COLORS.cardBg,
      borderRadius: RADIUS.xl,
      border: `1px solid ${COLORS.border}`,
      borderLeft: `4px solid ${typeColor}`,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Time column */}
      <div style={{
        padding: `${SPACING.md}px ${SPACING.lg}px`,
        minWidth: 90, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        borderRight: `1px solid ${COLORS.border}`,
      }}>
        <div style={{
          fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
          color: typeColor,
          background: `${typeColor}22`,
          padding: '4px 10px', borderRadius: RADIUS.sm,
          whiteSpace: 'nowrap',
        }}>
          {apt.appointment_time ? formatTime(apt.appointment_time) : 'TBD'}
        </div>
        <div style={{
          fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4,
          textTransform: 'uppercase',
        }}>
          {TYPE_LABELS[apt.appointment_type] || apt.appointment_type}
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, padding: `${SPACING.md}px ${SPACING.lg}px`,
        minWidth: 0,
      }}>
        {/* Top row: vehicle + booking ID + status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACING.sm,
          flexWrap: 'wrap', marginBottom: 4,
        }}>
          <div style={{
            fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold,
            color: COLORS.textPrimary,
          }}>
            {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
          </div>
          <StatusBadge label={apt.status} variant={STATUS_VARIANTS[apt.status] || 'neutral'} />
          {apt.discount_code && (
            <StatusBadge label={apt.discount_code} variant="red" />
          )}
        </div>

        {/* Services summary */}
        {serviceSummary && (
          <div style={{
            fontSize: FONT.sizeSm, color: COLORS.textTertiary,
            marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {serviceSummary}
          </div>
        )}

        {/* Customer + price row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACING.lg,
          fontSize: FONT.sizeSm, color: COLORS.textMuted,
          flexWrap: 'wrap',
        }}>
          <span>{apt.customer_name}</span>
          {apt.customer_phone && <span>{formatPhone(apt.customer_phone)}</span>}
          <span style={{ color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
            ${Number(apt.balance_due).toFixed(0)}
          </span>
          {apt.duration_minutes && (
            <span>{apt.duration_minutes}m</span>
          )}
          <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
            #{apt.booking_id}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.sm,
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        borderLeft: `1px solid ${COLORS.border}`,
      }}>
        <ActionButton
          label="Edit"
          onClick={() => onEdit(apt)}
          icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 1.5l2.5 2.5M1 13l1-4L10.5 .5l3 3L5 12l-4 1z"/></svg>}
        />
        {apt.status === 'booked' && (
          <ActionButton
            label="Ready"
            color={COLORS.info}
            onClick={() => onStatusChange(apt.id, 'confirmed')}
            icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7l3 3 5-5"/></svg>}
          />
        )}
        {(apt.status === 'booked' || apt.status === 'confirmed') && (
          <ActionButton
            label="Check In"
            color={COLORS.success}
            onClick={() => onStatusChange(apt.id, 'in_progress')}
            icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1v12M1 7h12"/></svg>}
          />
        )}
        {apt.status === 'in_progress' && (
          <ActionButton
            label="Done"
            color={COLORS.success}
            onClick={() => onStatusChange(apt.id, 'completed')}
            icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7l4 4 6-6"/></svg>}
          />
        )}
        <ActionButton
          label="Invoice"
          color={COLORS.yellowSolid}
          onClick={() => onStatusChange(apt.id, 'invoiced')}
          icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1h8v12H3zM5 4h4M5 7h4M5 10h2"/></svg>}
        />
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, icon, color }: {
  label: string; onClick: () => void; icon: React.ReactNode; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '6px 8px', borderRadius: RADIUS.sm,
        background: 'transparent', border: 'none',
        color: color || COLORS.textMuted, cursor: 'pointer',
        fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium,
        transition: 'all 0.15s', minWidth: 44,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {icon}
      {label}
    </button>
  );
}
