'use client';

import { useState } from 'react';
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
  total_paid: number;
  discount_code: string | null;
  status: string;
  calendar_title: string | null;
  class_keys: string | null;
  booking_source: string;
  work_order_time: string | null;
  notes: string | null;
  module: string;
  linked_group_id: string | null;
  linked_slots?: Array<{ id: string; module: string; status: string; booking_id: string }>;
  assigned_team_member_id: string | null;
  assigned_team_member_name: string | null;
  assigned_team_member_ids: string[];
  assigned_team_member_names: string[];
  document_id: string | null;
}

export const MODULE_LABELS: Record<string, string> = {
  auto_tint: 'Window Tint',
  flat_glass: 'Flat Glass',
  detailing: 'Detailing',
  ceramic_coating: 'Ceramic Coating',
  ppf: 'PPF',
  wraps: 'Vehicle Wraps',
};

export const MODULE_COLORS: Record<string, string> = {
  auto_tint: '#3b82f6',
  flat_glass: '#8b5cf6',
  detailing: '#06b6d4',
  ceramic_coating: '#ec4899',
  ppf: '#14b8a6',
  wraps: '#f97316',
};

interface TeamMember {
  id: string;
  name: string;
  module_permissions: string[];
}

interface Props {
  appointment: Appointment;
  onEdit: (apt: Appointment) => void;
  onStatusChange: (id: string, status: string) => void;
  onAddLinkedSlot?: (apt: Appointment) => void;
  onAssignMulti?: (aptId: string, teamMemberIds: string[]) => void;
  teamMembers?: TeamMember[];
  teamAssignmentEnabled?: boolean;
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
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: '30m Heads-Up',
  headsup_60: '60m Heads-Up',
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

export default function AppointmentCard({ appointment: apt, onEdit, onStatusChange, onAddLinkedSlot, onAssignMulti, teamMembers, teamAssignmentEnabled }: Props) {
  const typeColor = TYPE_COLORS[apt.appointment_type] || '#6b7280';
  const serviceSummary = buildServiceSummary(apt.services_json);
  const [showLinked, setShowLinked] = useState(false);
  const [showAssignPopover, setShowAssignPopover] = useState(false);

  const showModuleBadge = apt.module !== 'auto_tint' || !!apt.linked_group_id;
  const moduleColor = MODULE_COLORS[apt.module] || '#6b7280';
  const moduleLabel = MODULE_LABELS[apt.module] || apt.module;
  const totalLinked = (apt.linked_slots?.length || 0) + 1;

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: COLORS.cardBg,
      borderRadius: RADIUS.xl,
      border: `1px solid ${COLORS.border}`,
      borderLeft: `4px solid ${typeColor}`,
      overflow: showAssignPopover ? 'visible' : 'hidden',
      transition: 'border-color 0.15s',
      position: 'relative',
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
        {/* Top row: vehicle + module badge + link indicator + status */}
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
          {showModuleBadge && (
            <span style={{
              fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
              color: moduleColor, background: `${moduleColor}18`,
              border: `1px solid ${moduleColor}35`,
              padding: '2px 8px', borderRadius: RADIUS.sm,
              whiteSpace: 'nowrap',
            }}>
              {moduleLabel}
            </span>
          )}
          {apt.linked_group_id && (
            <span
              onClick={() => setShowLinked(!showLinked)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium,
                color: COLORS.textMuted, cursor: 'pointer',
                padding: '2px 6px', borderRadius: RADIUS.sm,
                background: showLinked ? COLORS.hoverBg : 'transparent',
                transition: 'background 0.15s',
              }}
              title="Linked appointment group"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
                <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
              </svg>
              1 of {totalLinked}
            </span>
          )}
          <StatusBadge label={apt.status} variant={STATUS_VARIANTS[apt.status] || 'neutral'} />
          {apt.discount_code && (
            <StatusBadge label={apt.discount_code} variant="red" />
          )}
        </div>

        {/* Linked slots preview */}
        {showLinked && apt.linked_slots && apt.linked_slots.length > 0 && (
          <div style={{
            marginBottom: 6, padding: '6px 10px',
            background: COLORS.hoverBg, borderRadius: RADIUS.sm,
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{
              fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
              color: COLORS.textMuted, marginBottom: 4,
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              Linked Slots
            </div>
            {apt.linked_slots.map(slot => {
              const slotModuleColor = MODULE_COLORS[slot.module] || '#6b7280';
              return (
                <div key={slot.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: FONT.sizeXs, color: COLORS.textTertiary,
                  padding: '2px 0',
                }}>
                  <span style={{
                    color: slotModuleColor, fontWeight: FONT.weightSemibold,
                  }}>
                    {MODULE_LABELS[slot.module] || slot.module}
                  </span>
                  <span>#{slot.booking_id}</span>
                  <StatusBadge label={slot.status} variant={STATUS_VARIANTS[slot.status] || 'neutral'} />
                </div>
              );
            })}
            {onAddLinkedSlot && (
              <button
                onClick={e => { e.stopPropagation(); onAddLinkedSlot(apt); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  marginTop: 4, padding: '3px 8px', borderRadius: RADIUS.sm,
                  background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
                  color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Linked Slot
              </button>
            )}
          </div>
        )}

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
          {teamAssignmentEnabled && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowAssignPopover(!showAssignPopover); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: FONT.sizeXs,
                color: (apt.assigned_team_member_names?.length > 0) ? COLORS.textTertiary : COLORS.textPlaceholder,
                cursor: 'pointer', position: 'relative',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="5" r="3" />
                <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
              </svg>
              {apt.assigned_team_member_names?.length > 0
                ? apt.assigned_team_member_names.join(', ')
                : 'Assign'}
            </span>
          )}
          {apt.customer_phone && <span>{formatPhone(apt.customer_phone)}</span>}
          {/* Two-number price display:
              - Final Total (left): the actual amount the customer paid (paid
                rows) or the estimated all-in (unpaid rows). For paid rows uses
                total_paid which already includes the deposit. For unpaid rows
                uses subtotal as a menu-price estimate.
              - Balance Due (right): what's still owed at the door. Always 0 for
                paid rows. */}
          {(() => {
            const isPaid = apt.status === 'invoiced';
            const finalTotal = isPaid
              ? Number(apt.total_paid || 0)
              : Number(apt.subtotal || 0);
            const balanceDue = Number(apt.balance_due || 0);
            return (
              <>
                <span style={{ color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
                  ${finalTotal.toFixed(0)}
                </span>
                {!isPaid && balanceDue > 0 && (
                  <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
                    bal ${balanceDue.toFixed(0)}
                  </span>
                )}
              </>
            );
          })()}
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

      {/* Team Assignment Popover */}
      {showAssignPopover && teamMembers && onAssignMulti && (
        <>
          <div onClick={() => setShowAssignPopover(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'absolute', top: '100%', left: SPACING.md, zIndex: 9999,
            marginTop: 4, minWidth: 200, maxHeight: 280, overflowY: 'auto',
            background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: `${SPACING.xs}px 0`,
          }}>
            <div style={{ padding: `${SPACING.xs}px ${SPACING.md}px`, fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightSemibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Assign Team
            </div>
            {/* Sort: module-matching members first */}
            {[...teamMembers]
              .sort((a, b) => {
                const aMatch = a.module_permissions.includes(apt.module) ? 0 : 1;
                const bMatch = b.module_permissions.includes(apt.module) ? 0 : 1;
                return aMatch - bMatch || a.name.localeCompare(b.name);
              })
              .map(tm => {
                const isAssigned = (apt.assigned_team_member_ids || []).includes(tm.id);
                const hasModule = tm.module_permissions.includes(apt.module);
                return (
                  <button
                    key={tm.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      const current = apt.assigned_team_member_ids || [];
                      const updated = isAssigned
                        ? current.filter((id: string) => id !== tm.id)
                        : [...current, tm.id];
                      onAssignMulti(apt.id, updated);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm, width: '100%',
                      padding: `${SPACING.sm}px ${SPACING.md}px`, background: 'none', border: 'none',
                      cursor: 'pointer', color: COLORS.textPrimary, fontSize: FONT.sizeSm,
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${isAssigned ? COLORS.success : COLORS.borderInput}`,
                      background: isAssigned ? COLORS.success : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isAssigned && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M2 5l2 2 4-4"/></svg>}
                    </div>
                    <span>{tm.name}</span>
                    {!hasModule && (
                      <span style={{ fontSize: '9px', color: COLORS.textPlaceholder, marginLeft: 'auto' }}>other dept</span>
                    )}
                  </button>
                );
              })}
            <div style={{ padding: `${SPACING.xs}px ${SPACING.md}px`, borderTop: `1px solid ${COLORS.border}`, marginTop: SPACING.xs }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowAssignPopover(false); }}
                style={{
                  width: '100%', padding: `${SPACING.xs}px`, background: 'none', border: 'none',
                  cursor: 'pointer', color: COLORS.textMuted, fontSize: FONT.sizeXs, textAlign: 'center',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
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
