'use client';

import { useState } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { Modal } from '@/app/components/dashboard';

interface TeamMember {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  customerName: string;
  appointmentTime: string;
  notes: string;
  address: string;
  mapsUrl: string;
  teamMembers: TeamMember[];
  assignedTeamMemberId: string | null;
  onClose: () => void;
}

export default function SendDirectionsModal({
  customerName, appointmentTime, notes, address, mapsUrl,
  teamMembers, assignedTeamMemberId, onClose,
}: Props) {
  // Pre-select assigned team member if they have a phone
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (assignedTeamMemberId) {
      const member = teamMembers.find(tm => tm.id === assignedTeamMemberId);
      if (member?.phone) initial.add(assignedTeamMemberId);
    }
    return initial;
  });
  const [customPhone, setCustomPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const membersWithPhone = teamMembers.filter(tm => tm.phone);

  // Build the message
  const noteText = notes.includes(':') ? notes.split(':').slice(1).join(':').trim() : notes;
  const message = [
    `Consultation for ${customerName} at ${appointmentTime}`,
    noteText ? `Notes: ${noteText}` : '',
    `Location: ${address}`,
    `Directions: ${mapsUrl}`,
  ].filter(Boolean).join('\n');

  function toggleMember(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    const phones: string[] = [];
    for (const id of selectedIds) {
      const member = teamMembers.find(tm => tm.id === id);
      if (member?.phone) phones.push(member.phone);
    }
    if (customPhone.trim()) {
      phones.push(customPhone.trim());
    }
    if (phones.length === 0) return;

    setSending(true);
    try {
      await Promise.all(phones.map(phone =>
        fetch('/api/auto/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, message }),
        })
      ));
      setSent(true);
      setTimeout(() => onClose(), 1500);
    } catch {
      setSending(false);
    }
  }

  const canSend = selectedIds.size > 0 || customPhone.trim().length >= 10;

  return (
    <Modal title="Send Directions" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
        {/* Message preview */}
        <div style={{
          background: COLORS.inputBg, borderRadius: RADIUS.sm,
          padding: SPACING.md, fontSize: FONT.sizeXs, color: COLORS.textMuted,
          lineHeight: 1.6, whiteSpace: 'pre-wrap',
          border: `1px solid ${COLORS.border}`,
        }}>
          {message}
        </div>

        {/* Team member selection */}
        {membersWithPhone.length > 0 && (
          <div>
            <div style={{
              fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm,
            }}>
              Send to Team Members
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {membersWithPhone.map(tm => {
                const isSelected = selectedIds.has(tm.id);
                return (
                  <button
                    key={tm.id}
                    onClick={() => toggleMember(tm.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      padding: '10px 14px', borderRadius: RADIUS.sm,
                      background: isSelected ? `${COLORS.info}15` : 'transparent',
                      border: `1px solid ${isSelected ? COLORS.info : COLORS.borderInput}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? COLORS.info : 'transparent',
                      border: `2px solid ${isSelected ? COLORS.info : COLORS.borderInput}`,
                    }}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>
                        {tm.name}
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                        {tm.phone}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom phone number */}
        <div>
          <div style={{
            fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm,
          }}>
            Additional Phone Number
          </div>
          <input
            type="tel"
            value={customPhone}
            onChange={e => setCustomPhone(e.target.value)}
            placeholder="(555) 555-5555"
            style={{
              width: '100%', padding: '12px 14px',
              background: COLORS.inputBg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
              fontSize: FONT.sizeSm, outline: 'none',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.sm }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: RADIUS.sm, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600,
          }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend || sending || sent}
            style={{
              padding: '10px 24px', borderRadius: RADIUS.sm, cursor: canSend && !sending ? 'pointer' : 'not-allowed',
              background: sent ? '#22c55e' : COLORS.info,
              border: 'none', color: '#fff', fontSize: FONT.sizeSm, fontWeight: 700,
              opacity: !canSend || sending ? 0.5 : 1,
            }}
          >
            {sent ? 'Sent!' : sending ? 'Sending...' : `Send to ${selectedIds.size + (customPhone.trim().length >= 10 ? 1 : 0)} recipient${(selectedIds.size + (customPhone.trim().length >= 10 ? 1 : 0)) !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
