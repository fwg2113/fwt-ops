'use client';

import { useState } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { Modal } from '@/app/components/dashboard';

// ============================================================================
// EDIT UPSELL MODAL (PIN-gated)
// Two-step flow: enter PIN, then enter new upsell amount + reason
// Always requires PIN per Joe's instruction.
// Only sets `documents.upsell_override` -- never touches starting_total,
// subtotal, or upsell_amount.
// ============================================================================

interface Props {
  documentId: string;
  customerName: string;
  autoUpsell: number;            // The auto-calculated value
  currentOverride: number | null; // null = no override active
  currentSubtotal: number;
  currentStartingTotal: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditUpsellModal({
  documentId, customerName, autoUpsell, currentOverride,
  currentSubtotal, currentStartingTotal, onClose, onSaved,
}: Props) {
  const isCurrentlyOverridden = currentOverride != null;
  const effectiveUpsell = currentOverride ?? autoUpsell;

  const [step, setStep] = useState<'pin' | 'edit'>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifierName, setVerifierName] = useState<string | null>(null);

  const [newUpsell, setNewUpsell] = useState(String(effectiveUpsell));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  async function handlePinSubmit() {
    if (!pin || pin.length < 3) {
      setPinError('Enter your PIN');
      return;
    }
    setVerifying(true);
    setPinError(null);
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, shopId: 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPinError('Invalid PIN');
        setVerifying(false);
        return;
      }
      const perms = data.rolePermissions || {};
      if (!perms.full_access && !perms.upsell_override) {
        setPinError('Your role is not allowed to override upsells');
        setVerifying(false);
        return;
      }
      setVerifierName(data.name);
      setStep('edit');
    } catch {
      setPinError('Verification failed -- try again');
    }
    setVerifying(false);
  }

  async function handleSave() {
    const upsellNum = parseFloat(newUpsell);
    if (isNaN(upsellNum) || upsellNum < 0) {
      setSaveError('Enter a valid upsell amount (>= 0)');
      return;
    }
    if (!reason.trim()) {
      setSaveError('Reason is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/upsell-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          new_upsell_amount: upsellNum,
          reason: reason.trim(),
          shopId: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || 'Save failed');
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setSaveError('Network error -- try again');
      setSaving(false);
    }
  }

  async function handleClearOverride() {
    if (!confirm('Clear the override and revert to the auto-calculated value?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/upsell-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true, shopId: 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || 'Failed to clear');
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setSaveError('Network error -- try again');
      setSaving(false);
    }
  }

  return (
    <Modal title="Override Upsell Amount" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
        {/* Customer context */}
        <div style={{
          padding: SPACING.md, background: COLORS.activeBg,
          borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderAccent}`,
        }}>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Customer
          </div>
          <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
            {customerName}
          </div>
          <div style={{ display: 'flex', gap: SPACING.lg, marginTop: SPACING.sm, fontSize: FONT.sizeXs, color: COLORS.textMuted, flexWrap: 'wrap' }}>
            <span>Original: <strong style={{ color: COLORS.textPrimary }}>{formatCurrency(currentStartingTotal)}</strong></span>
            <span>Final: <strong style={{ color: COLORS.textPrimary }}>{formatCurrency(currentSubtotal)}</strong></span>
            <span>Auto upsell: <strong style={{ color: '#22c55e' }}>{formatCurrency(autoUpsell)}</strong></span>
            {isCurrentlyOverridden && (
              <span>Current override: <strong style={{ color: '#f59e0b' }}>{formatCurrency(currentOverride!)}</strong></span>
            )}
          </div>
        </div>

        {step === 'pin' ? (
          <>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
              Enter your PIN to override the upsell amount on this invoice. The original booking and final services values are <strong>never modified</strong> -- only the upsell value used for commission is overridden. This action is logged.
            </div>
            <div>
              <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={e => { setPin(e.target.value); setPinError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit(); }}
                placeholder="Enter PIN"
                style={{
                  width: '100%', padding: '14px 16px', fontSize: '1.4rem',
                  letterSpacing: '4px', textAlign: 'center',
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${pinError ? '#ef4444' : COLORS.borderInput}`,
                  borderRadius: RADIUS.md, outline: 'none',
                }}
              />
              {pinError && (
                <div style={{ fontSize: FONT.sizeXs, color: '#ef4444', marginTop: 6 }}>{pinError}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button onClick={onClose} style={{
                flex: 1, padding: '12px 20px', borderRadius: RADIUS.md,
                background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                color: COLORS.textMuted, cursor: 'pointer', fontSize: FONT.sizeSm,
              }}>Cancel</button>
              <button onClick={handlePinSubmit} disabled={verifying || !pin} style={{
                flex: 2, padding: '12px 20px', borderRadius: RADIUS.md,
                background: verifying || !pin ? COLORS.borderInput : '#3b82f6',
                border: 'none', color: '#fff', cursor: verifying ? 'wait' : 'pointer',
                fontSize: FONT.sizeSm, fontWeight: 700,
              }}>{verifying ? 'Verifying...' : 'Continue'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: SPACING.sm, background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.3)', borderRadius: RADIUS.sm,
              fontSize: FONT.sizeXs, color: '#22c55e',
            }}>
              Verified as <strong>{verifierName}</strong>
            </div>
            <div>
              <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
                New Upsell Amount
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.2rem', color: COLORS.textMuted }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newUpsell}
                  onChange={e => { setNewUpsell(e.target.value); setSaveError(null); }}
                  autoFocus
                  style={{
                    flex: 1, padding: '12px 14px', fontSize: '1.2rem', fontWeight: 700,
                    background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                    outline: 'none', textAlign: 'right',
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
                Reason (required for audit log)
              </label>
              <textarea
                value={reason}
                onChange={e => { setReason(e.target.value); setSaveError(null); }}
                rows={3}
                placeholder="e.g. Customer booked wrong online, came in for usual job"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: FONT.sizeSm,
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                  outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4,
                }}
              />
            </div>
            {saveError && (
              <div style={{
                padding: SPACING.sm, borderRadius: RADIUS.sm,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: FONT.sizeXs,
              }}>{saveError}</div>
            )}
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button onClick={onClose} style={{
                flex: 1, padding: '12px 20px', borderRadius: RADIUS.md,
                background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                color: COLORS.textMuted, cursor: 'pointer', fontSize: FONT.sizeSm,
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, padding: '12px 20px', borderRadius: RADIUS.md,
                background: saving ? COLORS.borderInput : '#22c55e',
                border: 'none', color: '#fff', cursor: saving ? 'wait' : 'pointer',
                fontSize: FONT.sizeSm, fontWeight: 700,
              }}>{saving ? 'Saving...' : 'Save Override'}</button>
            </div>
            {isCurrentlyOverridden && (
              <button
                onClick={handleClearOverride}
                disabled={saving}
                style={{
                  width: '100%', padding: '8px', borderRadius: RADIUS.sm,
                  background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
                  color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: saving ? 'wait' : 'pointer',
                  marginTop: 4,
                }}
              >
                Clear override and revert to auto-calculated ({formatCurrency(autoUpsell)})
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
