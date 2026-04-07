'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface PayConfig {
  id?: number;
  pay_type: string;
  base_rate: number;
  annual_goal: number;
  bonus_pool_weight: number;
  bonus_pool_eligible: boolean;
  draw_enabled: boolean;
  draw_balance: number;
  scheduled_days: string[];
}

interface CommissionRule {
  id?: number;
  label: string;
  module_keys: string[];
  commission_type: string;
  commission_rate: number;
  only_assigned: boolean;
  active: boolean;
}

interface ShopModule {
  module_key: string;
  label: string;
  color: string;
}

interface Props {
  teamMemberId: string;
  teamMemberName: string;
  shopModules: ShopModule[];
}

const DEFAULT_PAY_CONFIG: PayConfig = {
  pay_type: 'weekly',
  base_rate: 0,
  annual_goal: 0,
  bonus_pool_weight: 0,
  bonus_pool_eligible: false,
  draw_enabled: false,
  draw_balance: 0,
  scheduled_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PayStructureEditor({ teamMemberId, teamMemberName, shopModules }: Props) {
  const isMobile = useIsMobile();
  const [payConfig, setPayConfig] = useState<PayConfig>(DEFAULT_PAY_CONFIG);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // New rule form
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState<CommissionRule>({
    label: '',
    module_keys: [],
    commission_type: 'revenue_percent',
    commission_rate: 0,
    only_assigned: true,
    active: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auto/payroll');
      const data = await res.json();

      // Find this member's pay config
      const config = (data.payConfigs || []).find((pc: { team_member_id: string }) => pc.team_member_id === teamMemberId);
      if (config) {
        setPayConfig({
          id: config.id,
          pay_type: config.pay_type || 'weekly',
          base_rate: Number(config.base_rate) || 0,
          annual_goal: Number(config.annual_goal) || 0,
          bonus_pool_weight: Number(config.bonus_pool_weight) || 0,
          bonus_pool_eligible: config.bonus_pool_eligible || false,
          draw_enabled: config.draw_enabled || false,
          draw_balance: Number(config.draw_balance) || 0,
          scheduled_days: config.scheduled_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        });
      }

      // Find this member's commission rules
      const memberRules = (data.commissionRules || []).filter((r: { team_member_id: string }) => r.team_member_id === teamMemberId);
      setRules(memberRules);
    } catch { /* */ }
    setLoading(false);
  }, [teamMemberId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSavePayConfig() {
    setSaving(true);
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_pay_config',
        data: { team_member_id: teamMemberId, ...payConfig },
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAddRule() {
    if (!newRule.label.trim()) return;
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_commission_rule',
        data: { team_member_id: teamMemberId, ...newRule },
      }),
    });
    setNewRule({ label: '', module_keys: [], commission_type: 'revenue_percent', commission_rate: 0, only_assigned: true, active: true });
    setShowAddRule(false);
    fetchData();
  }

  async function handleDeleteRule(ruleId: number) {
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_commission_rule', data: { id: ruleId } }),
    });
    fetchData();
  }

  async function handleUpdateRule(ruleId: number, updates: Partial<CommissionRule>) {
    await fetch('/api/auto/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_commission_rule', data: { id: ruleId, ...updates } }),
    });
    fetchData();
  }

  if (loading) return <div style={{ padding: SPACING.md, color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Loading pay structure...</div>;

  const annualBase = payConfig.pay_type === 'weekly' ? payConfig.base_rate * 52
    : payConfig.pay_type === 'salary' ? payConfig.base_rate
    : payConfig.pay_type === 'hourly' ? payConfig.base_rate * 2080
    : 0;

  return (
    <div style={{ marginTop: SPACING.lg, borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACING.lg }}>
      <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
        Pay Structure
      </div>

      {/* Base Pay */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <FormField label="Pay Type">
          <SelectInput value={payConfig.pay_type} onChange={e => setPayConfig(p => ({ ...p, pay_type: e.target.value }))}>
            <option value="weekly">Weekly</option>
            <option value="salary">Annual Salary</option>
            <option value="hourly">Hourly</option>
            <option value="commission_only">Commission Only</option>
          </SelectInput>
        </FormField>
        <FormField label={payConfig.pay_type === 'salary' ? 'Annual Salary' : payConfig.pay_type === 'hourly' ? 'Hourly Rate' : 'Weekly Amount'}>
          <TextInput
            type="number"
            value={payConfig.base_rate || ''}
            onChange={e => setPayConfig(p => ({ ...p, base_rate: parseFloat(e.target.value) || 0 }))}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Annual Goal">
          <TextInput
            type="number"
            value={payConfig.annual_goal || ''}
            onChange={e => setPayConfig(p => ({ ...p, annual_goal: parseFloat(e.target.value) || 0 }))}
            placeholder="0.00"
          />
        </FormField>
      </div>

      {/* Projected annual from base */}
      {payConfig.base_rate > 0 && payConfig.pay_type !== 'salary' && (
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
          Projected annual base: ${annualBase.toLocaleString()}
        </div>
      )}

      {/* Bonus Pool */}
      <div style={{ display: 'flex', gap: SPACING.lg, alignItems: 'center', marginBottom: SPACING.md, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={payConfig.bonus_pool_eligible}
            onChange={e => setPayConfig(p => ({ ...p, bonus_pool_eligible: e.target.checked }))}
            style={{ width: 16, height: 16, accentColor: COLORS.red }}
          />
          <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>Bonus Pool Eligible</span>
        </label>
        {payConfig.bonus_pool_eligible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Weight:</span>
            <input
              type="number"
              value={(payConfig.bonus_pool_weight * 100) || ''}
              onChange={e => setPayConfig(p => ({ ...p, bonus_pool_weight: (parseFloat(e.target.value) || 0) / 100 }))}
              style={{
                width: 60, padding: '4px 8px', background: COLORS.inputBg, color: COLORS.textPrimary,
                border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeXs, textAlign: 'center',
              }}
              placeholder="0"
            />
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>%</span>
          </div>
        )}
      </div>

      {/* Schedule */}
      <div style={{ marginBottom: SPACING.md }}>
        <div style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>Scheduled Days</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DAYS.map(day => {
            const active = payConfig.scheduled_days.includes(day);
            return (
              <button
                key={day}
                onClick={() => {
                  setPayConfig(p => ({
                    ...p,
                    scheduled_days: active
                      ? p.scheduled_days.filter(d => d !== day)
                      : [...p.scheduled_days, day],
                  }));
                }}
                style={{
                  padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
                  border: `1.5px solid ${active ? COLORS.red : COLORS.borderInput}`,
                  background: active ? COLORS.red : 'transparent',
                  color: active ? '#fff' : COLORS.textMuted,
                  fontSize: FONT.sizeXs, fontWeight: 600,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save Pay Config */}
      <div style={{ marginBottom: SPACING.lg }}>
        <Button variant="primary" size="sm" onClick={handleSavePayConfig} disabled={saving}
          style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Pay Config'}
        </Button>
      </div>

      {/* Commission Rules */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACING.md }}>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
          Commission Rules
        </div>

        {rules.length === 0 && !showAddRule && (
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
            No commission rules configured.
          </div>
        )}

        {/* Existing rules */}
        {rules.map(rule => (
          <div key={rule.id} style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center', gap: 8,
            padding: `${SPACING.sm}px ${SPACING.md}px`, marginBottom: 6,
            background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>{rule.label}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                {rule.commission_type === 'revenue_percent' ? `${rule.commission_rate}% of revenue` :
                 rule.commission_type === 'upsell_percent' ? `${rule.commission_rate}% of upsell` :
                 `$${rule.commission_rate} per job`}
                {' '}
                {rule.module_keys?.length > 0
                  ? `(${rule.module_keys.map(k => shopModules.find(m => m.module_key === k)?.label || k).join(', ')})`
                  : '(all modules)'}
                {rule.only_assigned ? ' -- assigned only' : ''}
              </div>
            </div>
            <button
              onClick={() => rule.id && handleDeleteRule(rule.id)}
              style={{
                background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
                padding: '4px 8px', fontSize: FONT.sizeXs,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}

        {/* Add rule form */}
        {showAddRule ? (
          <div style={{
            padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm,
            border: `1px solid ${COLORS.border}`, marginTop: SPACING.sm,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.sm }}>
              <FormField label="Label">
                <TextInput value={newRule.label} onChange={e => setNewRule(r => ({ ...r, label: e.target.value }))} placeholder="Auto Tint Upsell 10%" />
              </FormField>
              <FormField label="Type">
                <SelectInput value={newRule.commission_type} onChange={e => setNewRule(r => ({ ...r, commission_type: e.target.value }))}>
                  <option value="revenue_percent">% of Revenue</option>
                  <option value="upsell_percent">% of Upsell (final - original)</option>
                  <option value="flat_per_job">Flat $ per Job</option>
                </SelectInput>
              </FormField>
              <FormField label={newRule.commission_type === 'flat_per_job' ? 'Amount ($)' : 'Rate (%)'}>
                <TextInput
                  type="number"
                  value={newRule.commission_rate || ''}
                  onChange={e => setNewRule(r => ({ ...r, commission_rate: parseFloat(e.target.value) || 0 }))}
                  placeholder="10"
                />
              </FormField>
              <FormField label="Applies to Modules">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {shopModules.map(m => {
                    const active = newRule.module_keys.includes(m.module_key);
                    return (
                      <button
                        key={m.module_key}
                        onClick={() => setNewRule(r => ({
                          ...r,
                          module_keys: active
                            ? r.module_keys.filter(k => k !== m.module_key)
                            : [...r.module_keys, m.module_key],
                        }))}
                        style={{
                          padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                          border: `1px solid ${active ? m.color : COLORS.borderInput}`,
                          background: active ? m.color : 'transparent',
                          color: active ? '#fff' : COLORS.textMuted,
                          fontSize: '0.7rem', fontWeight: 600,
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: SPACING.sm }}>
              <input type="checkbox" checked={newRule.only_assigned}
                onChange={e => setNewRule(r => ({ ...r, only_assigned: e.target.checked }))}
                style={{ width: 14, height: 14, accentColor: COLORS.red }}
              />
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Only count jobs where this person is assigned</span>
            </label>
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.md }}>
              <Button variant="primary" size="sm" onClick={handleAddRule} disabled={!newRule.label.trim()}>Add Rule</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddRule(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddRule(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.sm,
              padding: `${SPACING.xs}px ${SPACING.md}px`, color: COLORS.textMuted,
              fontSize: FONT.sizeXs, cursor: 'pointer', width: '100%', justifyContent: 'center',
              marginTop: SPACING.sm,
            }}
          >
            + Add Commission Rule
          </button>
        )}
      </div>
    </div>
  );
}
