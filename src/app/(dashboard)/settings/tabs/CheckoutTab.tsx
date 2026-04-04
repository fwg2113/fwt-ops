'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

// ============================================================================
// CHECKOUT SETTINGS TAB
// ============================================================================
interface Brand {
  id: number;
  name: string;
  short_name: string | null;
  active: boolean;
}

export default function CheckoutTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const config = data.shopConfig as Record<string, unknown> || {};
  const brands = ((data.brands || []) as Brand[]).filter(b => b.active);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Brand display settings
  const [brandMode, setBrandMode] = useState(String(config.invoice_brand_mode || 'auto'));
  const [brandFixedId, setBrandFixedId] = useState(config.invoice_brand_fixed_id ? String(config.invoice_brand_fixed_id) : '');

  // Checkout flow config
  const flowConfig = (config.checkout_flow_config || {}) as Record<string, unknown>;
  const [invoiceCreation, setInvoiceCreation] = useState(String(flowConfig.invoice_creation || 'manual'));
  const [selfCheckout, setSelfCheckout] = useState(String(flowConfig.self_checkout_availability || 'after_invoice'));
  const [paymentTiming, setPaymentTiming] = useState(String(flowConfig.payment_timing || 'collect_after'));
  // Self-checkout settings
  const [selfCheckoutEnabled, setSelfCheckoutEnabled] = useState(Boolean(config.self_checkout_enabled));
  const [selfCheckoutHeading, setSelfCheckoutHeading] = useState(String(config.self_checkout_heading || 'Self Checkout'));
  const [selfCheckoutSubtext, setSelfCheckoutSubtext] = useState(String(config.self_checkout_subtext || 'Find your vehicle below and tap to check out.'));
  const [qrGenerated, setQrGenerated] = useState(false);

  // Quote approval modes
  const approvalModesRaw = (config.quote_approval_modes || {}) as Record<string, boolean>;
  const [amScheduleApprove, setAmScheduleApprove] = useState(Boolean(approvalModesRaw.schedule_approve));
  const [amJustApprove, setAmJustApprove] = useState(Boolean(approvalModesRaw.just_approve));
  const [defaultApprovalMode, setDefaultApprovalMode] = useState(String(config.quote_default_approval_mode || 'just_approve'));

  // Signature settings
  const [sigEnabled, setSigEnabled] = useState(Boolean(flowConfig.signature_enabled));
  const [sigRequired, setSigRequired] = useState(Boolean(flowConfig.signature_required));
  const [sigTerms, setSigTerms] = useState(String(flowConfig.signature_terms_text || ''));
  const [legalEnabled, setLegalEnabled] = useState(Boolean(flowConfig.legality_acknowledgment_enabled));
  const [legalRequired, setLegalRequired] = useState(Boolean(flowConfig.legality_acknowledgment_required));
  const [legalText, setLegalText] = useState(String(flowConfig.legality_acknowledgment_text || ''));

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      invoice_brand_mode: brandMode,
      invoice_brand_fixed_id: brandMode === 'fixed' && brandFixedId ? parseInt(brandFixedId) : null,
      quote_approval_modes: {
        schedule_approve: amScheduleApprove,
        just_approve: amJustApprove,
      },
      quote_default_approval_mode: defaultApprovalMode,
      self_checkout_enabled: selfCheckoutEnabled,
      self_checkout_heading: selfCheckoutHeading,
      self_checkout_subtext: selfCheckoutSubtext,
      checkout_flow_config: {
        invoice_creation: invoiceCreation,
        self_checkout_availability: selfCheckout,
        payment_timing: paymentTiming,
        signature_enabled: sigEnabled,
        signature_required: sigRequired,
        signature_terms_text: sigTerms,
        legality_acknowledgment_enabled: legalEnabled,
        legality_acknowledgment_required: legalRequired,
        legality_acknowledgment_text: legalText,
      },
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* ================================================================ */}
      {/* INVOICE BRAND DISPLAY */}
      {/* ================================================================ */}
      {brands.length > 1 && (
        <DashboardCard title="Invoice Brand Display" icon={
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
        }>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
            When a quote or invoice includes services from multiple brands, choose which brand identity to show in the document header. This can be overridden per document in the Quote Builder.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Default brand display">
              <SelectInput value={brandMode} onChange={e => setBrandMode(e.target.value)}>
                <option value="auto">Auto -- show brand(s) from services on the document</option>
                <option value="fixed">Always use a specific brand</option>
              </SelectInput>
            </FormField>
            {brandMode === 'fixed' && (
              <FormField label="Default brand">
                <SelectInput value={brandFixedId} onChange={e => setBrandFixedId(e.target.value)}>
                  <option value="">Select a brand...</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.short_name ? ` (${b.short_name})` : ''}</option>
                  ))}
                </SelectInput>
              </FormField>
            )}
          </div>
        </DashboardCard>
      )}

      {/* ================================================================ */}
      {/* QUOTE APPROVAL MODES */}
      {/* ================================================================ */}
      <DashboardCard title="Quote Approval Modes" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Choose which approval modes are available when sending quotes. Enable at least one.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md, marginBottom: SPACING.lg }}>
          {/* Schedule + Approve */}
          <div style={{
            padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md,
            border: `1px solid ${amScheduleApprove ? COLORS.borderAccentSolid : COLORS.borderInput}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Schedule + Approve</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                  Customer picks from available time slots you provide, then approves. Appointments auto-created.
                </div>
              </div>
              <Toggle label="" checked={amScheduleApprove} onChange={v => {
                setAmScheduleApprove(v);
                if (!v && defaultApprovalMode === 'schedule_approve') {
                  if (amJustApprove) setDefaultApprovalMode('just_approve');
                }
              }} />
            </div>
          </div>

          {/* Just Approve */}
          <div style={{
            padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md,
            border: `1px solid ${amJustApprove ? COLORS.borderAccentSolid : COLORS.borderInput}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Just Approve</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                  Customer approves the quote. You schedule manually afterward.
                </div>
              </div>
              <Toggle label="" checked={amJustApprove} onChange={v => {
                setAmJustApprove(v);
                if (!v && defaultApprovalMode === 'just_approve') {
                  if (amScheduleApprove) setDefaultApprovalMode('schedule_approve');
                }
              }} />
            </div>
          </div>

        </div>

        {/* Default mode dropdown */}
        {(() => {
          const enabledModes: { value: string; label: string }[] = [];
          if (amScheduleApprove) enabledModes.push({ value: 'schedule_approve', label: 'Schedule + Approve' });
          if (amJustApprove) enabledModes.push({ value: 'just_approve', label: 'Just Approve' });
          if (enabledModes.length === 0) return null;
          return (
            <FormField label="Default approval mode for new quotes">
              <SelectInput value={defaultApprovalMode} onChange={e => setDefaultApprovalMode(e.target.value)}>
                {enabledModes.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </SelectInput>
            </FormField>
          );
        })()}
      </DashboardCard>

      {/* ================================================================ */}
      {/* CHECKOUT FLOW */}
      {/* ================================================================ */}
      <DashboardCard title="Checkout Flow" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Control when invoices are created and how customers can check out.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
          <FormField label="When to create invoice">
            <SelectInput value={invoiceCreation} onChange={e => setInvoiceCreation(e.target.value)}>
              <option value="manual">Manual only (Invoice button)</option>
              <option value="at_checkin">Automatically at check-in</option>
              <option value="at_ready">Automatically when marked ready</option>
            </SelectInput>
          </FormField>
          <FormField label="Self-checkout availability">
            <SelectInput value={selfCheckout} onChange={e => setSelfCheckout(e.target.value)}>
              <option value="disabled">Disabled</option>
              <option value="after_invoice">After invoice is created</option>
              <option value="after_checkin">After check-in</option>
              <option value="after_ready">After marked ready</option>
            </SelectInput>
          </FormField>
          <FormField label="Payment timing">
            <SelectInput value={paymentTiming} onChange={e => setPaymentTiming(e.target.value)}>
              <option value="collect_before">Collect before work starts</option>
              <option value="collect_after">Collect after work is done</option>
              <option value="customer_chooses">Customer chooses</option>
            </SelectInput>
          </FormField>
        </div>
      </DashboardCard>

      {/* Self-Checkout QR */}
      <DashboardCard title="Self-Checkout (QR Code)">
        <Toggle label="Enable Self-Checkout" checked={selfCheckoutEnabled} onChange={setSelfCheckoutEnabled} />
        {selfCheckoutEnabled && (
          <div style={{ marginTop: SPACING.md }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
              <FormField label="Page Heading">
                <TextInput value={selfCheckoutHeading} onChange={e => setSelfCheckoutHeading(e.target.value)} placeholder="Self Checkout" />
              </FormField>
              <FormField label="Page Subtext">
                <TextInput value={selfCheckoutSubtext} onChange={e => setSelfCheckoutSubtext(e.target.value)} placeholder="Find your vehicle below..." />
              </FormField>
            </div>

            {/* QR Code Generator */}
            <div style={{
              marginTop: SPACING.md, padding: SPACING.lg,
              border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
              display: 'flex', gap: SPACING.xl, alignItems: 'center',
              flexDirection: isMobile ? 'column' : 'row',
            }}>
              <div style={{ textAlign: 'center' }}>
                <canvas id="self-checkout-qr" style={{ display: qrGenerated ? 'block' : 'none', width: 180, height: 180 }} />
                {!qrGenerated && (
                  <div style={{
                    width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px dashed ${COLORS.borderInput}`, borderRadius: RADIUS.md, color: COLORS.textMuted, fontSize: FONT.sizeSm,
                  }}>
                    QR Code
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>
                  Self-Checkout QR Code
                </div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
                  Print this QR code and display it in your shop. Customers scan it to check themselves out.
                  The URL never changes -- print once, use forever.
                </div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md, fontFamily: 'monospace', padding: `${SPACING.xs}px ${SPACING.sm}px`, background: COLORS.inputBg, borderRadius: RADIUS.sm, display: 'inline-block' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/checkout` : '/checkout'}
                </div>
                <div style={{ display: 'flex', gap: SPACING.sm }}>
                  <Button variant="primary" size="sm" onClick={() => {
                    const canvas = document.getElementById('self-checkout-qr') as HTMLCanvasElement;
                    if (!canvas) return;
                    const url = `${window.location.origin}/checkout`;
                    // Simple QR code generation using canvas
                    // For production, use a proper QR library. This generates a placeholder.
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    canvas.width = 360;
                    canvas.height = 360;
                    // Use an external QR API to draw
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                      ctx.fillStyle = '#ffffff';
                      ctx.fillRect(0, 0, 360, 360);
                      ctx.drawImage(img, 0, 0, 360, 360);
                      setQrGenerated(true);
                    };
                    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}&margin=10`;
                  }}>
                    Generate QR Code
                  </Button>
                  {qrGenerated && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => {
                        const canvas = document.getElementById('self-checkout-qr') as HTMLCanvasElement;
                        if (!canvas) return;
                        const link = document.createElement('a');
                        link.download = 'self-checkout-qr.png';
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                      }}>
                        Download PNG
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => {
                        const url = `${window.location.origin}/checkout`;
                        const svgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&format=svg&data=${encodeURIComponent(url)}&margin=10`;
                        const link = document.createElement('a');
                        link.download = 'self-checkout-qr.svg';
                        link.href = svgUrl;
                        link.click();
                      }}>
                        Download SVG
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </DashboardCard>

      {/* ================================================================ */}
      {/* SIGNATURE & ACKNOWLEDGMENT */}
      {/* ================================================================ */}
      <DashboardCard title="Signature & Acknowledgment" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Require customers to sign or acknowledge terms before completing checkout.
        </div>

        {/* Signature */}
        <div style={{
          padding: SPACING.lg, background: COLORS.inputBg, borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.borderInput}`, marginBottom: SPACING.md,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sigEnabled ? SPACING.md : 0 }}>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Customer Signature</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Capture a signature on the invoice before payment</div>
            </div>
            <Toggle label="" checked={sigEnabled} onChange={setSigEnabled} />
          </div>
          {sigEnabled && (
            <div style={{ marginTop: SPACING.sm }}>
              <div style={{ marginBottom: SPACING.md }}>
                <Toggle label="Require signature before payment can be collected" checked={sigRequired} onChange={setSigRequired} />
              </div>
              <FormField label="Terms & Conditions Text">
                <textarea
                  value={sigTerms}
                  onChange={e => setSigTerms(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: SPACING.sm, borderRadius: RADIUS.sm,
                    background: COLORS.cardBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.border}`, fontSize: FONT.sizeSm,
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                />
              </FormField>
            </div>
          )}
        </div>

        {/* Legality Acknowledgment */}
        <div style={{
          padding: SPACING.lg, background: COLORS.inputBg, borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.borderInput}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: legalEnabled ? SPACING.md : 0 }}>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Legality Acknowledgment</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Customer initials confirming awareness of legal tint limits</div>
            </div>
            <Toggle label="" checked={legalEnabled} onChange={setLegalEnabled} />
          </div>
          {legalEnabled && (
            <div style={{ marginTop: SPACING.sm }}>
              <div style={{ marginBottom: SPACING.md }}>
                <Toggle label="Require initials before payment can be collected" checked={legalRequired} onChange={setLegalRequired} />
              </div>
              <FormField label="Legal Acknowledgment Text">
                <textarea
                  value={legalText}
                  onChange={e => setLegalText(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%', padding: SPACING.sm, borderRadius: RADIUS.sm,
                    background: COLORS.cardBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.border}`, fontSize: FONT.sizeSm,
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                />
              </FormField>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPlaceholder, marginTop: 4 }}>
                Use {'{illegal_percent}'} for the darkness percentage above legal limit
              </div>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* ================================================================ */}
      {/* SAVE */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={{ background: saved ? '#22c55e' : undefined, borderColor: saved ? '#22c55e' : undefined }}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}
      onClick={e => e.stopPropagation()}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
        background: checked ? COLORS.red : COLORS.borderInput,
        position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ fontSize: FONT.sizeSm, color: checked ? COLORS.textPrimary : COLORS.textMuted }}>{label}</span>}
    </label>
  );
}
