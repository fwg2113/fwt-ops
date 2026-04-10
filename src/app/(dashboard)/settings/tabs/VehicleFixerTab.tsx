'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface ProposedFix {
  id: string;
  vehicleId: number;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  category: string;
  issue: string;
  currentClassKeys: string[];
  proposedClassKeys: string[];
  impact: string;
  confidence: string;
}

interface MissingVehicle {
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  classKeys: string[];
}

interface FixData {
  pending: ProposedFix[];
  applied: ProposedFix[];
  dismissed: ProposedFix[];
  missingVehicles: MissingVehicle[];
  stats: { total: number; pending: number; applied: number; dismissed: number };
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  wrong_body_class: { label: 'Wrong Body Class', color: '#ef4444', icon: 'M12 9v2m0 4h.01M5.07 19h13.86c1.13 0 1.85-1.22 1.3-2.2L13.3 4.6c-.56-.98-1.96-.98-2.52 0L3.77 16.8c-.55.98.17 2.2 1.3 2.2z' },
  missing_front_door: { label: 'Missing Front Door Class', color: '#f59e0b', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  missing_add_fee: { label: 'Missing Surcharge', color: '#8b5cf6', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  wrong_front_type: { label: 'Wrong Front Door Type', color: '#3b82f6', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  missing_vehicle: { label: 'Missing Vehicle', color: '#10b981', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
};

// All possible class keys grouped by type for the editor
const FRONT_KEYS = ['FRONT2', 'FRONT2_Q'];
const BODY_KEYS = ['STD_CAB', 'CREW_CAB', '57_CAR', '911_CAR', '57_SUV', '911_SUV', 'FULL_SUV_VAN', 'MD3_HALF', 'MD3_FULL', 'LUCID_AIR'];
const FEE_KEYS = ['ADD_FEE_25', 'ADD_FEE_50', 'ADD_FEE_75', 'ADD_FEE_100'];

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'High Confidence', color: '#22c55e' },
  medium: { label: 'Medium', color: '#f59e0b' },
  needs_review: { label: 'Needs Review', color: '#ef4444' },
};

function ClassKeyPill({ ck, isNew, isRemoved }: { ck: string; isNew?: boolean; isRemoved?: boolean }) {
  const isAddFee = ck.startsWith('ADD_FEE');
  const bg = isRemoved ? 'rgba(239,68,68,0.15)' : isNew ? 'rgba(34,197,94,0.15)' : isAddFee ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.08)';
  const border = isRemoved ? 'rgba(239,68,68,0.4)' : isNew ? 'rgba(34,197,94,0.4)' : isAddFee ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.12)';
  const color = isRemoved ? '#ef4444' : isNew ? '#22c55e' : isAddFee ? '#a78bfa' : COLORS.textPrimary;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: RADIUS.sm,
      fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.03em',
      background: bg, border: `1px solid ${border}`, color,
      textDecoration: isRemoved ? 'line-through' : 'none',
    }}>
      {isNew && '+ '}{isRemoved && '- '}{ck}
    </span>
  );
}

export default function VehicleFixerTab() {
  const [data, setData] = useState<FixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'needs_review'>('all');
  const [showApplied, setShowApplied] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  // Per-fix editing state: fixId -> custom class keys array
  const [editing, setEditing] = useState<Record<string, string[]>>({});

  function startEditing(fix: ProposedFix) {
    setEditing(prev => ({ ...prev, [fix.id]: [...fix.proposedClassKeys] }));
  }
  function stopEditing(fixId: string) {
    setEditing(prev => { const n = { ...prev }; delete n[fixId]; return n; });
  }
  function toggleEditKey(fixId: string, key: string) {
    setEditing(prev => {
      const current = prev[fixId] || [];
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...prev, [fixId]: next };
    });
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auto/settings/vehicle-fixes');
      const d = await res.json();
      setData(d);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAction(fixId: string, action: 'apply' | 'dismiss') {
    setApplying(fixId);
    try {
      const payload: Record<string, unknown> = { fixId, action };
      // If user edited the class keys, send the custom override
      if (action === 'apply' && editing[fixId]) {
        payload.customClassKeys = editing[fixId];
      }
      await fetch('/api/auto/settings/vehicle-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      stopEditing(fixId);
      await loadData();
    } catch { /* silent */ }
    setApplying(null);
  }

  async function handleInsertVehicle(v: MissingVehicle) {
    setApplying(v.make + v.model);
    try {
      await fetch('/api/auto/settings/vehicle-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'insert_vehicle', ...v }),
      });
      await loadData();
    } catch { /* silent */ }
    setApplying(null);
  }

  if (loading || !data) return <div style={{ color: COLORS.textMuted, padding: SPACING.xl }}>Loading vehicle audit...</div>;

  const filtered = filter === 'all' ? data.pending
    : data.pending.filter(f => f.confidence === filter);

  // Group by category
  const grouped = new Map<string, ProposedFix[]>();
  for (const fix of filtered) {
    const list = grouped.get(fix.category) || [];
    list.push(fix);
    grouped.set(fix.category, list);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* Stats bar */}
      <DashboardCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACING.md }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4 }}>
              Vehicle Database Audit
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
              {data.stats.total} issues found. Review and approve or dismiss each fix.
            </div>
          </div>
          <div style={{ display: 'flex', gap: SPACING.md }}>
            <Stat label="Pending" value={data.stats.pending} color="#f59e0b" />
            <Stat label="Applied" value={data.stats.applied} color="#22c55e" />
            <Stat label="Dismissed" value={data.stats.dismissed} color="#64748b" />
          </div>
        </div>
      </DashboardCard>

      {/* Filters */}
      <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
        {(['all', 'high', 'needs_review'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.md,
            border: `1px solid ${filter === f ? COLORS.borderAccentSolid : COLORS.borderInput}`,
            background: filter === f ? `${COLORS.borderAccentSolid}20` : 'transparent',
            color: filter === f ? COLORS.borderAccentSolid : COLORS.textMuted,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, cursor: 'pointer',
          }}>
            {f === 'all' ? `All (${data.pending.length})` : f === 'high' ? `High Confidence (${data.pending.filter(x => x.confidence === 'high').length})` : `Needs Review (${data.pending.filter(x => x.confidence === 'needs_review').length})`}
          </button>
        ))}
      </div>

      {/* Missing vehicles */}
      {data.missingVehicles.length > 0 && (
        <DashboardCard>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: '#10b981', marginBottom: SPACING.md, display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={CATEGORY_LABELS.missing_vehicle.icon} />
            </svg>
            Missing Vehicles ({data.missingVehicles.length})
          </div>
          {data.missingVehicles.map(v => (
            <div key={v.make + v.model} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md,
              padding: `${SPACING.sm}px 0`, borderBottom: `1px solid ${COLORS.border}`,
            }}>
              <div>
                <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                  {v.make} {v.model}
                </span>
                <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, marginLeft: SPACING.sm }}>
                  {v.yearStart}-{v.yearEnd}
                </span>
                <span style={{ marginLeft: SPACING.sm }}>
                  {v.classKeys.map(ck => <ClassKeyPill key={ck} ck={ck} />)}
                </span>
              </div>
              <Button variant="primary" onClick={() => handleInsertVehicle(v)}
                disabled={applying === v.make + v.model}
                style={{ fontSize: '12px', padding: '4px 12px' }}>
                {applying === v.make + v.model ? 'Adding...' : 'Add to DB'}
              </Button>
            </div>
          ))}
        </DashboardCard>
      )}

      {/* Grouped fixes */}
      {Array.from(grouped.entries()).map(([category, fixes]) => {
        const cat = CATEGORY_LABELS[category] || { label: category, color: '#888', icon: '' };
        return (
          <DashboardCard key={category}>
            <div style={{
              fontSize: FONT.sizeSm, fontWeight: 700, color: cat.color,
              marginBottom: SPACING.md, display: 'flex', alignItems: 'center', gap: SPACING.sm,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={cat.icon} />
              </svg>
              {cat.label} ({fixes.length})
            </div>

            {fixes.map((fix, i) => {
              const isEditing = !!editing[fix.id];
              const effectiveProposed = isEditing ? editing[fix.id] : fix.proposedClassKeys;
              const currentSet = new Set(fix.currentClassKeys);
              const proposedSet = new Set(effectiveProposed);
              const removed = fix.currentClassKeys.filter(ck => !proposedSet.has(ck));
              const added = effectiveProposed.filter(ck => !currentSet.has(ck));
              const unchanged = fix.currentClassKeys.filter(ck => proposedSet.has(ck));
              const conf = CONFIDENCE_LABELS[fix.confidence] || { label: fix.confidence, color: '#888' };

              return (
                <div key={fix.id} style={{
                  padding: SPACING.md,
                  borderBottom: i < fixes.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  background: isEditing ? 'rgba(59,130,246,0.04)' : 'transparent',
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginBottom: SPACING.sm }}>
                    <div>
                      <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontSize: FONT.sizeBase }}>
                        {fix.make} {fix.model}
                      </span>
                      <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, marginLeft: SPACING.sm }}>
                        {fix.yearStart}{fix.yearEnd !== fix.yearStart ? `-${fix.yearEnd}` : ''}
                      </span>
                      <span style={{
                        marginLeft: SPACING.sm, fontSize: '0.65rem', fontWeight: 600,
                        padding: '1px 6px', borderRadius: RADIUS.sm,
                        background: `${conf.color}20`, color: conf.color,
                        border: `1px solid ${conf.color}40`,
                      }}>{conf.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: SPACING.xs, flexShrink: 0 }}>
                      {!isEditing && (
                        <button onClick={() => startEditing(fix)}
                          style={{
                            padding: '4px 10px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderInput}`,
                            background: 'transparent', color: '#3b82f6', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer',
                          }}>
                          Edit
                        </button>
                      )}
                      {isEditing && (
                        <button onClick={() => stopEditing(fix.id)}
                          style={{
                            padding: '4px 10px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderInput}`,
                            background: 'transparent', color: COLORS.textMuted, fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer',
                          }}>
                          Cancel
                        </button>
                      )}
                      <button onClick={() => handleAction(fix.id, 'apply')} disabled={applying === fix.id || (isEditing && editing[fix.id].length === 0)}
                        style={{
                          padding: '4px 12px', borderRadius: RADIUS.sm, border: 'none', cursor: 'pointer',
                          background: '#22c55e', color: '#fff', fontSize: '12px', fontWeight: 700,
                          opacity: applying === fix.id ? 0.5 : 1,
                        }}>
                        {applying === fix.id ? '...' : isEditing ? 'Apply Custom' : 'Apply'}
                      </button>
                      <button onClick={() => handleAction(fix.id, 'dismiss')} disabled={applying === fix.id}
                        style={{
                          padding: '4px 12px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderInput}`,
                          background: 'transparent', color: COLORS.textMuted, fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer',
                        }}>
                        Skip
                      </button>
                    </div>
                  </div>

                  {/* Issue */}
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary, marginBottom: SPACING.sm }}>
                    {fix.issue}
                  </div>

                  {/* Class key diff (static mode) */}
                  {!isEditing && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.md,
                      padding: `${SPACING.sm}px ${SPACING.md}px`,
                      background: COLORS.inputBg, borderRadius: RADIUS.sm,
                      fontSize: FONT.sizeXs,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Current</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {unchanged.map(ck => <ClassKeyPill key={ck} ck={ck} />)}
                          {removed.map(ck => <ClassKeyPill key={ck} ck={ck} isRemoved />)}
                        </div>
                      </div>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Proposed</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {unchanged.map(ck => <ClassKeyPill key={ck} ck={ck} />)}
                          {added.map(ck => <ClassKeyPill key={ck} ck={ck} isNew />)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Class key editor (edit mode) */}
                  {isEditing && (
                    <div style={{
                      padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm,
                      border: `1px solid #3b82f640`,
                    }}>
                      <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: 600, marginBottom: SPACING.sm }}>
                        Select class keys for this vehicle:
                      </div>
                      {/* Front door type */}
                      <div style={{ marginBottom: SPACING.sm }}>
                        <div style={{ fontSize: '0.65rem', color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Front Doors</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {FRONT_KEYS.map(ck => (
                            <button key={ck} onClick={() => toggleEditKey(fix.id, ck)} style={{
                              padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                              fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace',
                              background: editing[fix.id].includes(ck) ? 'rgba(34,197,94,0.2)' : 'transparent',
                              border: `1px solid ${editing[fix.id].includes(ck) ? '#22c55e' : COLORS.borderInput}`,
                              color: editing[fix.id].includes(ck) ? '#22c55e' : COLORS.textMuted,
                            }}>{ck}</button>
                          ))}
                        </div>
                      </div>
                      {/* Body class */}
                      <div style={{ marginBottom: SPACING.sm }}>
                        <div style={{ fontSize: '0.65rem', color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body Class</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {BODY_KEYS.map(ck => (
                            <button key={ck} onClick={() => toggleEditKey(fix.id, ck)} style={{
                              padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                              fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace',
                              background: editing[fix.id].includes(ck) ? 'rgba(59,130,246,0.2)' : 'transparent',
                              border: `1px solid ${editing[fix.id].includes(ck) ? '#3b82f6' : COLORS.borderInput}`,
                              color: editing[fix.id].includes(ck) ? '#3b82f6' : COLORS.textMuted,
                            }}>{ck}</button>
                          ))}
                        </div>
                      </div>
                      {/* Add fees */}
                      <div>
                        <div style={{ fontSize: '0.65rem', color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Surcharges</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {FEE_KEYS.map(ck => (
                            <button key={ck} onClick={() => toggleEditKey(fix.id, ck)} style={{
                              padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                              fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace',
                              background: editing[fix.id].includes(ck) ? 'rgba(139,92,246,0.2)' : 'transparent',
                              border: `1px solid ${editing[fix.id].includes(ck) ? '#a78bfa' : COLORS.borderInput}`,
                              color: editing[fix.id].includes(ck) ? '#a78bfa' : COLORS.textMuted,
                            }}>{ck}</button>
                          ))}
                        </div>
                      </div>
                      {/* Selected summary */}
                      <div style={{ marginTop: SPACING.sm, fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>
                        Will set to: <strong>{editing[fix.id].length > 0 ? editing[fix.id].join(' | ') : '(none selected)'}</strong>
                      </div>
                    </div>
                  )}

                  {/* Impact */}
                  <div style={{ fontSize: '0.7rem', color: cat.color, marginTop: SPACING.xs, fontWeight: 500 }}>
                    {fix.impact}
                  </div>
                </div>
              );
            })}
          </DashboardCard>
        );
      })}

      {filtered.length === 0 && (
        <DashboardCard>
          <div style={{ textAlign: 'center', padding: SPACING.xxl, color: COLORS.textMuted }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: '#22c55e', marginBottom: 4 }}>
              All clear!
            </div>
            <div style={{ fontSize: FONT.sizeSm }}>
              No pending fixes{filter !== 'all' ? ' matching this filter' : ''}. All vehicle class keys are verified.
            </div>
          </div>
        </DashboardCard>
      )}

      {/* Applied / Dismissed toggles */}
      <div style={{ display: 'flex', gap: SPACING.md }}>
        {data.stats.applied > 0 && (
          <button onClick={() => setShowApplied(!showApplied)} style={{
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textMuted, padding: `${SPACING.xs}px ${SPACING.md}px`,
            borderRadius: RADIUS.sm, fontSize: FONT.sizeXs, cursor: 'pointer',
          }}>
            {showApplied ? 'Hide' : 'Show'} Applied ({data.stats.applied})
          </button>
        )}
        {data.stats.dismissed > 0 && (
          <button onClick={() => setShowDismissed(!showDismissed)} style={{
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textMuted, padding: `${SPACING.xs}px ${SPACING.md}px`,
            borderRadius: RADIUS.sm, fontSize: FONT.sizeXs, cursor: 'pointer',
          }}>
            {showDismissed ? 'Hide' : 'Show'} Dismissed ({data.stats.dismissed})
          </button>
        )}
      </div>

      {showApplied && data.applied.length > 0 && (
        <DashboardCard>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: '#22c55e', marginBottom: SPACING.md }}>Applied Fixes</div>
          {data.applied.map(f => (
            <div key={f.id} style={{ padding: `${SPACING.xs}px 0`, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              {f.make} {f.model} ({f.yearStart}-{f.yearEnd}) — {f.proposedClassKeys.join(' | ')}
            </div>
          ))}
        </DashboardCard>
      )}

      {showDismissed && data.dismissed.length > 0 && (
        <DashboardCard>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: '#64748b', marginBottom: SPACING.md }}>Dismissed Fixes</div>
          {data.dismissed.map(f => (
            <div key={f.id} style={{ padding: `${SPACING.xs}px 0`, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              {f.make} {f.model} ({f.yearStart}-{f.yearEnd}) — skipped
            </div>
          ))}
        </DashboardCard>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}
