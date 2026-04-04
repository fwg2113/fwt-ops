'use client';

import { useState } from 'react';
import { DashboardCard, Button, StatusBadge, SelectInput, ColorPicker } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface ShopModule {
  id: number;
  module_id: number;
  enabled: boolean;
  online_mode: 'full_booking' | 'pricing_only' | 'none';
  brand_id: number | null;
  has_own_schedule: boolean;
  enable_dropoff: boolean;
  enable_waiting: boolean;
  enable_headsup_30: boolean;
  enable_headsup_60: boolean;
  booking_page_title: string | null;
  booking_page_subtitle: string | null;
  override_deposit: boolean;
  deposit_amount: number | null;
  require_deposit: boolean;
  deposit_refundable: boolean;
  deposit_refund_hours: number;
  custom_color: string | null;
  sort_order: number;
  service_modules: {
    module_key: string;
    label: string;
    color: string;
    parent_category: string;
    pricing_model: string;
    icon_name: string | null;
  };
}

interface Brand {
  id: number;
  name: string;
  short_name: string | null;
  primary_color: string;
  is_default: boolean;
  active: boolean;
}

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

const ONLINE_MODE_OPTIONS: { value: ShopModule['online_mode']; label: string }[] = [
  { value: 'full_booking', label: 'Full Booking' },
  { value: 'pricing_only', label: 'Pricing Only' },
  { value: 'none', label: 'Internal Only' },
];

const ONLINE_MODE_VARIANT: Record<ShopModule['online_mode'], 'success' | 'warning' | 'neutral'> = {
  full_booking: 'success',
  pricing_only: 'warning',
  none: 'neutral',
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTOMOTIVE: 'Automotive',
  HOME_SERVICES: 'Home Services',
  MARINE: 'Marine',
  COMMERCIAL: 'Commercial',
};

const PRICING_MODEL_LABELS: Record<string, string> = {
  ymm_matrix: 'YMM Pricing',
  size_class: 'Size Class',
  sqft: 'Sq Ft',
  custom_quote: 'Custom Quote',
  flat_rate: 'Flat Rate',
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s',
    }}>
      <path d="M3 5.5L7 9.5L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ModulesTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const shopModules = (data.shopModules || []) as ShopModule[];
  const brands = ((data.brands || []) as Brand[]).filter(b => b.active);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [advancedDraft, setAdvancedDraft] = useState<Record<string, unknown>>({});
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [savedAdvanced, setSavedAdvanced] = useState(false);

  // Group modules by parent_category
  const grouped = shopModules.reduce<Record<string, ShopModule[]>>((acc, mod) => {
    const cat = mod.service_modules.parent_category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mod);
    return acc;
  }, {});

  // Sort modules within each group by sort_order
  Object.values(grouped).forEach(group => group.sort((a, b) => a.sort_order - b.sort_order));

  // Ordered category keys
  const categoryOrder = ['AUTOMOTIVE', 'HOME_SERVICES', 'MARINE', 'COMMERCIAL'];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  async function handleToggleEnabled(mod: ShopModule) {
    await onSave('shop_modules', mod.id, { enabled: !mod.enabled });
    onRefresh();
  }

  async function handleOnlineModeChange(mod: ShopModule, value: string) {
    await onSave('shop_modules', mod.id, { online_mode: value });
    onRefresh();
  }

  async function handleBrandChange(mod: ShopModule, value: string) {
    const brandId = value === '' ? null : parseInt(value);
    await onSave('shop_modules', mod.id, { brand_id: brandId });
    onRefresh();
  }

  function openAdvanced(mod: ShopModule) {
    if (expanded === mod.id) {
      setExpanded(null);
      return;
    }
    setAdvancedDraft({
      enable_dropoff: mod.enable_dropoff,
      enable_waiting: mod.enable_waiting,
      enable_headsup_30: mod.enable_headsup_30,
      enable_headsup_60: mod.enable_headsup_60,
      override_deposit: mod.override_deposit,
      deposit_amount: mod.deposit_amount ?? '',
      require_deposit: mod.require_deposit,
      deposit_refundable: mod.deposit_refundable,
      deposit_refund_hours: mod.deposit_refund_hours,
      custom_color: mod.custom_color || '',
    });
    setExpanded(mod.id);
    setSavedAdvanced(false);
  }

  function updateDraft(key: string, value: unknown) {
    setAdvancedDraft(prev => ({ ...prev, [key]: value }));
  }

  async function saveAdvanced(modId: number) {
    setSavingAdvanced(true);
    const payload: Record<string, unknown> = {
      enable_dropoff: advancedDraft.enable_dropoff,
      enable_waiting: advancedDraft.enable_waiting,
      enable_headsup_30: advancedDraft.enable_headsup_30,
      enable_headsup_60: advancedDraft.enable_headsup_60,
      override_deposit: advancedDraft.override_deposit,
      require_deposit: advancedDraft.require_deposit,
      deposit_refundable: advancedDraft.deposit_refundable,
      deposit_refund_hours: Number(advancedDraft.deposit_refund_hours) || 0,
      custom_color: (advancedDraft.custom_color as string)?.trim() || null,
    };
    if (advancedDraft.override_deposit) {
      payload.deposit_amount = advancedDraft.deposit_amount === '' ? null : Number(advancedDraft.deposit_amount);
    }
    const success = await onSave('shop_modules', modId, payload);
    if (success) {
      setSavedAdvanced(true);
      setTimeout(() => setSavedAdvanced(false), 2000);
      onRefresh();
    }
    setSavingAdvanced(false);
  }

  function renderModuleRow(mod: ShopModule) {
    const isExpanded = expanded === mod.id;
    const sm = mod.service_modules;

    if (isMobile) {
      return (
        <div key={mod.id}>
          <div style={{
            padding: `${SPACING.md}px 0`,
            borderBottom: isExpanded ? 'none' : `1px solid ${COLORS.border}`,
            opacity: mod.enabled ? 1 : 0.5,
            transition: 'opacity 0.15s',
          }}>
            {/* Row 1: dot + checkbox + module name + advanced button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: mod.enabled ? SPACING.sm : 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: mod.custom_color || sm.color,
              }} />
              <input
                type="checkbox"
                checked={mod.enabled}
                onChange={() => handleToggleEnabled(mod)}
                style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{
                fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                color: COLORS.textPrimary, flex: 1, minWidth: 0,
              }}>
                {sm.label}
              </span>
              {mod.enabled && (
                <button
                  onClick={() => openAdvanced(mod)}
                  style={{
                    background: isExpanded ? COLORS.activeBg : 'rgba(255,255,255,0.06)',
                    color: isExpanded ? COLORS.red : COLORS.textMuted,
                    border: `1px solid ${isExpanded ? COLORS.red : 'transparent'}`,
                    borderRadius: RADIUS.sm, padding: '4px 10px',
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <ChevronIcon open={isExpanded} />
                </button>
              )}
            </div>
            {/* Rows 2-4: pricing label, online mode, brand -- stacked vertically */}
            {mod.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, paddingLeft: 36 }}>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                  {PRICING_MODEL_LABELS[sm.pricing_model] || sm.pricing_model}
                </span>
                <SelectInput
                  value={mod.online_mode}
                  onChange={e => handleOnlineModeChange(mod, e.target.value)}
                  style={{ width: '100%', minHeight: 34, padding: '4px 32px 4px 10px', fontSize: FONT.sizeSm }}
                >
                  {ONLINE_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </SelectInput>
                <SelectInput
                  value={mod.brand_id ?? ''}
                  onChange={e => handleBrandChange(mod, e.target.value)}
                  style={{ width: '100%', minHeight: 34, padding: '4px 32px 4px 10px', fontSize: FONT.sizeSm }}
                >
                  <option value="">No Brand</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </SelectInput>
              </div>
            )}
          </div>

          {/* Advanced settings panel (mobile) */}
          {isExpanded && mod.enabled && renderAdvancedPanel(mod, sm)}
        </div>
      );
    }

    // Desktop layout
    return (
      <div key={mod.id}>
        {/* Main row -- CSS grid matching header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '10px 18px 1fr 90px 150px 160px auto',
          alignItems: 'center',
          gap: SPACING.md,
          padding: `${SPACING.md}px 0`,
          borderBottom: isExpanded ? 'none' : `1px solid ${COLORS.border}`,
          opacity: mod.enabled ? 1 : 0.5,
          transition: 'opacity 0.15s',
        }}>
          {/* Colored dot */}
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: mod.custom_color || sm.color,
          }} />

          {/* Enable toggle */}
          <input
            type="checkbox"
            checked={mod.enabled}
            onChange={() => handleToggleEnabled(mod)}
            style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer' }}
          />

          {/* Label */}
          <span style={{
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            color: COLORS.textPrimary,
          }}>
            {sm.label}
          </span>

          {/* Pricing model */}
          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
            {PRICING_MODEL_LABELS[sm.pricing_model] || sm.pricing_model}
          </span>

          {/* Online mode dropdown (or empty cell) */}
          <div>
            {mod.enabled && (
              <SelectInput
                value={mod.online_mode}
                onChange={e => handleOnlineModeChange(mod, e.target.value)}
                style={{ width: '100%', minHeight: 34, padding: '4px 32px 4px 10px', fontSize: FONT.sizeSm }}
              >
                {ONLINE_MODE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SelectInput>
            )}
          </div>

          {/* Brand assignment (or empty cell) */}
          <div>
            {mod.enabled && (
              <SelectInput
                value={mod.brand_id ?? ''}
                onChange={e => handleBrandChange(mod, e.target.value)}
                style={{ width: '100%', minHeight: 34, padding: '4px 32px 4px 10px', fontSize: FONT.sizeSm }}
              >
                <option value="">No Brand</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </SelectInput>
            )}
          </div>

          {/* Status badge + Advanced (or empty cell) */}
          {mod.enabled ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
              <StatusBadge
                label={ONLINE_MODE_OPTIONS.find(o => o.value === mod.online_mode)?.label || mod.online_mode}
                variant={ONLINE_MODE_VARIANT[mod.online_mode]}
              />

              {/* Expand advanced */}
              <button
                onClick={() => openAdvanced(mod)}
                style={{
                  background: isExpanded ? COLORS.activeBg : 'rgba(255,255,255,0.06)',
                  color: isExpanded ? COLORS.red : COLORS.textMuted,
                  border: `1px solid ${isExpanded ? COLORS.red : 'transparent'}`,
                  borderRadius: RADIUS.sm, padding: '4px 10px',
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                Advanced
                <ChevronIcon open={isExpanded} />
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Advanced settings panel (desktop) */}
        {isExpanded && mod.enabled && renderAdvancedPanel(mod, sm)}
      </div>
    );
  }

  function renderAdvancedPanel(mod: ShopModule, sm: ShopModule['service_modules']) {
    return (
      <div style={{
        padding: isMobile ? SPACING.md : SPACING.lg, margin: `0 0 ${SPACING.sm}px`,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: `0 0 ${RADIUS.lg}px ${RADIUS.lg}px`,
      }}>
        {/* Module Color */}
        <div style={{ marginBottom: SPACING.xl }}>
          <div style={{
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            color: COLORS.textPrimary, marginBottom: SPACING.md,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Module Color
          </div>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: SPACING.lg, flexDirection: isMobile ? 'column' : 'row' }}>
            <ColorPicker
              value={(advancedDraft.custom_color as string) || sm.color}
              onChange={hex => updateDraft('custom_color', hex)}
              label="Color"
              desc="Used on appointment cards, timeline, and badges"
            />
            {!!advancedDraft.custom_color && (
              <button
                onClick={() => updateDraft('custom_color', '')}
                style={{
                  padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                  color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                }}
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>

        {/* Appointment Types */}
        <div style={{ marginBottom: SPACING.xl }}>
          <div style={{
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            color: COLORS.textPrimary, marginBottom: SPACING.md,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Appointment Types
          </div>
          <div style={{ display: 'flex', gap: isMobile ? SPACING.md : SPACING.xl, flexWrap: 'wrap' }}>
            {([
              { key: 'enable_dropoff', label: 'Drop-off' },
              { key: 'enable_waiting', label: 'Waiting' },
              { key: 'enable_headsup_30', label: 'Heads-Up 30 min' },
              { key: 'enable_headsup_60', label: 'Heads-Up 60 min' },
            ] as const).map(item => (
              <label key={item.key} style={{
                display: 'flex', alignItems: 'center', gap: SPACING.sm,
                cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
              }}>
                <input
                  type="checkbox"
                  checked={!!advancedDraft[item.key]}
                  onChange={e => updateDraft(item.key, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        {/* Deposit Override */}
        <div style={{ marginBottom: SPACING.lg }}>
          <div style={{
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            color: COLORS.textPrimary, marginBottom: SPACING.md,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Deposit Override
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: SPACING.sm,
            cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
            marginBottom: SPACING.md,
          }}>
            <input
              type="checkbox"
              checked={!!advancedDraft.override_deposit}
              onChange={e => updateDraft('override_deposit', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }}
            />
            Override shop-level deposit settings for this module
          </label>

          {!!advancedDraft.override_deposit && (
            <div style={{
              display: 'flex', gap: isMobile ? SPACING.md : SPACING.lg, flexWrap: 'wrap', alignItems: 'center',
              padding: SPACING.md,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
            }}>
              {/* Deposit amount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Amount $</span>
                <input
                  type="number"
                  value={advancedDraft.deposit_amount as string | number}
                  onChange={e => updateDraft('deposit_amount', e.target.value)}
                  placeholder="0"
                  style={{
                    width: 80, background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                    padding: '6px 10px', fontSize: FONT.sizeSm, textAlign: 'center',
                  }}
                />
              </div>

              {/* Require deposit */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: SPACING.sm,
                cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
              }}>
                <input
                  type="checkbox"
                  checked={!!advancedDraft.require_deposit}
                  onChange={e => updateDraft('require_deposit', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }}
                />
                Required
              </label>

              {/* Refundable */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: SPACING.sm,
                cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
              }}>
                <input
                  type="checkbox"
                  checked={!!advancedDraft.deposit_refundable}
                  onChange={e => updateDraft('deposit_refundable', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }}
                />
                Refundable
              </label>

              {/* Refund hours */}
              {!!advancedDraft.deposit_refundable && (
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Refund window</span>
                  <input
                    type="number"
                    value={advancedDraft.deposit_refund_hours as number}
                    onChange={e => updateDraft('deposit_refund_hours', e.target.value)}
                    style={{
                      width: 60, background: COLORS.inputBg, color: COLORS.textPrimary,
                      border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                      padding: '6px 10px', fontSize: FONT.sizeSm, textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>hrs before appt</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => saveAdvanced(mod.id)}
            disabled={savingAdvanced}
            style={savedAdvanced ? { background: '#22c55e', borderColor: '#22c55e' } : {}}
          >
            {savingAdvanced ? 'Saving...' : savedAdvanced ? 'Saved' : 'Save Settings'}
          </Button>
        </div>
      </div>
    );
  }

  if (shopModules.length === 0) {
    return (
      <DashboardCard title="Service Modules">
        <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
          No service modules configured. Modules are assigned from the platform catalog.
        </div>
      </DashboardCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {sortedCategories.map(category => (
        <DashboardCard key={category} title={CATEGORY_LABELS[category] || category}>
          {/* Column header row -- hidden on mobile, CSS grid on desktop */}
          {!isMobile && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '10px 18px 1fr 90px 150px 160px auto',
              alignItems: 'center',
              gap: SPACING.md,
              padding: `${SPACING.sm}px 0`,
              borderBottom: `1px solid ${COLORS.border}`,
            }}>
              <div />
              <div />
              <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Module</span>
              <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pricing</span>
              <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Online Mode</span>
              <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Brand</span>
              <div />
            </div>
          )}
          {grouped[category].map(mod => renderModuleRow(mod))}
        </DashboardCard>
      ))}
    </div>
  );
}
