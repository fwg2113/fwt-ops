'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT } from '@/app/components/dashboard/theme';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function PaymentTab({ data, onSave, onRefresh }: Props) {
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [ccFeePercent, setCcFeePercent] = useState(String(config.cc_fee_percent || '3.5'));
  const [ccFeeFlat, setCcFeeFlat] = useState(String(config.cc_fee_flat || '0.30'));
  const [cashDiscount, setCashDiscount] = useState(String(config.cash_discount_percent || '5'));

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      cc_fee_percent: parseFloat(ccFeePercent) || 3.5,
      cc_fee_flat: parseFloat(ccFeeFlat) || 0.30,
      cash_discount_percent: parseFloat(cashDiscount) || 5,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      <DashboardCard title="Payment Processing">
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Configure credit card processing fees and cash discount percentages. These values are used in invoice calculations.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.md }}>
          <FormField label="CC Fee (%)" hint="Percentage fee charged by processor">
            <TextInput type="number" value={ccFeePercent} onChange={e => setCcFeePercent(e.target.value)} />
          </FormField>
          <FormField label="CC Flat Fee ($)" hint="Per-transaction flat fee">
            <TextInput type="number" value={ccFeeFlat} onChange={e => setCcFeeFlat(e.target.value)} />
          </FormField>
          <FormField label="Cash Discount (%)" hint="Discount offered for cash payment">
            <TextInput type="number" value={cashDiscount} onChange={e => setCashDiscount(e.target.value)} />
          </FormField>
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
