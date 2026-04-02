'use client';

import { useState, useMemo } from 'react';
import { Modal, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, FONT, SPACING, RADIUS } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';

interface Props {
  appointment: Appointment;
  teamMembers: Array<{ id: string; name: string; phone: string | null; module_permissions: string[] }>;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function EditConsultationModal({ appointment, teamMembers, onSave, onClose }: Props) {
  // Reschedule
  const [date, setDate] = useState(appointment.appointment_date || '');
  const [time, setTime] = useState(appointment.appointment_time || '');
  const [apptType, setApptType] = useState(appointment.appointment_type);

  // Customer info
  const [customerName, setCustomerName] = useState(appointment.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(appointment.customer_phone || '');
  const [customerEmail, setCustomerEmail] = useState(appointment.customer_email || '');

  // Parse location from notes
  const existingNotes = appointment.notes || '';
  const locationMatch = existingNotes.match(/^Location:\s*(.+?)(?:\n|$)/m);
  const hasLocation = !!locationMatch;
  const [address, setAddress] = useState(locationMatch ? locationMatch[1].trim() : '');

  // Strip location line from notes for editing
  const notesWithoutLocation = existingNotes.replace(/^Location:\s*.+?(?:\n|$)/m, '').trim();
  const [notes, setNotes] = useState(notesWithoutLocation);

  // Service description
  const initialDescription = (() => {
    if (Array.isArray(appointment.services_json) && appointment.services_json.length > 0) {
      const first = appointment.services_json[0] as { label?: string };
      if (first?.label) return first.label;
    }
    return appointment.calendar_title || '';
  })();
  const [description, setDescription] = useState(initialDescription);

  // Team member
  const [assignedTeamMemberId, setAssignedTeamMemberId] = useState(appointment.assigned_team_member_id || '');

  const [saving, setSaving] = useState(false);

  // Time slots: 30-min increments 7AM-6PM
  const timeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [];
    for (let h = 7; h <= 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
        slots.push({ value: hour24, label });
      }
    }
    return slots;
  }, []);

  const apptTypeOptions = [
    { value: 'consultation', label: 'Consultation' },
    { value: 'off_site', label: 'Off-Site' },
  ];

  async function handleSave() {
    setSaving(true);

    const updates: Record<string, unknown> = {};

    // Reschedule fields
    if (date !== appointment.appointment_date) updates.appointment_date = date;
    if (time !== (appointment.appointment_time || '')) updates.appointment_time = time || null;
    if (apptType !== appointment.appointment_type) updates.appointment_type = apptType;

    // Customer info
    if (customerName !== appointment.customer_name) updates.customer_name = customerName;
    if (customerPhone !== (appointment.customer_phone || '')) updates.customer_phone = customerPhone || null;
    if (customerEmail !== (appointment.customer_email || '')) updates.customer_email = customerEmail || null;

    // Rebuild notes with location prefix
    let rebuiltNotes = '';
    if (hasLocation || address) {
      if (address.trim()) {
        rebuiltNotes = `Location: ${address.trim()}`;
        if (notes.trim()) rebuiltNotes += '\n' + notes.trim();
      } else {
        rebuiltNotes = notes.trim();
      }
    } else {
      rebuiltNotes = notes.trim();
    }
    updates.notes = rebuiltNotes || null;

    // Service description -> calendar_title + services_json
    if (description !== initialDescription) {
      updates.calendar_title = description || null;
      if (Array.isArray(appointment.services_json) && appointment.services_json.length > 0) {
        const updated = [...appointment.services_json] as Record<string, unknown>[];
        updated[0] = { ...updated[0], label: description };
        updates.services_json = updated;
      } else {
        updates.services_json = [{ label: description, serviceKey: 'consultation', price: 0, duration: 30 }];
      }
    }

    // Team member
    if (assignedTeamMemberId !== (appointment.assigned_team_member_id || '')) {
      updates.assigned_team_member_id = assignedTeamMemberId || null;
    }

    await onSave(appointment.id, updates);
    setSaving(false);
  }

  return (
    <Modal
      title="Edit Consultation"
      onClose={onClose}
      width={500}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      {/* Reschedule */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>Schedule</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <FormField label="Date">
            <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} />
          </FormField>
          <FormField label="Time">
            <SelectInput value={time} onChange={e => setTime(e.target.value)}>
              <option value="">No time set</option>
              {timeSlots.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </SelectInput>
          </FormField>
        </div>
        <FormField label="Type">
          <SelectInput value={apptType} onChange={e => setApptType(e.target.value)}>
            {apptTypeOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectInput>
        </FormField>
      </div>

      {/* Customer Info */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>Customer</SectionLabel>
        <FormField label="Name" required>
          <TextInput value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <FormField label="Phone">
            <TextInput type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone number" />
          </FormField>
          <FormField label="Email">
            <TextInput type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email address" />
          </FormField>
        </div>
      </div>

      {/* Location/Address — only shown if notes had Location: */}
      {hasLocation && (
        <div style={{
          padding: SPACING.lg, marginBottom: SPACING.lg,
          background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
          border: `1px solid ${COLORS.border}`,
        }}>
          <SectionLabel>Location</SectionLabel>
          <FormField label="Address">
            <TextInput value={address} onChange={e => setAddress(e.target.value)} placeholder="Address or location" />
          </FormField>
        </div>
      )}

      {/* Service Description */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>Service</SectionLabel>
        <FormField label="Description">
          <TextInput value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this consultation for?" />
        </FormField>
      </div>

      {/* Assigned Team Member */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>Assignment</SectionLabel>
        <FormField label="Team Member">
          <SelectInput value={assignedTeamMemberId} onChange={e => setAssignedTeamMemberId(e.target.value)}>
            <option value="">Unassigned</option>
            {teamMembers.map(tm => (
              <option key={tm.id} value={tm.id}>{tm.name}</option>
            ))}
          </SelectInput>
        </FormField>
      </div>

      {/* Notes */}
      <div style={{
        padding: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Additional notes..."
          rows={3}
          style={{
            width: '100%',
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            background: COLORS.inputBg,
            color: COLORS.textPrimary,
            border: `1px solid ${COLORS.borderInput}`,
            borderRadius: RADIUS.md,
            fontSize: FONT.sizeBase,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            minHeight: 80,
          }}
        />
      </div>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
      textTransform: 'uppercase', letterSpacing: '1px',
      color: COLORS.textMuted, marginBottom: SPACING.md,
    }}>
      {children}
    </div>
  );
}
