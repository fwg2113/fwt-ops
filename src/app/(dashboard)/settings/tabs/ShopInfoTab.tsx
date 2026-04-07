'use client';

import { useState, useEffect } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function ShopInfoTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [shopName, setShopName] = useState(String(config.shop_name || ''));
  const [shopPhone, setShopPhone] = useState(String(config.shop_phone || ''));
  const [shopEmail, setShopEmail] = useState(String(config.shop_email || ''));
  const [shopAddress, setShopAddress] = useState(String(config.shop_address || ''));
  const [shopTimezone, setShopTimezone] = useState(String(config.shop_timezone || 'America/New_York'));

  // Platform features
  const [moduleComm, setModuleComm] = useState(Boolean(config.module_communication));
  const [moduleStats, setModuleStats] = useState(Boolean(config.module_statistics));
  const [moduleBookkeeping, setModuleBookkeeping] = useState(config.module_bookkeeping !== false);
  const [moduleLockBoxes, setModuleLockBoxes] = useState(Boolean(config.module_lock_boxes));
  const [moduleInventory, setModuleInventory] = useState(Boolean(config.module_inventory));
  const [quickTintQuote, setQuickTintQuote] = useState(config.quick_tint_quote_enabled !== false);

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      shop_name: shopName, shop_phone: shopPhone, shop_email: shopEmail,
      shop_address: shopAddress, shop_timezone: shopTimezone,
      module_communication: moduleComm,
      module_statistics: moduleStats, module_bookkeeping: moduleBookkeeping,
      module_lock_boxes: moduleLockBoxes, module_inventory: moduleInventory,
      quick_tint_quote_enabled: quickTintQuote,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      <DashboardCard title="Shop Information">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
          <FormField label="Shop Name"><TextInput value={shopName} onChange={e => setShopName(e.target.value)} /></FormField>
          <FormField label="Phone"><TextInput value={shopPhone} onChange={e => setShopPhone(e.target.value)} /></FormField>
          <FormField label="Email"><TextInput value={shopEmail} onChange={e => setShopEmail(e.target.value)} /></FormField>
          <FormField label="Timezone">
            <SelectInput value={shopTimezone} onChange={e => setShopTimezone(e.target.value)}>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
            </SelectInput>
          </FormField>
        </div>
        <FormField label="Address"><TextInput value={shopAddress} onChange={e => setShopAddress(e.target.value)} /></FormField>
      </DashboardCard>

      <DashboardCard title="Platform Features">
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
          Service modules (Auto Tint, Flat Glass, etc.) are managed in the Modules tab.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: SPACING.md }}>
          <Toggle label="Communication" checked={moduleComm} onChange={setModuleComm} />
          <Toggle label="Statistics" checked={moduleStats} onChange={setModuleStats} />
          <Toggle label="Bookkeeping" checked={moduleBookkeeping} onChange={setModuleBookkeeping} />
          <Toggle label="Lock Boxes" checked={moduleLockBoxes} onChange={setModuleLockBoxes} />
          <Toggle label="Inventory" checked={moduleInventory} onChange={setModuleInventory} />
          <Toggle label="Fast Lane (FLQA)" checked={quickTintQuote} onChange={setQuickTintQuote} />
        </div>
      </DashboardCard>

      {/* Google Calendar Integration */}
      <GoogleCalendarCard config={config} onRefresh={onRefresh} />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function GoogleCalendarCard({ config, onRefresh }: { config: Record<string, unknown>; onRefresh: () => void }) {
  const isConnected = Boolean(config.google_calendar_connected);
  const connectedEmail = String(config.google_calendar_email || '');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get('gcal');
    if (gcal === 'connected' || gcal === 'error') {
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('gcal');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
      if (gcal === 'connected') onRefresh();
    }
  }, [onRefresh]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch('/api/google');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch { setConnecting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Google Calendar? New bookings will no longer sync.')) return;
    setDisconnecting(true);
    await fetch('/api/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    setDisconnecting(false);
    onRefresh();
  }

  return (
    <DashboardCard title="Google Calendar">
      <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
        Automatically add new appointments to your Google Calendar when customers book online.
      </p>
      {isConnected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACING.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0,
            }} />
            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: 600 }}>
              Connected
            </span>
            {connectedEmail && (
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>({connectedEmail})</span>
            )}
          </div>
          <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Connecting...' : 'Connect Google Calendar'}
        </Button>
      )}
    </DashboardCard>
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
