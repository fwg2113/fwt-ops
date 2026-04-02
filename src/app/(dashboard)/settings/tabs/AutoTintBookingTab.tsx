'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function AutoTintBookingTab({ data, onSave, onRefresh }: Props) {
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Pricing model
  const [pricingModel, setPricingModel] = useState(String(config.pricing_model || 'ymm'));

  // Booking settings
  const [requireDeposit, setRequireDeposit] = useState(Boolean(config.require_deposit));
  const [depositAmount, setDepositAmount] = useState(String(config.deposit_amount || '50'));
  const [depositRefundable, setDepositRefundable] = useState(Boolean(config.deposit_refundable));
  const [depositRefundHours, setDepositRefundHours] = useState(String(config.deposit_refund_hours || '24'));
  const [priceAckEnabled, setPriceAckEnabled] = useState(config.price_ack_enabled !== false);
  const [priceAckText, setPriceAckText] = useState(String(config.price_ack_text || 'I understand that the final price is subject to change if additional labor is required beyond the standard installation process (e.g., removal of existing tint, adhesive residue removal, etc.).'));
  const [maxDaysOut, setMaxDaysOut] = useState(String(config.max_days_out || '45'));
  const [bookingCutoff, setBookingCutoff] = useState(String(config.booking_cutoff_hours || '8'));

  // Appointment types
  const [enableDropoff, setEnableDropoff] = useState(Boolean(config.enable_dropoff));
  const [enableWaiting, setEnableWaiting] = useState(Boolean(config.enable_waiting));
  const [enableHeadsup30, setEnableHeadsup30] = useState(Boolean(config.enable_headsup_30));
  const [enableHeadsup60, setEnableHeadsup60] = useState(Boolean(config.enable_headsup_60));
  const [enableGC, setEnableGC] = useState(Boolean(config.enable_gift_certificates));

  // GC / Promo Contact Settings
  const [gcHelpText, setGcHelpText] = useState(String(config.gc_help_text || 'If you\'re having issues with validating, please let us know:'));
  const [gcCallEnabled, setGcCallEnabled] = useState(config.gc_call_enabled !== false);
  const [gcCallNumber, setGcCallNumber] = useState(String(config.gc_call_number || config.shop_phone || ''));
  const [gcTextEnabled, setGcTextEnabled] = useState(config.gc_text_enabled !== false);
  const [gcTextNumber, setGcTextNumber] = useState(String(config.gc_text_number || config.shop_phone || ''));

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      pricing_model: pricingModel,
      require_deposit: requireDeposit, deposit_amount: parseFloat(depositAmount) || 50,
      deposit_refundable: depositRefundable, deposit_refund_hours: parseInt(depositRefundHours) || 24,
      price_ack_enabled: priceAckEnabled, price_ack_text: priceAckText || null,
      max_days_out: parseInt(maxDaysOut) || 45, booking_cutoff_hours: parseInt(bookingCutoff) || 8,
      enable_dropoff: enableDropoff, enable_waiting: enableWaiting,
      enable_headsup_30: enableHeadsup30, enable_headsup_60: enableHeadsup60,
      enable_gift_certificates: enableGC,
      gc_help_text: gcHelpText || null,
      gc_call_enabled: gcCallEnabled, gc_call_number: gcCallNumber || null,
      gc_text_enabled: gcTextEnabled, gc_text_number: gcTextNumber || null,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      <DashboardCard title="Booking Settings">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.md }}>
          <FormField label="Pricing Model">
            <SelectInput value={pricingModel} onChange={e => setPricingModel(e.target.value)}>
              <option value="ymm">YMM (Year/Make/Model)</option>
              <option value="category">Category</option>
              <option value="window_count">Window Count</option>
            </SelectInput>
          </FormField>
          <FormField label="Max Days Out"><TextInput type="number" value={maxDaysOut} onChange={e => setMaxDaysOut(e.target.value)} /></FormField>
          <FormField label="Booking Cutoff (hours)"><TextInput type="number" value={bookingCutoff} onChange={e => setBookingCutoff(e.target.value)} /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <div>
            <Toggle label="Require Deposit" checked={requireDeposit} onChange={setRequireDeposit} />
            {requireDeposit && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="Deposit Amount ($)"><TextInput type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></FormField>
              </div>
            )}
          </div>
          <div>
            <Toggle label="Refundable" checked={depositRefundable} onChange={setDepositRefundable} />
            {depositRefundable && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="Cancellation Window (hours)"><TextInput type="number" value={depositRefundHours} onChange={e => setDepositRefundHours(e.target.value)} /></FormField>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: SPACING.md, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Toggle label="Price Acknowledgement Checkbox" checked={priceAckEnabled} onChange={setPriceAckEnabled} />
          </div>
        </div>
        {priceAckEnabled && (
          <div style={{ marginTop: SPACING.sm }}>
            <FormField label="Acknowledgement Text">
              <textarea
                value={priceAckText}
                onChange={e => setPriceAckText(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none',
                }}
              />
            </FormField>
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Appointment Types">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <Toggle label="Drop-Off" checked={enableDropoff} onChange={setEnableDropoff} />
          <Toggle label="Waiting" checked={enableWaiting} onChange={setEnableWaiting} />
          <Toggle label="30-Min Heads-Up" checked={enableHeadsup30} onChange={setEnableHeadsup30} />
          <Toggle label="60-Min Heads-Up" checked={enableHeadsup60} onChange={setEnableHeadsup60} />
          <Toggle label="Gift Certificates" checked={enableGC} onChange={setEnableGC} />
        </div>
      </DashboardCard>

      <DashboardCard title="Gift Certificate / Promo Code Section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <FormField label="Help Message" hint="Text shown above the Call/Text buttons">
            <TextInput value={gcHelpText} onChange={e => setGcHelpText(e.target.value)} placeholder="If you're having issues..." />
          </FormField>
          <div />
          <div>
            <Toggle label="Call Button" checked={gcCallEnabled} onChange={setGcCallEnabled} />
            {gcCallEnabled && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="Call Number">
                  <TextInput value={gcCallNumber} onChange={e => setGcCallNumber(e.target.value)} placeholder="Shop phone" />
                </FormField>
              </div>
            )}
          </div>
          <div>
            <Toggle label="Text Button" checked={gcTextEnabled} onChange={setGcTextEnabled} />
            {gcTextEnabled && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="Text Number">
                  <TextInput value={gcTextNumber} onChange={e => setGcTextNumber(e.target.value)} placeholder="Shop phone" />
                </FormField>
              </div>
            )}
          </div>
        </div>
      </DashboardCard>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer' }} />
      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{label}</span>
    </label>
  );
}
