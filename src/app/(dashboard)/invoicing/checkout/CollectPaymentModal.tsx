'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { Modal } from '@/app/components/dashboard';
import { useIsMobile } from '@/app/hooks/useIsMobile';

// ============================================================================
// COLLECT PAYMENT MODAL
// Multi-method payment collection with split support, fee/discount calculation.
// Replaces the old single-click payment buttons.
// ============================================================================

interface PaymentLine {
  id: string;
  method: string;
  label: string;
  amount: string;
  processor: string;
  color: string;
}

interface Props {
  documentId: string;
  balanceDue: number;
  ccFeePercent: number;
  ccFeeFlat: number;
  checkoutDiscountTotal: number;
  warrantyAmount: number;       // NFW or other warranty add-on amount (counts toward upsell)
  baseSubtotal: number;          // The current document.subtotal (without warranty)
  startingTotal: number;         // The original booking total (for upsell recalc)
  tipAmount: number;
  discountNote: string | null;
  appliedDiscounts: unknown;
  appliedWarranty: unknown;
  terminalDeviceId?: string | null;
  onPaymentComplete: (payments: Array<{ method: string; amount: number }>) => void;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', color: '#22c55e', processor: 'cash', icon: 'M' },
  // 'cc' = Credit Card recorded manually (no SDK call). Used by shops that
  // process cards through Zettle, PayPal, Clover, or any non-Square reader.
  // Always visible regardless of whether a Square Terminal is paired.
  { key: 'cc', label: 'Credit Card', color: '#3b82f6', processor: 'manual', icon: 'C' },
  // 'square_terminal' = sends the charge to a paired Square Terminal device.
  // Only visible when terminalDeviceId is set (see filter below).
  { key: 'square_terminal', label: 'Card Reader', color: '#3b82f6', processor: 'square_terminal', icon: 'T' },
  { key: 'venmo', label: 'Venmo', color: '#8b5cf6', processor: 'manual', icon: 'V' },
  { key: 'zelle', label: 'Zelle', color: '#8b5cf6', processor: 'manual', icon: 'Z' },
  { key: 'cashapp', label: 'CashApp', color: '#22c55e', processor: 'manual', icon: '$' },
  { key: 'applepay', label: 'Apple Pay', color: '#1a1a1a', processor: 'manual', icon: 'A' },
  { key: 'apple_cash', label: 'Apple Cash', color: '#1a1a1a', processor: 'manual', icon: 'A' },
  { key: 'check', label: 'Check', color: '#6b7280', processor: 'manual', icon: 'K' },
  // Gift Certificate redemption recorded as a payment, not a discount —
  // because the customer paid for the GC originally with cash. Treating it
  // as a payment keeps the total_paid on the invoice equal to the value of
  // services rendered, matching the cashier's mental model.
  { key: 'gift_certificate', label: 'Gift Certificate', color: '#a855f7', processor: 'manual', icon: 'G' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

let lineIdCounter = 0;

export default function CollectPaymentModal({
  documentId, balanceDue, ccFeePercent, ccFeeFlat, checkoutDiscountTotal,
  warrantyAmount, baseSubtotal, startingTotal,
  tipAmount, discountNote, appliedDiscounts, appliedWarranty,
  terminalDeviceId,
  onPaymentComplete, onClose,
}: Props) {
  const isMobile = useIsMobile();
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Terminal checkout state
  const [terminalStatus, setTerminalStatus] = useState<'idle' | 'sending' | 'waiting' | 'completed' | 'failed'>('idle');
  const [terminalCheckoutId, setTerminalCheckoutId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll terminal checkout status
  const pollTerminalStatus = useCallback((checkoutId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/square/terminal?checkoutId=${checkoutId}`);
        const data = await res.json();
        if (data.status === 'COMPLETED') {
          setTerminalStatus('completed');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        } else if (data.status === 'CANCELED' || data.status === 'CANCEL_REQUESTED') {
          setTerminalStatus('failed');
          setError('Payment was cancelled on the terminal');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
        // PENDING and IN_PROGRESS: keep polling
      } catch {
        // Network error, keep polling
      }
    }, 2000);
  }, []);

  // Calculate totals with CC fees per line (cash discounts are handled via checkout discount checkbox)
  const lineDetails = useMemo(() => {
    return lines.map(line => {
      const amount = parseFloat(line.amount) || 0;
      let adjustedAmount = amount;
      let feeOrDiscount = 0;
      let feeLabel = '';

      if ((line.method === 'cc' || line.method === 'square_terminal') && (ccFeePercent > 0 || ccFeeFlat > 0)) {
        feeOrDiscount = Math.round((amount * (ccFeePercent / 100) + ccFeeFlat) * 100) / 100;
        feeLabel = `CC fee: ${formatCurrency(feeOrDiscount)}`;
        adjustedAmount = amount + feeOrDiscount;
      }

      return { ...line, parsedAmount: amount, adjustedAmount, feeOrDiscount, feeLabel };
    });
  }, [lines, ccFeePercent, ccFeeFlat]);

  const totalEntered = lineDetails.reduce((sum, l) => sum + l.parsedAmount, 0);
  const totalWithFees = lineDetails.reduce((sum, l) => sum + l.adjustedAmount, 0);
  const remaining = balanceDue - totalEntered;
  const isFullyCovered = remaining <= 0.01; // float tolerance

  function addMethod(methodKey: string) {
    const method = PAYMENT_METHODS.find(m => m.key === methodKey);
    if (!method) return;

    // Default amount: remaining balance (or full balance if first line)
    const defaultAmount = lines.length === 0 ? balanceDue : Math.max(0, remaining);

    setLines(prev => [...prev, {
      id: `pay-${++lineIdCounter}`,
      method: method.key,
      label: method.label,
      amount: defaultAmount > 0 ? defaultAmount.toFixed(2) : '',
      processor: method.processor,
      color: method.color,
    }]);
  }

  function updateLineAmount(id: string, amount: string) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, amount } : l));
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  async function handleConfirm() {
    if (!isFullyCovered || processing) return;
    setProcessing(true);
    setError(null);

    try {
      const payments: Array<{ method: string; amount: number }> = [];

      // Persist checkout discounts, tip, warranty to the document BEFORE recording payments
      // - subtotal MUST include warranty (NFW) so it counts toward upsell commission
      // - subtotal must NOT include discounts (those are payment-side, never affect commission)
      // - upsell auto-recalcs from the new subtotal
      {
        const newSubtotal = baseSubtotal + warrantyAmount;
        const newUpsell = startingTotal > 0 ? Math.max(0, newSubtotal - startingTotal) : 0;
        const patchBody: Record<string, unknown> = {
          id: documentId,
          subtotal: newSubtotal,
          upsell_amount: newUpsell,
          tip_amount: tipAmount,
          discount_note: discountNote || null,
          applied_discounts: appliedDiscounts || null,
          applied_warranty: appliedWarranty || null,
        };

        if (checkoutDiscountTotal > 0) {
          patchBody.discount_amount = checkoutDiscountTotal;
          patchBody.balance_due = balanceDue;
        }

        await fetch('/api/auto/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
      }

      // Check if any line uses Square Terminal
      const terminalLine = lineDetails.find(l => (l.method === 'square_terminal' || l.method === 'cc') && l.processor === 'square_terminal' && l.parsedAmount > 0);

      // Process Terminal payment first (if any)
      if (terminalLine && terminalDeviceId) {
        setTerminalStatus('sending');
        const termRes = await fetch('/api/square/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: terminalLine.adjustedAmount, // Amount including CC fee
            deviceId: terminalDeviceId,
            note: `Invoice payment`,
            documentId,
          }),
        });

        if (!termRes.ok) {
          const data = await termRes.json();
          throw new Error(data.error || 'Failed to send to terminal');
        }

        const termData = await termRes.json();
        setTerminalCheckoutId(termData.checkoutId);
        setTerminalStatus('waiting');

        // Start polling -- wait for completion before continuing
        await new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          const maxWait = 5 * 60 * 1000; // 5 minutes timeout

          pollIntervalRef.current = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/square/terminal?checkoutId=${termData.checkoutId}`);
              const statusData = await statusRes.json();

              if (statusData.status === 'COMPLETED') {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setTerminalStatus('completed');
                resolve();
              } else if (statusData.status === 'CANCELED' || statusData.status === 'CANCEL_REQUESTED') {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                reject(new Error('Payment cancelled on terminal'));
              } else if (Date.now() - startTime > maxWait) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                reject(new Error('Terminal payment timed out'));
              }
            } catch {
              // Network error, keep polling
            }
          }, 2000);
        });

        // Terminal payment completed -- record it
        const res = await fetch(`/api/documents/${documentId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: terminalLine.parsedAmount,
            payment_method: 'cc',
            processor: 'square_terminal',
            processing_fee: terminalLine.feeOrDiscount > 0 ? terminalLine.feeOrDiscount : 0,
            notes: `Square Terminal checkout ${termData.checkoutId}`,
          }),
        });
        if (!res.ok) throw new Error('Failed to record terminal payment');
        payments.push({ method: 'cc', amount: terminalLine.parsedAmount });
      }

      // Process all other (non-terminal) payment lines
      for (const detail of lineDetails) {
        if (detail.parsedAmount <= 0) continue;
        // Skip terminal line (already processed above)
        if (terminalLine && detail.id === terminalLine.id) continue;

        const res = await fetch(`/api/documents/${documentId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: detail.parsedAmount,
            payment_method: detail.method,
            processor: detail.processor,
            processing_fee: detail.feeOrDiscount > 0 ? detail.feeOrDiscount : 0,
            notes: detail.feeLabel || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Payment failed');
        }

        payments.push({ method: detail.method, amount: detail.parsedAmount });
      }

      onPaymentComplete(payments);
    } catch (err) {
      setTerminalStatus('failed');
      setError(err instanceof Error ? err.message : 'Payment failed');
      setProcessing(false);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }

  return (
    <Modal title="Collect Payment" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>

        {/* Balance summary */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: SPACING.md, borderRadius: RADIUS.md,
          background: COLORS.activeBg, border: `1px solid ${COLORS.borderAccent}`,
        }}>
          <div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance Due</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COLORS.red }}>{formatCurrency(balanceDue)}</div>
          </div>
          {tipAmount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Tip</div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>+{formatCurrency(tipAmount)}</div>
            </div>
          )}
        </div>

        {/* Payment lines */}
        {lines.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
            {lineDetails.map(line => (
              <div key={line.id} style={{
                padding: SPACING.md, borderRadius: RADIUS.md,
                border: `1px solid ${line.color}30`, background: `${line.color}08`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: `${line.color}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: FONT.sizeXs, fontWeight: 800, color: line.color, flexShrink: 0,
                  }}>
                    {PAYMENT_METHODS.find(m => m.key === line.method)?.icon || '?'}
                  </div>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary, flex: 1 }}>
                    {line.label}
                  </span>
                  <button onClick={() => removeLine(line.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                  <span style={{ fontSize: FONT.sizeLg, color: COLORS.textMuted }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={line.amount}
                    onChange={e => updateLineAmount(line.id, e.target.value)}
                    style={{
                      flex: 1, padding: '12px 14px', fontSize: '1.2rem', fontWeight: 700,
                      background: COLORS.inputBg, color: COLORS.textPrimary,
                      border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                      outline: 'none', textAlign: 'right',
                    }}
                  />
                </div>
                {line.feeLabel && (
                  <div style={{
                    fontSize: FONT.sizeXs, color: line.feeOrDiscount < 0 ? '#22c55e' : COLORS.textMuted,
                    marginTop: 4, textAlign: 'right',
                  }}>
                    {line.feeLabel}
                    {line.feeOrDiscount !== 0 && (
                      <span style={{ marginLeft: 6, fontWeight: 600 }}>
                        Customer pays: {formatCurrency(line.adjustedAmount)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Running total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              borderTop: `1px solid ${COLORS.border}`,
            }}>
              <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                {isFullyCovered ? 'Fully covered' : `Remaining: ${formatCurrency(remaining)}`}
              </span>
              <span style={{
                fontSize: FONT.sizeSm, fontWeight: 700,
                color: isFullyCovered ? '#22c55e' : COLORS.red,
              }}>
                {formatCurrency(totalEntered)} / {formatCurrency(balanceDue)}
              </span>
            </div>
          </div>
        )}

        {/* Add payment method */}
        <div>
          <div style={{
            fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm,
          }}>
            {lines.length === 0 ? 'Select Payment Method' : 'Add Another Method'}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: 8,
          }}>
            {PAYMENT_METHODS.filter(m => {
              // Only show Card Reader if a terminal device is paired
              if (m.key === 'square_terminal' && !terminalDeviceId) return false;
              // 'cc' (manual Credit Card) is always shown — covers Zettle/PayPal/
              // any non-Square reader, plus the historic backfill use case where
              // we record the payment without re-running the card.
              return true;
            }).map(method => (
              <button
                key={method.key}
                onClick={() => addMethod(method.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                  background: COLORS.inputBg,
                  border: `1px solid ${COLORS.borderInput}`,
                  color: COLORS.textPrimary, fontSize: FONT.sizeSm, fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', background: `${method.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 800, color: method.color, flexShrink: 0,
                }}>
                  {method.icon}
                </span>
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Terminal waiting state */}
        {(terminalStatus === 'sending' || terminalStatus === 'waiting') && (
          <div style={{
            padding: SPACING.lg, borderRadius: RADIUS.md, textAlign: 'center',
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
              background: 'rgba(59,130,246,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
                animation: 'spin 2s linear infinite',
              }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
            <div style={{ fontSize: FONT.sizeBase, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>
              {terminalStatus === 'sending' ? 'Sending to terminal...' : 'Waiting for customer...'}
            </div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              {terminalStatus === 'waiting' ? 'Customer should tap, insert, or swipe their card on the terminal' : 'Connecting to Square Terminal'}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Terminal completed */}
        {terminalStatus === 'completed' && (
          <div style={{
            padding: SPACING.md, borderRadius: RADIUS.md, textAlign: 'center',
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
          }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: '#22c55e' }}>
              Card payment approved
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: SPACING.md, borderRadius: RADIUS.sm,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', fontSize: FONT.sizeSm,
          }}>
            {error}
          </div>
        )}

        {/* Confirm */}
        <div style={{ display: 'flex', gap: SPACING.sm }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '14px 20px', borderRadius: RADIUS.md, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600,
          }}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isFullyCovered || processing || lines.length === 0}
            style={{
              flex: 2, padding: '14px 20px', borderRadius: RADIUS.md,
              cursor: isFullyCovered && !processing ? 'pointer' : 'not-allowed',
              background: isFullyCovered ? '#22c55e' : COLORS.borderInput,
              border: 'none', color: '#fff', fontSize: FONT.sizeSm, fontWeight: 700,
              opacity: !isFullyCovered || processing || lines.length === 0 ? 0.5 : 1,
            }}
          >
            {processing ? 'Processing...' : `Confirm Payment ${totalEntered > 0 ? formatCurrency(totalEntered) : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
