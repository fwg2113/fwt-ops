'use client';

import { FONT } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';

// ============================================================================
// TYPES — matches the action_buttons_config JSONB schema
// ============================================================================
export interface ActionButtonConfig {
  key: string;
  enabled: boolean;
  label: string;
  clickedLabel: string;
  defaultColor: string;
  clickedColor: string;
  behavior: 'edit_modal' | 'status_change' | 'message_modal' | 'invoice_modal' | 'headsup_send';
  statusTarget: string | null;
  messageTemplate: string | null;
  showWhen: {
    status_in?: string[];
    appointment_type_in?: string[];
  } | null;
}

export interface ActionButtonsConfig {
  buttons: ActionButtonConfig[];
}

// ============================================================================
// CONFIGURABLE ACTIONS
// Renders action buttons based on shop_config.action_buttons_config
// Replaces the hardcoded button block in TimelineView
// ============================================================================
interface Props {
  appointment: Appointment;
  buttonsConfig: ActionButtonConfig[];
  actioned: Set<string>;
  onAction: (buttonKey: string, appointment: Appointment, anchorRect?: DOMRect) => void;
  compact?: boolean;
}

// Consultation-specific button config
const CONSULTATION_BUTTONS: ActionButtonConfig[] = [
  { key: 'edit', enabled: true, label: 'Edit', clickedLabel: 'Edit', defaultColor: '#6b7280', clickedColor: '#6b7280', behavior: 'edit_modal', statusTarget: null, messageTemplate: null, showWhen: null },
  { key: 'message', enabled: true, label: 'Message', clickedLabel: 'Sent', defaultColor: '#3b82f6', clickedColor: '#22c55e', behavior: 'message_modal', statusTarget: null, messageTemplate: 'consultation_onway', showWhen: null },
  { key: 'complete', enabled: true, label: 'Complete', clickedLabel: 'Done', defaultColor: '#6b7280', clickedColor: '#22c55e', behavior: 'status_change', statusTarget: 'completed', messageTemplate: null, showWhen: { status_in: ['booked', 'in_progress'] } },
  { key: 'undo', enabled: true, label: 'Undo', clickedLabel: 'Undo', defaultColor: '#6b7280', clickedColor: '#6b7280', behavior: 'status_change', statusTarget: 'booked', messageTemplate: null, showWhen: { status_in: ['completed'] } },
];

export default function ConfigurableActions({ appointment, buttonsConfig, actioned, onAction, compact }: Props) {
  // Use consultation-specific buttons for consultation appointments
  const isConsultation = appointment.appointment_type === 'consultation';
  const effectiveButtons = isConsultation ? CONSULTATION_BUTTONS : buttonsConfig;

  // For linked appointments: check if all siblings are complete
  const linkedSlots = appointment.linked_slots;
  const isLinked = !!appointment.linked_group_id && linkedSlots && linkedSlots.length > 0;
  const allLinkedComplete = isLinked
    ? linkedSlots.every(s => s.status === 'completed' || s.status === 'invoiced') &&
      (appointment.status === 'completed' || appointment.status === 'invoiced')
    : true;

  return (
    <>
      {effectiveButtons.map(btn => {
        if (!btn.enabled) return null;

        // Evaluate showWhen rules
        if (btn.showWhen) {
          if (btn.showWhen.status_in && !btn.showWhen.status_in.includes(appointment.status)) {
            return null;
          }
          if (btn.showWhen.appointment_type_in && !btn.showWhen.appointment_type_in.includes(appointment.appointment_type)) {
            return null;
          }
        }

        // For linked appointments: gate "vehicle_ready" message until all slots are complete
        const isReadyMessage = btn.behavior === 'message_modal' && btn.messageTemplate === 'vehicle_ready';
        const linkedNotReady = isLinked && isReadyMessage && !allLinkedComplete;

        const isClicked = actioned.has(btn.key);
        const color = linkedNotReady ? '#6b7280' : (isClicked ? btn.clickedColor : btn.defaultColor);
        const label = linkedNotReady
          ? `${btn.label} (waiting on ${linkedSlots.filter(s => s.status !== 'completed' && s.status !== 'invoiced').length + (appointment.status !== 'completed' && appointment.status !== 'invoiced' ? 1 : 0)} slot${linkedSlots.filter(s => s.status !== 'completed' && s.status !== 'invoiced').length !== 0 ? 's' : ''})`
          : (isClicked ? btn.clickedLabel : btn.label);

        return (
          <button
            key={btn.key}
            onClick={e => { e.stopPropagation(); e.preventDefault(); if (!linkedNotReady) onAction(btn.key, appointment, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
            onMouseDown={e => e.stopPropagation()}
            disabled={linkedNotReady}
            title={linkedNotReady ? 'All linked service slots must be completed first' : undefined}
            style={{
              padding: compact ? '2px 6px' : '3px 10px',
              borderRadius: 4, cursor: linkedNotReady ? 'not-allowed' : 'pointer',
              background: isClicked ? `${color}50` : 'rgba(0,0,0,0.35)',
              border: `1px solid ${isClicked ? color : 'rgba(255,255,255,0.2)'}`,
              color: isClicked ? color : 'rgba(255,255,255,0.85)',
              fontSize: compact ? '0.55rem' : FONT.sizeXs,
              fontWeight: 600,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
              opacity: linkedNotReady ? 0.5 : 1,
            }}
          >
            {linkedNotReady ? btn.label : label}
          </button>
        );
      })}
    </>
  );
}

// ============================================================================
// DEFAULT CONFIG — FWT flow, used as fallback if shop_config not loaded yet
// ============================================================================
export const DEFAULT_BUTTONS_CONFIG: ActionButtonConfig[] = [
  { key: 'edit', enabled: true, label: 'Edit', clickedLabel: 'Edit', defaultColor: '#6b7280', clickedColor: '#6b7280', behavior: 'edit_modal', statusTarget: null, messageTemplate: null, showWhen: null },
  { key: 'headsup', enabled: true, label: 'Send Heads-Up', clickedLabel: 'Sent', defaultColor: '#f59e0b', clickedColor: '#22c55e', behavior: 'headsup_send', statusTarget: null, messageTemplate: null, showWhen: { appointment_type_in: ['headsup_30', 'headsup_60'] } },
  { key: 'checkin', enabled: true, label: 'Check In', clickedLabel: 'Checked In', defaultColor: '#6b7280', clickedColor: '#22c55e', behavior: 'status_change', statusTarget: 'in_progress', messageTemplate: null, showWhen: { status_in: ['booked'] } },
  { key: 'undo_checkin', enabled: true, label: 'Undo', clickedLabel: 'Undo', defaultColor: '#6b7280', clickedColor: '#6b7280', behavior: 'status_change', statusTarget: 'booked', messageTemplate: null, showWhen: { status_in: ['in_progress'] } },
  { key: 'message', enabled: true, label: 'Message', clickedLabel: 'Messaged', defaultColor: '#3b82f6', clickedColor: '#22c55e', behavior: 'message_modal', statusTarget: null, messageTemplate: 'vehicle_ready', showWhen: null },
  { key: 'invoice', enabled: true, label: 'Invoice', clickedLabel: 'Invoiced', defaultColor: '#eab308', clickedColor: '#22c55e', behavior: 'invoice_modal', statusTarget: null, messageTemplate: null, showWhen: null },
];
