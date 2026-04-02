'use client';

import { useState, useEffect } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { StatusBadge } from '@/app/components/dashboard';
import SignaturePad, { InitialsPad } from '@/app/components/SignaturePad';
import type { Appointment } from './AppointmentCard';

// ============================================================================
// COUNTER CHECKOUT PANEL
// Slide-over panel for reviewing the invoice with the customer at the counter
// Shows line items, pricing, Roll IDs, and payment collection
// ============================================================================

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  line_items_json: Array<{
    label?: string; filmName?: string; filmAbbrev?: string; shade?: string;
    price?: number; rollId?: string | null;
  }>;
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  deposit_paid: number;
  balance_due: number;
  cc_fee_percent: number;
  cc_fee_flat: number;
  cash_discount_percent: number;
  status: string;
}

interface SignatureConfig {
  signature_enabled?: boolean;
  signature_required?: boolean;
  signature_terms_text?: string;
  legality_acknowledgment_enabled?: boolean;
  legality_acknowledgment_required?: boolean;
  legality_acknowledgment_text?: string;
}

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  invoiceToken: string;
  appointment: Appointment;
  signatureConfig?: SignatureConfig;
  onClose: () => void;
  onPaid: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

export default function CounterCheckoutPanel({ invoiceId, invoiceNumber, invoiceToken, appointment, signatureConfig, onClose, onPaid }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // Signature state
  const sigEnabled = signatureConfig?.signature_enabled ?? false;
  const sigRequired = signatureConfig?.signature_required ?? false;
  const legalEnabled = signatureConfig?.legality_acknowledgment_enabled ?? false;
  const legalRequired = signatureConfig?.legality_acknowledgment_required ?? false;
  const [initialsData, setInitialsData] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'idle' | 'signing' | 'sent' | 'skipped'>('idle');
  const [savingSignature, setSavingSignature] = useState(false);

  // Determine if payment is blocked by missing signature
  const needsInitials = legalEnabled && legalRequired && !initialsData;
  const needsSignature = sigEnabled && sigRequired && !signatureData;
  const paymentBlocked = (needsInitials || needsSignature) && signatureMode !== 'skipped';

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/auto/invoices?id=${invoiceId}`);
        const data = await res.json();
        setInvoice(data.invoice || null);
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchInvoice();
  }, [invoiceId]);

  async function handleMarkPaid(method: string) {
    setPaying(true);
    setPaymentMethod(method);
    try {
      await fetch('/api/auto/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          status: 'paid',
          payment_method: method,
          payment_confirmed_at: new Date().toISOString(),
          total_paid: invoice?.balance_due || 0,
          balance_due: 0,
        }),
      });
      onPaid();
    } catch { /* silent */ }
    setPaying(false);
  }

  const vehicleStr = [appointment.vehicle_year, appointment.vehicle_make, appointment.vehicle_model].filter(Boolean).join(' ');
  const lineItems = invoice?.line_items_json || [];
  const isPaid = invoice?.status === 'paid';

  // Pricing calculations
  const balanceDue = invoice?.balance_due || Number(appointment.balance_due) || 0;
  const ccFee = invoice ? Math.round((balanceDue * ((invoice.cc_fee_percent || 0) / 100) + (invoice.cc_fee_flat || 0)) * 100) / 100 : 0;
  const cardTotal = balanceDue + ccFee;
  const cashDiscount = invoice?.cash_discount_percent || 0;
  const cashTotal = cashDiscount > 0 ? Math.round(balanceDue * (1 - cashDiscount / 100) * 100) / 100 : balanceDue;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, height: '100vh',
          background: COLORS.pageBg, overflowY: 'auto',
          borderLeft: `1px solid ${COLORS.borderAccent}`,
          padding: SPACING.xxl,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl }}>
          <div>
            <div style={{ fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
              {invoiceNumber}
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 2 }}>
              Counter Checkout
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
            <StatusBadge label={isPaid ? 'Paid' : 'Due'} variant={isPaid ? 'success' : 'warning'} />
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading invoice...</div>
        ) : (
          <>
            {/* Customer + Vehicle */}
            <div style={{
              background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
              border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.lg }}>
                <div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Customer</div>
                  <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{appointment.customer_name}</div>
                  {appointment.customer_phone && <div style={{ fontSize: FONT.sizeSm, color: COLORS.textTertiary }}>{formatPhone(appointment.customer_phone)}</div>}
                </div>
                <div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Vehicle</div>
                  <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{vehicleStr}</div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div style={{
              background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
              border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
            }}>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
                Services
              </div>
              {lineItems.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: `${SPACING.sm}px 0`,
                  borderBottom: idx < lineItems.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{item.label || 'Service'}</div>
                    {(item.filmName || item.filmAbbrev) && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                        {item.filmName || item.filmAbbrev}{item.shade ? ` ${item.shade}` : ''}
                      </div>
                    )}
                    {item.rollId && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPlaceholder }}>Roll: {item.rollId}</div>
                    )}
                  </div>
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                    {formatCurrency(item.price || 0)}
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing Summary */}
            <div style={{
              background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
              border: `1px solid ${COLORS.border}`, marginBottom: SPACING.xl,
            }}>
              <PricingRow label="Subtotal" value={formatCurrency(invoice?.subtotal || 0)} />
              {(invoice?.discount_amount || 0) > 0 && (
                <PricingRow label={`Discount${invoice?.discount_code ? ` (${invoice.discount_code})` : ''}`} value={`-${formatCurrency(invoice?.discount_amount || 0)}`} color={COLORS.success} />
              )}
              {(invoice?.deposit_paid || 0) > 0 && (
                <PricingRow label="Deposit Paid" value={`-${formatCurrency(invoice?.deposit_paid || 0)}`} color={COLORS.success} />
              )}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: SPACING.sm, paddingTop: SPACING.sm }}>
                <PricingRow label="Balance Due" value={isPaid ? formatCurrency(0) : formatCurrency(balanceDue)} bold color={isPaid ? COLORS.success : COLORS.red} />
              </div>
            </div>

            {/* Signature & Acknowledgment Section */}
            {!isPaid && (sigEnabled || legalEnabled) && signatureMode !== 'skipped' && (
              <div style={{
                background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
                border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
              }}>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
                  Customer Acknowledgment
                  {(sigRequired || legalRequired) && (
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.warning, marginLeft: 8 }}>Required</span>
                  )}
                </div>

                {signatureMode === 'idle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                    <button
                      onClick={() => setSignatureMode('signing')}
                      style={{
                        padding: '14px 16px', borderRadius: RADIUS.md,
                        border: `1px solid ${COLORS.borderInput}`, background: COLORS.cardBg,
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: SPACING.md,
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: RADIUS.sm,
                        background: `#8b5cf615`, border: '1px solid #8b5cf630',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Sign Here</div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Customer signs on this screen</div>
                      </div>
                    </button>

                    <button
                      onClick={async () => {
                        const signingUrl = `${window.location.origin}/invoice/${invoiceToken}`;
                        const firstName = appointment.customer_name?.split(' ')[0] || '';
                        const vehicle = [appointment.vehicle_year, appointment.vehicle_make, appointment.vehicle_model].filter(Boolean).join(' ');
                        const message = `Hi ${firstName}, please review and sign your invoice for your ${vehicle}: ${signingUrl}`;
                        try {
                          await fetch('/api/auto/messages/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bookingId: appointment.id, message, method: 'sms' }),
                          });
                        } catch { /* silent */ }
                        setSignatureMode('sent');
                      }}
                      style={{
                        padding: '14px 16px', borderRadius: RADIUS.md,
                        border: `1px solid ${COLORS.borderInput}`, background: COLORS.cardBg,
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: SPACING.md,
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: RADIUS.sm,
                        background: '#3b82f615', border: '1px solid #3b82f630',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Send Signing Link</div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Customer signs on their phone</div>
                      </div>
                    </button>

                    {!sigRequired && !legalRequired && (
                      <button
                        onClick={() => setSignatureMode('skipped')}
                        style={{
                          padding: '10px', borderRadius: RADIUS.md,
                          border: 'none', background: 'transparent',
                          cursor: 'pointer', fontSize: FONT.sizeXs, color: COLORS.textMuted,
                          textAlign: 'center',
                        }}
                      >
                        Skip
                      </button>
                    )}
                  </div>
                )}

                {signatureMode === 'signing' && (
                  <div>
                    {/* Legality acknowledgment + initials */}
                    {legalEnabled && (
                      <div style={{ marginBottom: SPACING.lg }}>
                        <div style={{
                          fontSize: FONT.sizeSm, color: COLORS.textSecondary, lineHeight: 1.6,
                          padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm,
                          marginBottom: SPACING.sm, border: `1px solid ${COLORS.borderInput}`,
                        }}>
                          {signatureConfig?.legality_acknowledgment_text || 'I acknowledge the legal terms.'}
                        </div>
                        <InitialsPad
                          label="Customer Initials"
                          value={initialsData}
                          onChange={setInitialsData}
                          disabled={savingSignature}
                        />
                      </div>
                    )}

                    {/* Signature + terms */}
                    {sigEnabled && (
                      <div>
                        <div style={{
                          fontSize: FONT.sizeXs, color: COLORS.textMuted, lineHeight: 1.6,
                          padding: SPACING.sm, background: COLORS.inputBg, borderRadius: RADIUS.sm,
                          marginBottom: SPACING.sm, border: `1px solid ${COLORS.borderInput}`,
                          maxHeight: 80, overflowY: 'auto',
                        }}>
                          {signatureConfig?.signature_terms_text || 'I accept the terms stated above.'}
                        </div>
                        <SignaturePad
                          label="Customer Signature"
                          value={signatureData}
                          onChange={setSignatureData}
                          disabled={savingSignature}
                          penColor="#1a1a1a"
                        />
                      </div>
                    )}

                    {/* Confirm signature button */}
                    <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.md }}>
                      <button
                        onClick={async () => {
                          setSavingSignature(true);
                          try {
                            await fetch('/api/auto/invoices', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                id: invoiceId,
                                initials_data: initialsData,
                                signature_data: signatureData,
                                signed_at: new Date().toISOString(),
                                signed_via: 'counter',
                              }),
                            });
                          } catch { /* silent */ }
                          setSavingSignature(false);
                          setSignatureMode('idle');
                        }}
                        disabled={
                          savingSignature ||
                          (legalEnabled && legalRequired && !initialsData) ||
                          (sigEnabled && sigRequired && !signatureData)
                        }
                        style={{
                          flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none',
                          background: (legalRequired && !initialsData) || (sigRequired && !signatureData) ? COLORS.inputBg : '#8b5cf6',
                          color: (legalRequired && !initialsData) || (sigRequired && !signatureData) ? COLORS.textMuted : '#fff',
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                          cursor: 'pointer',
                        }}
                      >
                        {savingSignature ? 'Saving...' : 'Confirm Signature'}
                      </button>
                      <button
                        onClick={() => { setSignatureMode('idle'); setInitialsData(null); setSignatureData(null); }}
                        style={{
                          padding: '12px 20px', borderRadius: RADIUS.md,
                          border: `1px solid ${COLORS.borderInput}`, background: 'transparent',
                          color: COLORS.textMuted, fontSize: FONT.sizeSm, cursor: 'pointer',
                        }}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {signatureMode === 'sent' && (
                  <div style={{ textAlign: 'center', padding: SPACING.lg }}>
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, marginBottom: 4 }}>
                      Signing link sent to customer
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      Waiting for signature...
                    </div>
                    <button
                      onClick={() => setSignatureMode('idle')}
                      style={{
                        marginTop: SPACING.md, padding: '8px 16px', borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.borderInput}`, background: 'transparent',
                        color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
                      }}
                    >
                      Try Another Method
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Payment blocked notice */}
            {!isPaid && paymentBlocked && signatureMode !== 'signing' && signatureMode !== 'sent' && (
              <div style={{
                padding: SPACING.md, borderRadius: RADIUS.md,
                background: `${COLORS.warning}10`, border: `1px solid ${COLORS.warning}30`,
                marginBottom: SPACING.lg, display: 'flex', alignItems: 'center', gap: SPACING.sm,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.warning} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.warning }}>
                  Customer signature required before collecting payment
                </span>
              </div>
            )}

            {/* Payment Options */}
            {!isPaid && (
              <div style={{
                background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
                border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
              }}>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
                  Collect Payment
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                  {/* Cash */}
                  {cashDiscount > 0 && (
                    <PaymentButton
                      label="Cash"
                      amount={cashTotal}
                      detail={`${cashDiscount}% cash discount`}
                      color="#22c55e"
                      loading={paying && paymentMethod === 'cash'}
                      disabled={paying} blocked={paymentBlocked}
                      onClick={() => handleMarkPaid('cash')}
                    />
                  )}
                  {cashDiscount === 0 && (
                    <PaymentButton
                      label="Cash"
                      amount={balanceDue}
                      color="#22c55e"
                      loading={paying && paymentMethod === 'cash'}
                      disabled={paying} blocked={paymentBlocked}
                      onClick={() => handleMarkPaid('cash')}
                    />
                  )}

                  {/* Credit Card */}
                  <PaymentButton
                    label="Credit Card"
                    amount={cardTotal}
                    detail={ccFee > 0 ? `Includes ${formatCurrency(ccFee)} processing fee` : undefined}
                    color="#3b82f6"
                    loading={paying && paymentMethod === 'cc'}
                    disabled={paying} blocked={paymentBlocked}
                    onClick={() => handleMarkPaid('cc')}
                  />

                  {/* Money Apps */}
                  {['venmo', 'zelle', 'cashapp'].map(method => (
                    <PaymentButton
                      key={method}
                      label={method.charAt(0).toUpperCase() + method.slice(1)}
                      amount={balanceDue}
                      color="#8b5cf6"
                      loading={paying && paymentMethod === method}
                      disabled={paying} blocked={paymentBlocked}
                      onClick={() => handleMarkPaid(method)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Paid confirmation */}
            {isPaid && (
              <div style={{
                background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
                border: `2px solid ${COLORS.success}`, display: 'flex', alignItems: 'center', gap: SPACING.md,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.success }}>
                  Payment Collected
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function PricingRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: FONT.sizeSm, color: color || COLORS.textMuted }}>{label}</span>
      <span style={{
        fontSize: bold ? FONT.sizeBase : FONT.sizeSm,
        fontWeight: bold ? FONT.weightBold : FONT.weightMedium,
        color: color || COLORS.textPrimary,
      }}>{value}</span>
    </div>
  );
}

function PaymentButton({ label, amount, detail, color, loading, disabled, blocked, onClick }: {
  label: string; amount: number; detail?: string; color: string;
  loading: boolean; disabled: boolean; blocked?: boolean; onClick: () => void;
}) {
  const isDisabled = disabled || blocked;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: RADIUS.md,
        border: `1px solid ${isDisabled && !loading ? COLORS.borderInput : `${color}30`}`,
        background: isDisabled && !loading ? COLORS.inputBg : `${color}08`,
        cursor: isDisabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        opacity: isDisabled ? 0.5 : 1, transition: 'all 0.15s',
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
          {loading ? 'Processing...' : label}
        </div>
        {detail && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{detail}</div>}
      </div>
      <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color }}>
        {formatCurrency(amount)}
      </div>
    </button>
  );
}
