'use client';

import { useState } from 'react';
import { DashboardCard, Button, ColorPicker } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS, buildColors } from '@/app/components/dashboard/theme';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function AppearanceTab({ data, onSave, onRefresh }: Props) {
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // External theme (customer-facing: booking page, film cards)
  const [extPrimary, setExtPrimary] = useState(String(config.theme_ext_primary || '#d61f26'));
  const [extSecondary, setExtSecondary] = useState(String(config.theme_ext_secondary || '#1a1a1a'));
  const [extAccent, setExtAccent] = useState(String(config.theme_ext_accent || '#d61f26'));
  const [extBackground, setExtBackground] = useState(String(config.theme_ext_background || '#ffffff'));

  // Internal theme (dashboard: sidebar, cards, buttons) — 5 inputs
  const [intPrimary, setIntPrimary] = useState(String(config.theme_int_primary || '#dc2626'));
  const [intAccent, setIntAccent] = useState(String(config.theme_int_accent || '#f59e0b'));
  const [intBackground, setIntBackground] = useState(String(config.theme_int_background || '#111111'));
  const [intSurface, setIntSurface] = useState(String(config.theme_int_surface || '#1a1a1a'));
  const [intText, setIntText] = useState(String(config.theme_int_text || '#f1f5f9'));

  // Custom saved preset
  const savedCustom = config.theme_int_custom as { primary: string; accent: string; background: string; surface: string; text: string } | null;
  const [customPreset, setCustomPreset] = useState(savedCustom);
  const [customSaved, setCustomSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      theme_ext_primary: extPrimary, theme_ext_secondary: extSecondary,
      theme_ext_accent: extAccent, theme_ext_background: extBackground,
      theme_int_primary: intPrimary, theme_int_accent: intAccent,
      theme_int_background: intBackground, theme_int_surface: intSurface,
      theme_int_text: intText,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Customer Facing Theme */}
      <DashboardCard title="Customer Facing Theme" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><circle cx="12" cy="12" r="4"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Colors your customers see on the booking page, film cards, buttons, and badges.
        </div>
        <div style={{ display: 'flex', gap: SPACING.xxl, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
            <ColorPicker value={extPrimary} onChange={setExtPrimary} label="Primary" desc="Buttons, selected states, card borders" />
            <ColorPicker value={extSecondary} onChange={setExtSecondary} label="Secondary" desc="Headings, film names, strong text" />
            <ColorPicker value={extAccent} onChange={setExtAccent} label="Accent" desc="Badges, highlights, hover effects" />
            <ColorPicker value={extBackground} onChange={setExtBackground} label="Background" desc="Page and card backgrounds" />
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
              Preview — Booking Page
            </div>
            <div style={{ background: extBackground, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}`, minHeight: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: extSecondary, marginBottom: 12 }}>Choose Your Film</div>
              <div style={{ border: `3px solid ${extPrimary}`, borderRadius: 16, padding: 14, background: extBackground, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Best</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: extSecondary }}>Ceramic Pro</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: extPrimary }}>93<span style={{ fontSize: 10 }}>%</span></div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#999', textTransform: 'uppercase' }}>IR</div>
                </div>
              </div>
              <div style={{ border: '2px solid #d0d0d0', borderRadius: 16, padding: 14, background: extBackground, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.6 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Good</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: extSecondary }}>Standard</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: extPrimary }}>45<span style={{ fontSize: 10 }}>%</span></div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#999', textTransform: 'uppercase' }}>IR</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ background: extPrimary, color: '#fff', padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>Book Now</div>
                <div style={{ background: extAccent, color: '#fff', padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Most Popular</div>
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      {/* Internal Theme */}
      {(() => {
        // Compute preview colors from current picker state
        const p = buildColors({ primary: intPrimary, accent: intAccent, background: intBackground, surface: intSurface, text: intText });
        return (
          <DashboardCard title="Internal Dashboard Theme" icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
            </svg>
          }>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              Colors your team sees on the dashboard, sidebar, and internal tools.
            </div>

            {/* Preset themes */}
            <div style={{ marginBottom: SPACING.xl }}>
              <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                Quick Presets
              </div>
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                {([
                  { name: 'Crimson', primary: '#dc2626', accent: '#f59e0b', background: '#111111', surface: '#1a1a1a', text: '#f1f5f9' },
                  { name: 'Ocean', primary: '#2563eb', accent: '#06b6d4', background: '#0c1222', surface: '#152038', text: '#e2e8f0' },
                  { name: 'Garage', primary: '#ef4444', accent: '#a1a1aa', background: '#09090b', surface: '#18181b', text: '#fafafa' },
                  { name: 'Showroom', primary: '#dc2626', accent: '#71717a', background: '#f4f4f5', surface: '#ffffff', text: '#18181b' },
                  { name: 'Midnight', primary: '#f97316', accent: '#eab308', background: '#0a0a0a', surface: '#171717', text: '#fafafa' },
                  { name: '3M', primary: '#FF0000', accent: '#CC0000', background: '#1A1A1A', surface: '#2a2a2a', text: '#FFFFFF' },
                  { name: 'LLumar', primary: '#003087', accent: '#00A0DF', background: '#222222', surface: '#2e2e2e', text: '#FFFFFF' },
                  { name: 'XPEL', primary: '#C8102E', accent: '#333333', background: '#000000', surface: '#111111', text: '#FFFFFF' },
                  { name: 'SunTek', primary: '#F47920', accent: '#CC5E00', background: '#1C1C1C', surface: '#2c2c2c', text: '#FFFFFF' },
                  { name: 'AutoBahn', primary: '#8B0000', accent: '#9E9E9E', background: '#0D0D0D', surface: '#1a1a1a', text: '#FFFFFF' },
                  { name: 'Solar Gard', primary: '#E8A020', accent: '#C47F00', background: '#1B2A3B', surface: '#2a3d52', text: '#FFFFFF' },
                  { name: 'FormulaOne', primary: '#E5001B', accent: '#C0C0C0', background: '#141414', surface: '#222222', text: '#FFFFFF' },
                  { name: 'Madico', primary: '#007B8F', accent: '#005566', background: '#2C2C2C', surface: '#3a3a3a', text: '#E8E8E8' },
                  { name: 'Huper Optik', primary: '#002D72', accent: '#004BAD', background: '#1A1A2E', surface: '#262640', text: '#FFFFFF' },
                  { name: 'Johnson WF', primary: '#2E7D32', accent: '#757575', background: '#212121', surface: '#2e2e2e', text: '#FFFFFF' },
                  ...(customPreset ? [{ name: 'My Custom', ...customPreset }] : []),
                ] as Array<{ name: string; primary: string; accent: string; background: string; surface: string; text: string }>).map(preset => {
                  const isActive = intPrimary === preset.primary && intBackground === preset.background && intAccent === preset.accent;
                  return (
                    <button key={preset.name} onClick={() => {
                      setIntPrimary(preset.primary);
                      setIntAccent(preset.accent);
                      setIntBackground(preset.background);
                      setIntSurface(preset.surface);
                      setIntText(preset.text);
                    }} style={{
                      padding: '8px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                      border: `2px solid ${isActive ? preset.primary : COLORS.borderInput}`,
                      background: isActive ? `${preset.primary}15` : COLORS.inputBg,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}>
                      {/* Color dots preview */}
                      <div style={{ display: 'flex', gap: 3 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: preset.background, border: '1px solid rgba(255,255,255,0.15)' }} />
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: preset.primary }} />
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: preset.accent }} />
                      </div>
                      <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: isActive ? preset.primary : COLORS.textMuted }}>
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Save as custom / clear custom */}
              <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center' }}>
                <button onClick={async () => {
                  const custom = { primary: intPrimary, accent: intAccent, background: intBackground, surface: intSurface, text: intText };
                  setCustomPreset(custom);
                  await onSave('shop_config', null, { theme_int_custom: custom });
                  setCustomSaved(true);
                  setTimeout(() => setCustomSaved(false), 2000);
                  onRefresh();
                }} style={{
                  padding: '6px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                  background: customSaved ? 'rgba(34,197,94,0.1)' : COLORS.inputBg,
                  color: customSaved ? '#22c55e' : COLORS.textMuted,
                  border: `1px dashed ${customSaved ? '#22c55e' : COLORS.borderInput}`,
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                    {customSaved
                      ? <polyline points="20 6 9 17 4 12"/>
                      : <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></>
                    }
                  </svg>
                  {customSaved ? 'Saved' : 'Save as My Custom'}
                </button>
                {customPreset && (
                  <button onClick={async () => {
                    setCustomPreset(null);
                    await onSave('shop_config', null, { theme_int_custom: null });
                    onRefresh();
                  }} style={{
                    padding: '6px 10px', borderRadius: RADIUS.lg, cursor: 'pointer',
                    background: 'transparent', color: COLORS.textMuted,
                    border: `1px solid ${COLORS.borderInput}`,
                    fontSize: FONT.sizeXs,
                  }}>
                    Clear Custom
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: SPACING.xxl, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
                <ColorPicker value={intPrimary} onChange={setIntPrimary} label="Primary" desc="Active states, toggles, action buttons" />
                <ColorPicker value={intAccent} onChange={setIntAccent} label="Accent" desc="Sidebar borders, section highlights" />
                <ColorPicker value={intBackground} onChange={setIntBackground} label="Background" desc="Page and sidebar background" />
                <ColorPicker value={intSurface} onChange={setIntSurface} label="Surface" desc="Cards, panels, input fields" />
                <ColorPicker value={intText} onChange={setIntText} label="Text" desc="Primary text and labels" />
              </div>

              {/* Preview — Accurate dashboard mockup */}
              <div style={{ flex: '1 1 360px' }}>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                  Preview — Dashboard
                </div>
                <div style={{ background: p.pageBg, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: 'hidden', display: 'flex', minHeight: 240 }}>
                  {/* Sidebar mock */}
                  <div style={{
                    width: 72, borderRight: `1px solid ${p.borderAccent}`,
                    padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 6,
                    background: p.pageBg, flexShrink: 0,
                  }}>
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${p.borderAccent}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: p.red, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 7, fontWeight: 700, color: p.textPrimary, lineHeight: 1.1 }}>
                          Shop <span style={{ color: p.red }}>Name</span>
                        </div>
                        <div style={{ fontSize: 5, color: p.textMuted }}>Ops Hub</div>
                      </div>
                    </div>
                    {/* Nav items */}
                    <div style={{ fontSize: 6, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>Core</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 5, background: p.activeBg, borderLeft: `2px solid ${p.red}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: p.red, opacity: 0.8 }} />
                      <span style={{ fontSize: 7, fontWeight: 600, color: p.red }}>Command Center</span>
                    </div>
                    <div style={{ fontSize: 6, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 6, marginBottom: 2 }}>Auto</div>
                    {['Appointments', 'Inventory', 'Roll IDs'].map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, border: `1px solid ${p.textMuted}`, opacity: 0.3 }} />
                        <span style={{ fontSize: 7, color: p.textMuted }}>{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* Main content — Command Center mock */}
                  <div style={{ flex: 1, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: p.textPrimary, marginBottom: 8 }}>
                      Command <span style={{ color: p.red }}>Center</span>
                    </div>

                    {/* Stat cards row */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {[
                        { label: "Today's Appts", value: '6', color: p.red },
                        { label: 'Waiting', value: '2', color: p.yellowSolid },
                        { label: 'Revenue', value: '$1,840', color: p.textPrimary },
                      ].map(stat => (
                        <div key={stat.label} style={{
                          flex: 1, background: p.cardBg, borderRadius: 8, padding: '8px 6px',
                          border: `1px solid ${p.border}`,
                        }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                          <div style={{ fontSize: 6, color: p.textMuted, marginTop: 2 }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Appointment cards */}
                    <div style={{ fontSize: 8, fontWeight: 700, color: p.textTertiary, textTransform: 'uppercase', marginBottom: 4 }}>Schedule</div>
                    {[
                      { car: '2024 Tesla Model 3', svc: 'Full Sides + Windshield', status: 'In Progress', statusBg: p.red },
                      { car: '2023 BMW X5', svc: '2 Front Doors', status: 'Scheduled', statusBg: p.yellowSolid },
                    ].map(apt => (
                      <div key={apt.car} style={{
                        background: p.cardBg, borderRadius: 6, padding: '6px 8px', marginBottom: 4,
                        border: `1px solid ${p.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontSize: 8, fontWeight: 700, color: p.textPrimary }}>{apt.car}</div>
                          <div style={{ fontSize: 6, color: p.textMuted }}>{apt.svc}</div>
                        </div>
                        <div style={{
                          background: apt.statusBg, color: '#fff',
                          padding: '2px 6px', borderRadius: 999, fontSize: 6, fontWeight: 700,
                        }}>
                          {apt.status}
                        </div>
                      </div>
                    ))}

                    {/* Action button */}
                    <div style={{ marginTop: 6 }}>
                      <div style={{ background: p.red, color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 8, fontWeight: 700, display: 'inline-block' }}>
                        Check In
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DashboardCard>
        );
      })()}

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.md }}>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Appearance'}
        </Button>
      </div>
    </div>
  );
}
