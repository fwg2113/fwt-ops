'use client';

import { useState, useEffect, useCallback } from 'react';
import { COLORS, RADIUS, SPACING, FONT } from '@/app/components/dashboard/theme';
import Modal from '@/app/components/dashboard/Modal';

interface TinterRow {
  teamMemberId: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  outRanges: Array<{ out_at: string; back_at: string; reason: string }>;
}

interface Props {
  selectedDate: string;
  onConfirmed: () => void;
}

export default function DailyTinterModal({ selectedDate, onConfirmed }: Props) {
  const [tinters, setTinters] = useState<TinterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shopOpenTime, setShopOpenTime] = useState('07:00');
  const [shopCloseTime, setShopCloseTime] = useState('17:00');

  const dateDisplay = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto/bandwidth/daily?date=${selectedDate}`);
      const data = await res.json();
      if (!data.enabled) { onConfirmed(); return; }

      // If already confirmed, skip
      if (data.isConfirmed) { onConfirmed(); return; }

      // Build tinter rows from defaults + any existing availability
      const rows: TinterRow[] = [];
      const defaultTinters = data.defaultTinters || [];
      const existing = data.availability || [];

      for (const t of defaultTinters) {
        const ex = existing.find((a: { teamMemberId: string }) => a.teamMemberId === t.id);
        rows.push({
          teamMemberId: t.id,
          name: t.name,
          status: ex?.status || 'full_day',
          startTime: ex?.startTime || shopOpenTime,
          endTime: ex?.endTime || shopCloseTime,
          outRanges: ex?.outRanges || [],
        });
      }

      setTinters(rows);
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedDate, onConfirmed, shopOpenTime, shopCloseTime]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function updateTinter(idx: number, updates: Partial<TinterRow>) {
    setTinters(prev => prev.map((t, i) => i === idx ? { ...t, ...updates } : t));
  }

  function addOutRange(idx: number) {
    setTinters(prev => prev.map((t, i) => i === idx ? {
      ...t, outRanges: [...t.outRanges, { out_at: '10:00', back_at: '12:00', reason: '' }],
    } : t));
  }

  function updateOutRange(tinterIdx: number, rangeIdx: number, updates: Partial<{ out_at: string; back_at: string; reason: string }>) {
    setTinters(prev => prev.map((t, i) => i === tinterIdx ? {
      ...t, outRanges: t.outRanges.map((r, j) => j === rangeIdx ? { ...r, ...updates } : r),
    } : t));
  }

  function removeOutRange(tinterIdx: number, rangeIdx: number) {
    setTinters(prev => prev.map((t, i) => i === tinterIdx ? {
      ...t, outRanges: t.outRanges.filter((_, j) => j !== rangeIdx),
    } : t));
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch('/api/auto/bandwidth/confirm-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          tinters: tinters.map(t => ({
            teamMemberId: t.teamMemberId,
            status: t.status,
            startTime: t.status === 'partial' ? t.startTime : null,
            endTime: t.status === 'partial' ? t.endTime : null,
            outRanges: t.outRanges,
          })),
        }),
      });
      if (res.ok) onConfirmed();
    } catch { /* silent */ }
    setSaving(false);
  }

  const activeTinters = tinters.filter(t => t.status !== 'off');

  const statusColors: Record<string, string> = {
    full_day: '#22c55e',
    partial: '#f59e0b',
    off: '#ef4444',
  };

  if (loading) return null;

  return (
    <Modal title={`Who's Tinting? -- ${dateDisplay}`} onClose={onConfirmed} width={560}>
      <div style={{ marginBottom: SPACING.lg }}>
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
          Confirm who is tinting today. This determines available capacity for scheduling.
        </div>

        {tinters.map((t, idx) => (
          <div key={t.teamMemberId} style={{
            padding: SPACING.md, marginBottom: SPACING.sm,
            background: COLORS.inputBg, borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.borderInput}`,
          }}>
            {/* Name + status toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.status !== 'full_day' ? SPACING.sm : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: statusColors[t.status],
                }} />
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                  {t.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['full_day', 'partial', 'off'] as Array<'full_day' | 'partial' | 'off'>).map(s => (
                  <button
                    key={s}
                    onClick={() => updateTinter(idx, { status: s })}
                    style={{
                      padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                      background: t.status === s ? `${statusColors[s]}20` : 'transparent',
                      border: `1px solid ${t.status === s ? statusColors[s] : COLORS.borderInput}`,
                      color: t.status === s ? statusColors[s] : COLORS.textMuted,
                      fontSize: FONT.sizeXs, fontWeight: t.status === s ? 700 : 500,
                    }}
                  >
                    {s === 'full_day' ? 'Full Day' : s === 'partial' ? 'Partial' : 'Off'}
                  </button>
                ))}
              </div>
            </div>

            {/* Partial: time range */}
            {t.status === 'partial' && (
              <div style={{ marginTop: SPACING.sm }}>
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', marginBottom: SPACING.sm }}>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, width: 50 }}>From</span>
                  <input type="time" value={t.startTime} onChange={e => updateTinter(idx, { startTime: e.target.value })}
                    style={{ padding: '4px 8px', borderRadius: RADIUS.sm, background: COLORS.cardBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeSm }} />
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>to</span>
                  <input type="time" value={t.endTime} onChange={e => updateTinter(idx, { endTime: e.target.value })}
                    style={{ padding: '4px 8px', borderRadius: RADIUS.sm, background: COLORS.cardBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeSm }} />
                </div>
              </div>
            )}

            {/* Out ranges (for full_day or partial) */}
            {t.status !== 'off' && (
              <div style={{ marginTop: t.outRanges.length > 0 ? SPACING.sm : 0 }}>
                {t.outRanges.map((r, rIdx) => (
                  <div key={rIdx} style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: FONT.sizeXs, color: '#f59e0b', fontWeight: 600 }}>Out</span>
                    <input type="time" value={r.out_at} onChange={e => updateOutRange(idx, rIdx, { out_at: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: RADIUS.sm, background: COLORS.cardBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeXs, width: 100 }} />
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>back</span>
                    <input type="time" value={r.back_at} onChange={e => updateOutRange(idx, rIdx, { back_at: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: RADIUS.sm, background: COLORS.cardBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeXs, width: 100 }} />
                    <input type="text" value={r.reason} onChange={e => updateOutRange(idx, rIdx, { reason: e.target.value })}
                      placeholder="Reason (optional)" style={{ flex: 1, minWidth: 120, padding: '4px 8px', borderRadius: RADIUS.sm, background: COLORS.cardBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeXs }} />
                    <button onClick={() => removeOutRange(idx, rIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 2 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
                {t.status !== 'off' && (
                  <button onClick={() => addOutRange(idx)} style={{
                    padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                    background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
                    color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add out-of-shop time
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary + confirm */}
      <div style={{
        padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.borderInput}`, marginBottom: SPACING.lg,
      }}>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
          {activeTinters.length} tinter{activeTinters.length !== 1 ? 's' : ''} on site
          {activeTinters.length > 0 && `: ${activeTinters.map(t => t.name).join(', ')}`}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleConfirm}
          disabled={saving}
          style={{
            padding: `${SPACING.md}px ${SPACING.xxl}px`, borderRadius: RADIUS.md,
            background: COLORS.red, color: '#fff', border: 'none',
            cursor: 'pointer', fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
          }}
        >
          {saving ? 'Confirming...' : 'Confirm & Open Schedule'}
        </button>
      </div>
    </Modal>
  );
}
