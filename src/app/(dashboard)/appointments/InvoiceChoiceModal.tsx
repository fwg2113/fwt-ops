'use client';

import { useState, useEffect, useRef } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';

export interface InvoiceResult {
  id: string;
  public_token: string;
  invoice_number: string;
}

interface Props {
  appointment: Appointment;
  anchorRect?: DOMRect | null;
  onCounterCheckout: (invoice: InvoiceResult) => void;
  onSendToCustomer: (invoice: InvoiceResult) => void;
  onClose: () => void;
}

// ============================================================================
// INVOICE CHOICE POPOVER
// Positioned near the Invoice button, not a full-screen modal
// ============================================================================
export default function InvoiceChoiceModal({ appointment, anchorRect, onCounterCheckout, onSendToCustomer, onClose }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  async function handleChoice(choice: 'counter' | 'remote') {
    setLoading(choice);
    setError(null);
    try {
      const res = await fetch('/api/auto/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: appointment.id, checkoutType: choice }),
      });
      const data = await res.json();
      if (data.invoice) {
        if (choice === 'counter') onCounterCheckout(data.invoice);
        else onSendToCustomer(data.invoice);
      } else {
        setError(data.error || 'Failed to create invoice');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(null);
    }
  }

  // Position: above the anchor (Invoice button) or center of screen if no anchor
  const style: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        bottom: window.innerHeight - anchorRect.top + 8,
        right: window.innerWidth - anchorRect.right,
        zIndex: 9999,
      }
    : {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
      };

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }} />

      {/* Popover */}
      <div ref={popoverRef} style={{
        ...style,
        width: 320,
        background: '#1d1d1d',
        borderRadius: RADIUS.xl,
        border: `1px solid ${COLORS.borderAccent}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: `${SPACING.md}px ${SPACING.lg}px`,
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
            Invoice
          </span>
          <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.red }}>
            ${Number(appointment.balance_due).toFixed(0)}
          </span>
        </div>

        {/* Options */}
        <div style={{ padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
          {/* Counter Checkout */}
          <button
            onClick={() => handleChoice('counter')}
            disabled={loading !== null}
            style={{
              padding: '14px 16px', borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderInput}`,
              background: COLORS.cardBg, cursor: loading ? 'wait' : 'pointer',
              textAlign: 'left', transition: 'all 0.15s',
              opacity: loading === 'counter' ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: SPACING.md,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: RADIUS.sm,
              background: `${COLORS.success}15`, border: `1px solid ${COLORS.success}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                {loading === 'counter' ? 'Loading...' : 'Counter Checkout'}
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                Review invoice with customer
              </div>
            </div>
          </button>

          {/* Send to Customer */}
          <button
            onClick={() => handleChoice('remote')}
            disabled={loading !== null}
            style={{
              padding: '14px 16px', borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderInput}`,
              background: COLORS.cardBg, cursor: loading ? 'wait' : 'pointer',
              textAlign: 'left', transition: 'all 0.15s',
              opacity: loading === 'remote' ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: SPACING.md,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: RADIUS.sm,
              background: '#3b82f615', border: '1px solid #3b82f630',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                {loading === 'remote' ? 'Loading...' : 'Send to Customer'}
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                Send link via SMS or email
              </div>
            </div>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 12px', margin: `0 ${SPACING.md}px ${SPACING.md}px`,
            borderRadius: RADIUS.sm, background: COLORS.dangerBg, color: COLORS.danger,
            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}
