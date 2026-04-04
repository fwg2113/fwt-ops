'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function PaymentTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connectingSquare, setConnectingSquare] = useState(false);

  const squareConnected = Boolean(config.square_connected);
  const squareMerchantId = config.square_merchant_id as string | null;

  const [ccFeePercent, setCcFeePercent] = useState(String(config.cc_fee_percent || '3.5'));
  const [ccFeeFlat, setCcFeeFlat] = useState(String(config.cc_fee_flat || '0.30'));
  const [cashDiscount, setCashDiscount] = useState(String(config.cash_discount_percent || '5'));

  async function handleConnectSquare() {
    setConnectingSquare(true);
    try {
      const res = await fetch('/api/square/oauth');
      const data = await res.json();
      if (data.url) {
        // Open in new window so the settings page stays open
        window.open(data.url, '_blank', 'width=600,height=700');
      } else {
        console.error('Square OAuth: no URL returned', data);
        alert(data.error || 'Failed to start Square connection');
      }
    } catch (err) {
      console.error('Square connect error:', err);
    }
    setConnectingSquare(false);
  }

  async function handleDisconnectSquare() {
    if (!confirm('Are you sure you want to disconnect Square? Payment processing will stop working.')) return;
    await onSave('shop_config', null, {
      square_connected: false,
      square_access_token: null,
      square_refresh_token: null,
      square_merchant_id: null,
    });
    onRefresh();
  }

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
      {/* Square Connection */}
      <DashboardCard title="Square Integration">
        {squareConnected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Square Connected</div>
                {squareMerchantId && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Merchant ID: {squareMerchantId}</div>}
              </div>
            </div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Online deposits and in-person payments are processed through your Square account.
            </div>
            <button onClick={handleDisconnectSquare} style={{
              padding: `${SPACING.xs}px ${SPACING.md}px`, background: 'transparent',
              border: `1px solid ${COLORS.danger}40`, borderRadius: 6,
              color: COLORS.danger, fontSize: FONT.sizeXs, cursor: 'pointer',
            }}>
              Disconnect Square
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              Connect your Square account to accept online deposits and in-person card payments. Your existing Square hardware will work automatically.
            </div>
            <button onClick={handleConnectSquare} disabled={connectingSquare} style={{
              display: 'flex', alignItems: 'center', gap: SPACING.sm,
              padding: `${SPACING.md}px ${SPACING.xl}px`,
              background: '#000', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, cursor: 'pointer',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M21 7.5V18c0 1.66-1.34 3-3 3H6c-1.66 0-3-1.34-3-3V6c0-1.66 1.34-3 3-3h10.5L21 7.5z"/>
                <rect x="7" y="7" width="10" height="10" rx="1.5" fill="#000"/>
                <rect x="9" y="9" width="6" height="6" rx="1" fill="white"/>
              </svg>
              {connectingSquare ? 'Connecting...' : 'Connect Square'}
            </button>
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Payment Processing">
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Configure credit card processing fees and cash discount percentages. These values are used in invoice calculations.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: SPACING.md }}>
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
