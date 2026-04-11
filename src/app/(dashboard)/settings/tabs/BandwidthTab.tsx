'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardCard, Button, SelectInput, TextInput, FormField } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown> | null;
  onSave: (table: string, id: number | null, updates: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

interface ServiceRow {
  service_key: string;
  label: string;
  duration_minutes: number;
  max_tinters: number;
  enabled: boolean;
}

interface ScalingRow {
  id?: number;
  service_key: string;
  tinter_count: number;
  duration_minutes: number;
}

interface TeamMember {
  id: string;
  name: string;
}

export default function BandwidthTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const shopConfig = data?.shop_config as Record<string, unknown> | undefined;
  const services = ((data?.auto_services || []) as ServiceRow[]).filter(s => s.enabled);
  const teamMembers = ((data?.team_members || []) as Array<{ id: string; name: string; module_permissions: string[] }>)
    .filter(m => m.module_permissions?.includes('auto_tint'));

  const enabled = Boolean(shopConfig?.bandwidth_engine_enabled);
  const confirmationTime = (shopConfig?.bandwidth_confirmation_time as string) || '06:00';
  const defaultTinterIds = (shopConfig?.default_tinter_ids as string[]) || [];

  // Local state for scaling edits
  const [scaling, setScaling] = useState<ScalingRow[]>([]);
  const [scalingLoaded, setScalingLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Fetch scaling data
  useEffect(() => {
    fetch('/api/auto/bandwidth/daily?date=2000-01-01') // just to get scaling data
      .then(r => r.json())
      .then(d => {
        if (d.scaling) {
          setScaling(d.scaling);
          setScalingLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  // Build scaling grid: service x tinter count
  const maxTinterCount = useMemo(() => {
    return Math.max(3, ...services.map(s => s.max_tinters));
  }, [services]);

  function getScalingValue(serviceKey: string, tinterCount: number): number {
    const row = scaling.find(s => s.service_key === serviceKey && s.tinter_count === tinterCount);
    if (row) return row.duration_minutes;
    // Default: base duration for 1, empty for others
    if (tinterCount === 1) {
      const svc = services.find(s => s.service_key === serviceKey);
      return svc?.duration_minutes || 0;
    }
    return 0;
  }

  function setScalingValue(serviceKey: string, tinterCount: number, value: number) {
    setScaling(prev => {
      const idx = prev.findIndex(s => s.service_key === serviceKey && s.tinter_count === tinterCount);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], duration_minutes: value };
        return next;
      }
      return [...prev, { service_key: serviceKey, tinter_count: tinterCount, duration_minutes: value }];
    });
  }

  async function handleSaveScaling() {
    setSaving(true);
    setSaveMessage(null);
    try {
      // Save scaling rows
      const res = await fetch('/api/auto/bandwidth/save-scaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scaling: scaling.filter(s => s.duration_minutes > 0) }),
      });
      if (res.ok) {
        setSaveMessage('Saved');
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch { /* silent */ }
    setSaving(false);
  }

  async function handleToggleEnabled() {
    await onSave('shop_config', 1, { bandwidth_engine_enabled: !enabled });
    onRefresh();
  }

  async function handleSaveConfirmationTime(time: string) {
    await onSave('shop_config', 1, { bandwidth_confirmation_time: time });
  }

  async function handleToggleTinter(memberId: string) {
    const current = [...defaultTinterIds];
    const idx = current.indexOf(memberId);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(memberId);
    await onSave('shop_config', 1, { default_tinter_ids: current });
    onRefresh();
  }

  async function handleSaveMaxTinters(serviceKey: string, maxTinters: number) {
    const svc = services.find(s => s.service_key === serviceKey);
    if (!svc) return;
    // Find the service in data to get its id
    const allServices = (data?.auto_services || []) as Array<{ id: number; service_key: string }>;
    const svcRow = allServices.find(s => s.service_key === serviceKey);
    if (svcRow) {
      await onSave('auto_services', svcRow.id, { max_tinters: maxTinters });
      onRefresh();
    }
  }

  const cellStyle: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'center',
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: FONT.sizeSm,
  };

  return (
    <div>
      {/* Enable toggle */}
      <DashboardCard title="Bandwidth Engine">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg }}>
          <div>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
              Enable Bandwidth Engine
            </div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              Real-time capacity tracking based on tinter count and service durations. Enterprise feature.
            </div>
          </div>
          <button
            onClick={handleToggleEnabled}
            style={{
              padding: '8px 20px', borderRadius: RADIUS.md, cursor: 'pointer',
              background: enabled ? COLORS.success : COLORS.inputBg,
              color: enabled ? '#fff' : COLORS.textMuted,
              border: `1px solid ${enabled ? COLORS.success : COLORS.borderInput}`,
              fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
            }}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {enabled && (
          <>
            {/* Confirmation time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Daily Confirmation Time</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Team must confirm who's tinting before the schedule unlocks.</div>
              </div>
              <input
                type="time"
                value={confirmationTime}
                onChange={e => handleSaveConfirmationTime(e.target.value)}
                style={{
                  padding: '6px 12px', borderRadius: RADIUS.sm,
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`,
                  fontSize: FONT.sizeSm,
                }}
              />
            </div>

            {/* Default tinters */}
            <div style={{ marginBottom: SPACING.xl }}>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
                Default Tinters
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
                Pre-selected in the daily confirmation. Only auto tint team members shown.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.sm }}>
                {teamMembers.map(m => {
                  const isDefault = defaultTinterIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleToggleTinter(m.id)}
                      style={{
                        padding: '8px 16px', borderRadius: RADIUS.md, cursor: 'pointer',
                        background: isDefault ? 'rgba(34,197,94,0.15)' : COLORS.inputBg,
                        border: `2px solid ${isDefault ? '#22c55e' : COLORS.borderInput}`,
                        color: isDefault ? '#22c55e' : COLORS.textMuted,
                        fontSize: FONT.sizeSm, fontWeight: isDefault ? 700 : 500,
                      }}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </DashboardCard>

      {/* Duration Scaling Grid */}
      {enabled && scalingLoaded && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Service Duration Scaling">
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Set how long each service takes based on the number of tinters working on it. Leave blank if the service doesn't benefit from multiple tinters.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ ...cellStyle, textAlign: 'left', fontWeight: FONT.weightBold, color: COLORS.textPrimary, width: 200 }}>Service</th>
                    <th style={{ ...cellStyle, fontWeight: FONT.weightBold, color: COLORS.textPrimary, width: 80 }}>Max</th>
                    {Array.from({ length: maxTinterCount }, (_, i) => (
                      <th key={i} style={{ ...cellStyle, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                        {i + 1} Tinter{i > 0 ? 's' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map(svc => (
                    <tr key={svc.service_key}>
                      <td style={{ ...cellStyle, textAlign: 'left', color: COLORS.textSecondary, fontWeight: FONT.weightMedium }}>
                        {svc.label}
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          value={svc.max_tinters}
                          onChange={e => handleSaveMaxTinters(svc.service_key, parseInt(e.target.value) || 1)}
                          min={1}
                          max={10}
                          style={{
                            width: 50, textAlign: 'center', padding: '4px',
                            background: COLORS.inputBg, color: COLORS.textPrimary,
                            border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                            fontSize: FONT.sizeSm,
                          }}
                        />
                      </td>
                      {Array.from({ length: maxTinterCount }, (_, i) => {
                        const tinterCount = i + 1;
                        const value = getScalingValue(svc.service_key, tinterCount);
                        const isDisabled = tinterCount > svc.max_tinters;
                        return (
                          <td key={i} style={cellStyle}>
                            {isDisabled ? (
                              <span style={{ color: COLORS.textPlaceholder }}>--</span>
                            ) : (
                              <input
                                type="number"
                                value={value || ''}
                                onChange={e => setScalingValue(svc.service_key, tinterCount, parseInt(e.target.value) || 0)}
                                placeholder="min"
                                style={{
                                  width: 60, textAlign: 'center', padding: '4px',
                                  background: COLORS.inputBg, color: COLORS.textPrimary,
                                  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                                  fontSize: FONT.sizeSm,
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.md, gap: SPACING.sm, alignItems: 'center' }}>
              {saveMessage && <span style={{ fontSize: FONT.sizeXs, color: COLORS.success, fontWeight: 600 }}>{saveMessage}</span>}
              <Button variant="primary" onClick={handleSaveScaling} disabled={saving}>
                {saving ? 'Saving...' : 'Save Durations'}
              </Button>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* Vehicle Duration Multipliers */}
      {enabled && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Vehicle Duration Multipliers">
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Override duration for specific vehicles. A multiplier of 2.0 means the job takes twice as long. Default is 1.0 for all vehicles.
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontStyle: 'italic' }}>
              Vehicle-specific multipliers can be set in Settings &gt; Vehicles by editing individual vehicle entries. Coming soon to this tab.
            </div>
          </DashboardCard>
        </div>
      )}
    </div>
  );
}
