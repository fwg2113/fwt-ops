'use client';

import { useState } from 'react';
import { Modal, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { substituteTemplate, buildTemplateContext } from '@/app/lib/template-vars';
import type { Appointment } from './AppointmentCard';

interface Props {
  appointment: Appointment;
  shopConfig: { shop_name: string; shop_phone: string; shop_address: string };
  defaultTemplateKey: string | null;
  templates: Record<string, string>;
  invoiceLink?: string | null;
  onClose: () => void;
}

export default function MessageModal({
  appointment, shopConfig, defaultTemplateKey, templates, invoiceLink, onClose,
}: Props) {
  const ctx = buildTemplateContext(appointment, shopConfig, invoiceLink);

  // Start with the default template if specified
  const templateKeys = Object.keys(templates);
  const initialKey = defaultTemplateKey && templates[defaultTemplateKey] ? defaultTemplateKey : templateKeys[0] || null;
  const initialMessage = initialKey ? substituteTemplate(templates[initialKey], ctx) : '';

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(initialKey);
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleTemplateSelect(key: string) {
    setSelectedTemplate(key);
    setMessage(substituteTemplate(templates[key], ctx));
    setResult(null);
  }

  async function handleSend(method: 'sms' | 'email') {
    if (!message.trim()) return;
    setSending(method);
    setResult(null);

    try {
      const res = await fetch('/api/auto/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: appointment.id,
          message: message.trim(),
          method,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ok: true, msg: `Sent via ${method.toUpperCase()}` });
      } else {
        setResult({ ok: false, msg: data.error || 'Send failed' });
      }
    } catch {
      setResult({ ok: false, msg: 'Network error' });
    } finally {
      setSending(null);
    }
  }

  const vehicleStr = [appointment.vehicle_year, appointment.vehicle_make, appointment.vehicle_model].filter(Boolean).join(' ');

  return (
    <Modal title="Send Message" onClose={onClose} width={480}>
      {/* Recipient info */}
      <div style={{
        display: 'flex', gap: SPACING.lg, marginBottom: SPACING.lg,
        padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md,
      }}>
        <div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>{appointment.customer_name}</div>
        </div>
        <div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle</div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{vehicleStr}</div>
        </div>
      </div>

      {/* Template selector */}
      {templateKeys.length > 0 && (
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Template
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {templateKeys.map(key => (
              <button
                key={key}
                onClick={() => handleTemplateSelect(key)}
                style={{
                  padding: '6px 14px', borderRadius: RADIUS.sm, cursor: 'pointer',
                  background: selectedTemplate === key ? COLORS.activeBg : COLORS.inputBg,
                  color: selectedTemplate === key ? COLORS.red : COLORS.textSecondary,
                  border: `1px solid ${selectedTemplate === key ? COLORS.red : COLORS.borderInput}`,
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                }}
              >
                {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message text area */}
      <div style={{ marginBottom: SPACING.md }}>
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Message
        </div>
        <textarea
          value={message}
          onChange={e => { setMessage(e.target.value); setSelectedTemplate(null); setResult(null); }}
          rows={4}
          style={{
            width: '100%', padding: SPACING.md, borderRadius: RADIUS.md,
            background: COLORS.inputBg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeSm,
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2, textAlign: 'right' }}>
          {message.length} characters
        </div>
      </div>

      {/* Result feedback */}
      {result && (
        <div style={{
          padding: '8px 12px', borderRadius: RADIUS.sm, marginBottom: SPACING.md,
          background: result.ok ? COLORS.successBg : COLORS.dangerBg,
          color: result.ok ? COLORS.success : COLORS.danger,
          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textAlign: 'center',
        }}>
          {result.msg}
        </div>
      )}

      {/* Send buttons */}
      <div style={{ display: 'flex', gap: SPACING.sm }}>
        <button
          onClick={() => handleSend('sms')}
          disabled={!appointment.customer_phone || sending !== null || !message.trim()}
          style={{
            flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none',
            background: appointment.customer_phone ? '#3b82f6' : COLORS.inputBg,
            color: appointment.customer_phone ? '#fff' : COLORS.textMuted,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            cursor: appointment.customer_phone ? 'pointer' : 'not-allowed',
            opacity: sending === 'sms' ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {sending === 'sms' ? 'Sending...' : 'Send SMS'}
        </button>
        <button
          onClick={() => handleSend('email')}
          disabled={!appointment.customer_email || sending !== null || !message.trim()}
          style={{
            flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none',
            background: appointment.customer_email ? '#8b5cf6' : COLORS.inputBg,
            color: appointment.customer_email ? '#fff' : COLORS.textMuted,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            cursor: appointment.customer_email ? 'pointer' : 'not-allowed',
            opacity: sending === 'email' ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {sending === 'email' ? 'Sending...' : 'Send Email'}
        </button>
      </div>
    </Modal>
  );
}
