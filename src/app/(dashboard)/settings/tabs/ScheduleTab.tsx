'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface ScheduleDay {
  id: number; day_of_week: string; enabled: boolean;
  open_time: string | null; close_time: string | null;
  max_dropoff: number; max_waiting: number; max_headsup: number;
}

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onAdd: (table: string, data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDelete: (table: string, id: number) => Promise<boolean>;
  onRefresh: () => void;
}

export default function ScheduleTab({ data, onSave, onAdd, onDelete, onRefresh }: Props) {
  const schedule = (data.schedule || []) as ScheduleDay[];
  const config = (data.shopConfig || {}) as Record<string, unknown>;
  const [saving, setSaving] = useState<string | null>(null);
  const [localSchedule, setLocalSchedule] = useState(schedule);

  // Appointment type colors
  const defaultTypeColors: Record<string, string> = { dropoff: '#3b82f6', waiting: '#ef4444', headsup_30: '#f59e0b', headsup_60: '#f59e0b' };
  const [typeColors, setTypeColors] = useState<Record<string, string>>(() => {
    const saved = config.appointment_type_colors as Record<string, string> | null;
    return { ...defaultTypeColors, ...saved };
  });
  const [savingColors, setSavingColors] = useState(false);
  const [savedColors, setSavedColors] = useState(false);

  async function saveTypeColors() {
    setSavingColors(true);
    await onSave('shop_config', null, { appointment_type_colors: typeColors });
    setSavingColors(false);
    setSavedColors(true);
    setTimeout(() => setSavedColors(false), 2000);
    onRefresh();
  }

  function updateDay(id: number, field: string, value: unknown) {
    setLocalSchedule(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  }

  async function saveDay(day: ScheduleDay) {
    setSaving(day.day_of_week);
    await onSave('auto_schedule', day.id, {
      enabled: day.enabled,
      open_time: day.open_time,
      close_time: day.close_time,
      max_dropoff: day.max_dropoff,
      max_waiting: day.max_waiting,
      max_headsup: day.max_headsup,
    });
    setSaving(null);
    onRefresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      <DashboardCard title="Weekly Schedule">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
            <thead>
              <tr>
                {['Day', 'Enabled', 'Open', 'Close', 'Max Drop-Off', 'Max Waiting', 'Max Heads-Up', ''].map(h => (
                  <th key={h} style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, textAlign: 'left',
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localSchedule.map(day => (
                <tr key={day.id} style={{ opacity: day.enabled ? 1 : 0.5 }}>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, borderBottom: `1px solid ${COLORS.border}` }}>
                    {day.day_of_week}
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="checkbox" checked={day.enabled} onChange={e => updateDay(day.id, 'enabled', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="time" value={day.open_time || ''} onChange={e => updateDay(day.id, 'open_time', e.target.value)}
                      style={{ background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="time" value={day.close_time || ''} onChange={e => updateDay(day.id, 'close_time', e.target.value)}
                      style={{ background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="number" value={day.max_dropoff} onChange={e => updateDay(day.id, 'max_dropoff', parseInt(e.target.value) || 0)}
                      style={{ width: 60, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm, textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="number" value={day.max_waiting} onChange={e => updateDay(day.id, 'max_waiting', parseInt(e.target.value) || 0)}
                      style={{ width: 60, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm, textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <input type="number" value={day.max_headsup} onChange={e => updateDay(day.id, 'max_headsup', parseInt(e.target.value) || 0)}
                      style={{ width: 60, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm, textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                    <Button variant="secondary" size="sm" onClick={() => saveDay(day)} disabled={saving === day.day_of_week}
                      style={saving === day.day_of_week ? { background: '#22c55e20', borderColor: '#22c55e', color: '#22c55e' } : {}}>
                      {saving === day.day_of_week ? 'Saved' : 'Save'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard title="Appointment Type Colors">
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
          Customize the left block color on appointment cards for each type.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: SPACING.md }}>
          {[
            { key: 'dropoff', label: 'Drop-Off' },
            { key: 'waiting', label: 'Waiting' },
            { key: 'headsup_30', label: 'Heads-Up (30m)' },
            { key: 'headsup_60', label: 'Heads-Up (60m)' },
          ].map(type => (
            <div key={type.key} style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
              <input
                type="color"
                value={typeColors[type.key] || '#6b7280'}
                onChange={e => setTypeColors(prev => ({ ...prev, [type.key]: e.target.value }))}
                style={{ width: 36, height: 36, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, cursor: 'pointer', background: 'none', padding: 2 }}
              />
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{type.label}</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>{typeColors[type.key]}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.lg }}>
          <Button variant="primary" onClick={saveTypeColors} disabled={savingColors}
            style={savedColors ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
            {savingColors ? 'Saving...' : savedColors ? 'Saved' : 'Save Colors'}
          </Button>
        </div>
      </DashboardCard>
    </div>
  );
}
