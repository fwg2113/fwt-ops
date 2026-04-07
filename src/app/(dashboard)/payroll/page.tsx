'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface PayPeriod {
  id: number;
  period_start: string;
  period_end: string;
  period_label: string | null;
  bonus_pool_revenue: number;
  bonus_pool_profit: number;
  bonus_pool_percent: number;
  bonus_pool_amount: number;
  status: string;
  finalized_at: string | null;
}

interface MemberSummary {
  team_member_id: string;
  name: string;
  entries: Array<{
    id: number;
    entry_type: string;
    amount: number;
    description: string;
    starting_total: number | null;
    final_total: number | null;
    upsell_amount: number | null;
  }>;
  base_total: number;
  commission_total: number;
  bonus_total: number;
  adjustment_total: number;
  gross_total: number;
}

export default function PayrollPage() {
  const isMobile = useIsMobile();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [memberSummaries, setMemberSummaries] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editEntryAmount, setEditEntryAmount] = useState('');

  // Create period form
  const [showCreate, setShowCreate] = useState(false);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [newStart, setNewStart] = useState(monthStart);
  const [newEnd, setNewEnd] = useState(monthEnd);
  const [newLabel, setNewLabel] = useState(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  // Edit period form
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/auto/payroll');
    const data = await res.json();
    setPeriods(data.payPeriods || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  async function fetchEntries(periodId: number) {
    const res = await fetch(`/api/auto/payroll/entries?period_id=${periodId}`);
    const data = await res.json();
    setMemberSummaries(data.byMember || []);
  }

  async function handleSelectPeriod(period: PayPeriod) {
    setSelectedPeriod(period);
    setExpandedMember(null);
    await fetchEntries(period.id);
  }

  async function handleCreatePeriod() {
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_pay_period',
        data: { period_start: newStart, period_end: newEnd, period_label: newLabel },
      }),
    });
    setShowCreate(false);
    fetchPeriods();
  }

  async function handleCalculate() {
    if (!selectedPeriod) return;
    setCalculating(true);
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'calculate_commissions', data: { pay_period_id: selectedPeriod.id } }),
    });
    await fetchEntries(selectedPeriod.id);
    await fetchPeriods();
    setSelectedPeriod(prev => prev ? { ...prev, status: 'calculated' } : null);
    setCalculating(false);
  }

  async function handleFinalize() {
    if (!selectedPeriod) return;
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize_pay_period', data: { pay_period_id: selectedPeriod.id } }),
    });
    await fetchPeriods();
    setSelectedPeriod(prev => prev ? { ...prev, status: 'finalized' } : null);
  }

  async function handleDeletePeriod() {
    if (!selectedPeriod) return;
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_pay_period', data: { pay_period_id: selectedPeriod.id } }),
    });
    setSelectedPeriod(null);
    setMemberSummaries([]);
    fetchPeriods();
  }

  function startEditPeriod() {
    if (!selectedPeriod) return;
    setEditStart(selectedPeriod.period_start);
    setEditEnd(selectedPeriod.period_end);
    setEditLabel(selectedPeriod.period_label || '');
    setEditingPeriod(true);
  }

  async function handleSaveEditPeriod() {
    if (!selectedPeriod) return;
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit_pay_period',
        data: { pay_period_id: selectedPeriod.id, period_start: editStart, period_end: editEnd, period_label: editLabel },
      }),
    });
    setEditingPeriod(false);
    setSelectedPeriod(prev => prev ? { ...prev, period_start: editStart, period_end: editEnd, period_label: editLabel } : null);
    fetchPeriods();
  }

  const totalGross = memberSummaries.reduce((sum, m) => sum + m.gross_total, 0);

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Pay periods, commissions, and bonus tracking" />

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: SPACING.lg }}>
        {/* Period list */}
        <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0 }}>
          <DashboardCard title="Pay Periods">
            {loading ? (
              <div style={{ padding: SPACING.md, color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Loading...</div>
            ) : (
              <>
                {periods.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPeriod(p)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: `${SPACING.sm}px ${SPACING.md}px`, marginBottom: 4,
                      background: selectedPeriod?.id === p.id ? `${COLORS.red}15` : 'transparent',
                      border: selectedPeriod?.id === p.id ? `1px solid ${COLORS.red}` : `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.sm, cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>
                      {p.period_label || `${p.period_start} - ${p.period_end}`}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      <span style={{
                        display: 'inline-block', padding: '1px 8px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 600,
                        background: p.status === 'finalized' ? '#dcfce7' : p.status === 'calculated' ? '#fef3c7' : COLORS.hoverBg,
                        color: p.status === 'finalized' ? '#15803d' : p.status === 'calculated' ? '#92400e' : COLORS.textMuted,
                      }}>
                        {p.status}
                      </span>
                    </div>
                  </button>
                ))}

                {/* Create new period */}
                {showCreate ? (
                  <div style={{ padding: SPACING.sm, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginTop: SPACING.sm }}>
                    <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Period label"
                      style={{ width: '100%', padding: '6px 10px', marginBottom: 6, background: COLORS.pageBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeXs }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)}
                        style={{ flex: 1, padding: '4px 6px', background: COLORS.pageBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeXs }}
                      />
                      <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                        style={{ flex: 1, padding: '4px 6px', background: COLORS.pageBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeXs }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="primary" size="sm" onClick={handleCreatePeriod}>Create</Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowCreate(true)} style={{
                    width: '100%', padding: `${SPACING.sm}px`, marginTop: SPACING.sm,
                    background: 'none', border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.sm,
                    color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
                  }}>
                    + New Pay Period
                  </button>
                )}
              </>
            )}
          </DashboardCard>
        </div>

        {/* Period detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedPeriod ? (
            <>
              {/* Period header */}
              <DashboardCard>
                {editingPeriod ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                    <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Period label"
                      style={{ padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontWeight: 600 }}
                    />
                    <div style={{ display: 'flex', gap: SPACING.sm }}>
                      <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm }}
                      />
                      <span style={{ color: COLORS.textMuted, alignSelf: 'center', fontSize: FONT.sizeXs }}>to</span>
                      <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: SPACING.sm }}>
                      <Button variant="primary" size="sm" onClick={handleSaveEditPeriod}>Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPeriod(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: SPACING.md }}>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>
                      {selectedPeriod.period_label || 'Pay Period'}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      {selectedPeriod.period_start} to {selectedPeriod.period_end}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    <Button variant="primary" size="sm" onClick={handleCalculate} disabled={calculating}>
                      {calculating ? 'Calculating...' : selectedPeriod.status !== 'draft' ? 'Recalculate' : 'Calculate'}
                    </Button>
                    {selectedPeriod.status !== 'draft' && (
                      <Button size="sm" onClick={async () => {
                        await fetch('/api/auto/payroll', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'post_to_ledger', data: { pay_period_id: selectedPeriod.id } }),
                        });
                        alert('Payroll posted to ledger');
                      }} style={{ background: '#2563eb', borderColor: '#2563eb', color: '#fff' }}>
                        Post to Ledger
                      </Button>
                    )}
                    {selectedPeriod.status === 'calculated' && (
                      <Button size="sm" onClick={handleFinalize} style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}>
                        Finalize
                      </Button>
                    )}
                    {selectedPeriod.status === 'finalized' && (
                      <Button size="sm" onClick={async () => {
                        await fetch('/api/auto/payroll', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'edit_pay_period', data: { pay_period_id: selectedPeriod.id, status: 'calculated' } }),
                        });
                        setSelectedPeriod(prev => prev ? { ...prev, status: 'calculated' } : null);
                        fetchPeriods();
                      }} style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}>
                        Reopen
                      </Button>
                    )}
                    <button onClick={startEditPeriod} title="Edit period" style={{
                      padding: '6px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`, color: COLORS.textMuted,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={handleDeletePeriod} title="Delete period" style={{
                      padding: '6px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                      background: COLORS.inputBg, border: `1px solid ${COLORS.border}`, color: '#dc2626',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                )}

                {/* Summary stats */}
                {selectedPeriod.status !== 'draft' && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                    gap: SPACING.sm, marginTop: SPACING.lg,
                  }}>
                    <StatBox label="Revenue" value={`$${(selectedPeriod.bonus_pool_revenue || 0).toLocaleString()}`} />
                    <StatBox label="Net Profit" value={`$${(selectedPeriod.bonus_pool_profit || 0).toLocaleString()}`}
                      color={selectedPeriod.bonus_pool_profit > 0 ? '#16a34a' : '#dc2626'} />
                    <StatBox label="Bonus Pool" value={`$${(selectedPeriod.bonus_pool_amount || 0).toLocaleString()}`} />
                    <StatBox label="Total Payroll" value={`$${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  </div>
                )}
              </DashboardCard>

              {/* Team member breakdowns */}
              {memberSummaries.length > 0 && (
                <div style={{ marginTop: SPACING.lg }}>
                  {memberSummaries.map(m => (
                    <div key={m.team_member_id} style={{ marginBottom: SPACING.sm }}>
                      <button
                        onClick={() => setExpandedMember(expandedMember === m.team_member_id ? null : m.team_member_id)}
                        style={{
                          display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
                          padding: `${SPACING.md}px ${SPACING.lg}px`,
                          background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
                          borderRadius: expandedMember === m.team_member_id ? `${RADIUS.md}px ${RADIUS.md}px 0 0` : RADIUS.md,
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>{m.name}</div>
                          <div style={{ display: 'flex', gap: SPACING.md, fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                            {m.base_total > 0 && <span>Base: ${m.base_total.toFixed(2)}</span>}
                            {m.commission_total > 0 && <span>Com: ${m.commission_total.toFixed(2)}</span>}
                            {m.bonus_total > 0 && <span>Bonus: ${m.bonus_total.toFixed(2)}</span>}
                            {m.adjustment_total !== 0 && <span>Adj: ${m.adjustment_total.toFixed(2)}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.textPrimary }}>
                          ${m.gross_total.toFixed(2)}
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {expandedMember === m.team_member_id && (
                        <div style={{
                          padding: SPACING.md, background: COLORS.cardBg,
                          border: `1px solid ${COLORS.border}`, borderTop: 'none',
                          borderRadius: `0 0 ${RADIUS.md}px ${RADIUS.md}px`,
                        }}>
                          {m.entries.map((e, i) => (
                            <div key={e.id || i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: `${SPACING.xs}px 0`, gap: 8,
                              borderBottom: i < m.entries.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>{e.description}</div>
                                {e.entry_type === 'commission' && e.upsell_amount != null && (
                                  <div style={{ fontSize: '0.65rem', color: COLORS.textMuted }}>
                                    Original: ${e.starting_total?.toFixed(2)} | Final: ${e.final_total?.toFixed(2)} | Upsell: ${e.upsell_amount?.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                {editingEntryId === e.id ? (
                                  <>
                                    <input
                                      type="number"
                                      value={editEntryAmount}
                                      onChange={ev => setEditEntryAmount(ev.target.value)}
                                      onKeyDown={ev => { if (ev.key === 'Enter') {
                                        fetch('/api/auto/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ action: 'edit_entry', data: { entry_id: e.id, amount: parseFloat(editEntryAmount) || 0 } }),
                                        }).then(() => { setEditingEntryId(null); if (selectedPeriod) fetchEntries(selectedPeriod.id); });
                                      }}}
                                      autoFocus
                                      style={{
                                        width: 80, padding: '3px 6px', textAlign: 'right',
                                        background: COLORS.inputBg, color: COLORS.textPrimary,
                                        border: `1px solid ${COLORS.red}`, borderRadius: RADIUS.sm,
                                        fontSize: FONT.sizeXs, fontWeight: 600,
                                      }}
                                    />
                                    <button onClick={async () => {
                                      await fetch('/api/auto/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'edit_entry', data: { entry_id: e.id, amount: parseFloat(editEntryAmount) || 0 } }),
                                      });
                                      setEditingEntryId(null);
                                      if (selectedPeriod) fetchEntries(selectedPeriod.id);
                                    }} style={{ background: '#16a34a', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                                      OK
                                    </button>
                                    <button onClick={() => setEditingEntryId(null)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '0.7rem' }}>
                                      X
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => { setEditingEntryId(e.id); setEditEntryAmount(e.amount.toFixed(2)); }}
                                      title="Edit amount"
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                        fontSize: FONT.sizeSm, fontWeight: 600,
                                        color: e.entry_type === 'commission' ? '#2563eb' :
                                               e.entry_type === 'bonus_pool' ? '#7c3aed' :
                                               e.entry_type === 'adjustment' ? '#f59e0b' : COLORS.textPrimary,
                                      }}
                                    >
                                      ${e.amount.toFixed(2)}
                                    </button>
                                    <button
                                      onClick={async () => {
                                        await fetch('/api/auto/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ action: 'delete_entry', data: { entry_id: e.id } }),
                                        });
                                        if (selectedPeriod) fetchEntries(selectedPeriod.id);
                                      }}
                                      title="Delete entry"
                                      style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: '2px', opacity: 0.5 }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Add manual entry */}
                          <button
                            onClick={async () => {
                              if (!selectedPeriod) return;
                              const desc = prompt('Description (e.g., "Overtime adjustment"):');
                              if (!desc) return;
                              const amt = prompt('Amount ($):');
                              if (!amt) return;
                              await fetch('/api/auto/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'add_adjustment', data: {
                                  pay_period_id: selectedPeriod.id,
                                  team_member_id: m.team_member_id,
                                  entry_type: 'adjustment',
                                  amount: parseFloat(amt) || 0,
                                  description: desc,
                                  override_by: 'owner',
                                }}),
                              });
                              fetchEntries(selectedPeriod.id);
                            }}
                            style={{
                              width: '100%', padding: '4px', marginTop: 4,
                              background: 'none', border: `1px dashed ${COLORS.border}`,
                              borderRadius: RADIUS.sm, color: COLORS.textMuted,
                              fontSize: '0.65rem', cursor: 'pointer',
                            }}
                          >
                            + Add Manual Entry
                          </button>

                          {/* Total row */}
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: `${SPACING.sm}px 0 0`, marginTop: SPACING.xs,
                            borderTop: `2px solid ${COLORS.border}`,
                            fontWeight: 700, fontSize: FONT.sizeSm, color: COLORS.textPrimary,
                          }}>
                            <span>Total</span>
                            <span>${m.entries.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {memberSummaries.length === 0 && selectedPeriod.status === 'draft' && (
                <DashboardCard>
                  <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                    Click "Calculate" to compute base pay, commissions, and bonus pool for this period.
                  </div>
                </DashboardCard>
              )}
            </>
          ) : (
            <DashboardCard>
              <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
                Select a pay period to view details, or create a new one.
              </div>
            </DashboardCard>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: `${SPACING.sm}px ${SPACING.md}px`,
      background: COLORS.hoverBg, borderRadius: RADIUS.sm,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  );
}
