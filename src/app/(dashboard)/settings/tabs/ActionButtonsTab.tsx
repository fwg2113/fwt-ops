'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput, ColorPicker } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { type ActionButtonConfig, DEFAULT_BUTTONS_CONFIG } from '@/app/(dashboard)/appointments/ConfigurableActions';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

// ============================================================================
// ACTION BUTTONS SETTINGS TAB
// ============================================================================
export default function ActionButtonsTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Message templates
  const rawTemplates = (config.message_templates || {}) as Record<string, string>;
  const [templates, setTemplates] = useState<Record<string, string>>({ ...rawTemplates });
  const [newTemplateKey, setNewTemplateKey] = useState('');

  // Action buttons config
  const rawButtons = ((config.action_buttons_config as { buttons?: ActionButtonConfig[] })?.buttons) || DEFAULT_BUTTONS_CONFIG;
  const [buttons, setButtons] = useState<ActionButtonConfig[]>(rawButtons.map(b => ({ ...b })));
  const [expandedButton, setExpandedButton] = useState<string | null>(null);

  function updateButton(key: string, updates: Partial<ActionButtonConfig>) {
    setButtons(prev => prev.map(b => b.key === key ? { ...b, ...updates } : b));
  }

  function removeButton(key: string) {
    setButtons(prev => prev.filter(b => b.key !== key));
  }

  function addCustomButton() {
    const key = `custom_${Date.now()}`;
    setButtons(prev => [...prev, {
      key,
      enabled: true,
      label: 'Custom',
      clickedLabel: 'Done',
      defaultColor: '#6b7280',
      clickedColor: '#22c55e',
      behavior: 'message_modal' as const,
      statusTarget: null,
      messageTemplate: null,
      showWhen: null,
    }]);
    setExpandedButton(key);
  }

  function addTemplate() {
    const key = newTemplateKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || templates[key]) return;
    setTemplates(prev => ({ ...prev, [key]: '' }));
    setNewTemplateKey('');
  }

  function removeTemplate(key: string) {
    setTemplates(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Convert human-readable visibility checkboxes to showWhen rules
  function getVisibilityState(btn: ActionButtonConfig) {
    const statusIn = btn.showWhen?.status_in || [];
    const typeIn = btn.showWhen?.appointment_type_in || [];
    return {
      allStatuses: !btn.showWhen || !btn.showWhen.status_in,
      booked: statusIn.includes('booked'),
      in_progress: statusIn.includes('in_progress'),
      completed: statusIn.includes('completed'),
      invoiced: statusIn.includes('invoiced'),
      allTypes: !btn.showWhen || !btn.showWhen.appointment_type_in,
      dropoff: typeIn.includes('dropoff'),
      waiting: typeIn.includes('waiting'),
      headsup: typeIn.includes('headsup_30') || typeIn.includes('headsup_60'),
    };
  }

  function setVisibility(key: string, field: string, value: boolean) {
    setButtons(prev => prev.map(b => {
      if (b.key !== key) return b;
      const vis = getVisibilityState(b);

      if (field === 'allStatuses') {
        return { ...b, showWhen: value ? (b.showWhen?.appointment_type_in ? { appointment_type_in: b.showWhen.appointment_type_in } : null) : { ...b.showWhen, status_in: ['booked', 'in_progress'] } };
      }
      if (field === 'allTypes') {
        return { ...b, showWhen: value ? (b.showWhen?.status_in ? { status_in: b.showWhen.status_in } : null) : { ...b.showWhen, appointment_type_in: ['dropoff', 'waiting', 'headsup_30', 'headsup_60'] } };
      }

      // Status toggles
      const statuses = ['booked', 'in_progress', 'completed', 'invoiced'];
      if (statuses.includes(field)) {
        const current = b.showWhen?.status_in || statuses;
        const next = value ? [...current, field] : current.filter(s => s !== field);
        if (next.length === 0 || next.length === statuses.length) {
          const sw = b.showWhen ? { ...b.showWhen } : null;
          if (sw) delete sw.status_in;
          return { ...b, showWhen: sw && Object.keys(sw).length > 0 ? sw : null };
        }
        return { ...b, showWhen: { ...b.showWhen, status_in: next } };
      }

      // Type toggles
      if (field === 'headsup') {
        const current = b.showWhen?.appointment_type_in || ['dropoff', 'waiting', 'headsup_30', 'headsup_60'];
        const next = value
          ? [...current.filter(t => t !== 'headsup_30' && t !== 'headsup_60'), 'headsup_30', 'headsup_60']
          : current.filter(t => t !== 'headsup_30' && t !== 'headsup_60');
        return { ...b, showWhen: { ...b.showWhen, appointment_type_in: next } };
      }
      if (['dropoff', 'waiting'].includes(field)) {
        const current = b.showWhen?.appointment_type_in || ['dropoff', 'waiting', 'headsup_30', 'headsup_60'];
        const next = value ? [...current, field] : current.filter(t => t !== field);
        return { ...b, showWhen: { ...b.showWhen, appointment_type_in: next } };
      }

      return b;
    }));
  }

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      action_buttons_config: { buttons },
      message_templates: templates,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* ================================================================ */}
      {/* MESSAGE TEMPLATES */}
      {/* ================================================================ */}
      <DashboardCard title="Message Templates" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
          Pre-written messages your team can send with one tap. Use variables to personalize.
        </div>
        <div style={{
          fontSize: FONT.sizeXs, color: COLORS.textPlaceholder, marginBottom: SPACING.lg,
          padding: SPACING.sm, background: COLORS.inputBg, borderRadius: RADIUS.sm,
          fontFamily: 'monospace',
        }}>
          {'{customer_name}'} {'{customer_first_name}'} {'{vehicle_year}'} {'{vehicle_make}'} {'{vehicle_model}'} {'{shop_name}'} {'{shop_phone}'} {'{shop_address}'} {'{invoice_link}'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
          {Object.entries(templates).filter(([k]) => !k.startsWith('_')).map(([key, value]) => (
            <div key={key} style={{
              padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderInput}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <button onClick={() => removeTemplate(key)} style={{
                  background: 'transparent', border: 'none', color: COLORS.textMuted,
                  cursor: 'pointer', fontSize: FONT.sizeXs,
                }}>
                  Remove
                </button>
              </div>
              <textarea
                value={value}
                onChange={e => setTemplates(prev => ({ ...prev, [key]: e.target.value }))}
                rows={2}
                style={{
                  width: '100%', padding: SPACING.sm, borderRadius: RADIUS.sm,
                  background: COLORS.cardBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`, fontSize: FONT.sizeSm,
                  resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
            </div>
          ))}
        </div>

        {/* Add template */}
        <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.md }}>
          <TextInput
            value={newTemplateKey}
            onChange={e => setNewTemplateKey(e.target.value)}
            placeholder="Template name (e.g. appointment_reminder)"
            style={{ flex: 1 }}
          />
          <Button variant="secondary" size="sm" onClick={addTemplate} disabled={!newTemplateKey.trim()}>
            Add Template
          </Button>
        </div>
      </DashboardCard>

      {/* ================================================================ */}
      {/* ACTION BUTTONS */}
      {/* ================================================================ */}
      <DashboardCard title="Action Buttons" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Configure the action buttons that appear on each appointment card in the timeline.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
          {buttons.map((btn) => {
            const isExpanded = expandedButton === btn.key;
            const vis = getVisibilityState(btn);

            return (
              <div key={btn.key} style={{
                border: `1px solid ${isExpanded ? COLORS.borderAccent : COLORS.borderInput}`,
                borderRadius: RADIUS.md, overflow: 'hidden',
                background: COLORS.cardBg,
              }}>
                {/* Collapsed header */}
                <div
                  onClick={() => setExpandedButton(isExpanded ? null : btn.key)}
                  style={{
                    display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 6 : SPACING.md,
                    padding: isMobile ? `${SPACING.md}px ${SPACING.md}px` : `${SPACING.md}px ${SPACING.lg}px`, cursor: 'pointer',
                  }}
                >
                  {/* Row 1 (mobile) or inline (desktop): toggle + pills + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? SPACING.sm : SPACING.md }}>
                    <Toggle label="" checked={btn.enabled} onChange={v => { updateButton(btn.key, { enabled: v }); }} />

                    {/* Mini preview: before + after */}
                    <div style={{ display: 'flex', gap: 6, flex: isMobile ? 1 : undefined, minWidth: 0 }}>
                      <MiniButton color={btn.defaultColor} label={btn.label} />
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" style={{ alignSelf: 'center', flexShrink: 0 }}>
                        <path d="M4 2l4 4-4 4"/>
                      </svg>
                      <MiniButton color={btn.clickedColor} label={btn.clickedLabel} filled />
                    </div>

                    {!isMobile && (
                      <span style={{ flex: 1, fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                        {btn.behavior === 'status_change' ? `Changes status to "${btn.statusTarget}"` :
                         btn.behavior === 'message_modal' ? 'Opens message modal' :
                         btn.behavior === 'invoice_modal' ? 'Opens invoice options' :
                         btn.behavior === 'edit_modal' ? 'Opens edit modal' :
                         btn.behavior === 'headsup_send' ? 'Sends heads-up' : btn.behavior}
                      </span>
                    )}

                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                      <path d="M4 6l4 4 4-4"/>
                    </svg>
                  </div>

                  {/* Row 2 (mobile only): description text */}
                  {isMobile && (
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, paddingLeft: 48 }}>
                      {btn.behavior === 'status_change' ? `Changes status to "${btn.statusTarget}"` :
                       btn.behavior === 'message_modal' ? 'Opens message modal' :
                       btn.behavior === 'invoice_modal' ? 'Opens invoice options' :
                       btn.behavior === 'edit_modal' ? 'Opens edit modal' :
                       btn.behavior === 'headsup_send' ? 'Sends heads-up' : btn.behavior}
                    </div>
                  )}
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div style={{ padding: `0 ${SPACING.lg}px ${SPACING.lg}px`, borderTop: `1px solid ${COLORS.border}` }}>
                    {/* Appearance */}
                    <SectionLabel>Appearance</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
                      <div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Default State</div>
                        <FormField label="Label">
                          <TextInput value={btn.label} onChange={e => updateButton(btn.key, { label: e.target.value })} />
                        </FormField>
                        <div style={{ marginTop: SPACING.sm }}>
                          <ColorPicker value={btn.defaultColor} onChange={v => updateButton(btn.key, { defaultColor: v })} label="Color" />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Clicked State</div>
                        <FormField label="Label">
                          <TextInput value={btn.clickedLabel} onChange={e => updateButton(btn.key, { clickedLabel: e.target.value })} />
                        </FormField>
                        <div style={{ marginTop: SPACING.sm }}>
                          <ColorPicker value={btn.clickedColor} onChange={v => updateButton(btn.key, { clickedColor: v })} label="Color" />
                        </div>
                      </div>
                    </div>

                    {/* Behavior */}
                    <SectionLabel>Behavior</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
                      <FormField label="When clicked">
                        <SelectInput value={btn.behavior} onChange={e => updateButton(btn.key, { behavior: e.target.value as ActionButtonConfig['behavior'] })}>
                          <option value="status_change">Change appointment status</option>
                          <option value="message_modal">Open message modal</option>
                          <option value="invoice_modal">Open invoice options</option>
                          <option value="edit_modal">Open edit modal</option>
                          <option value="headsup_send">Send heads-up</option>
                        </SelectInput>
                      </FormField>
                      {btn.behavior === 'status_change' && (
                        <FormField label="Change status to">
                          <SelectInput value={btn.statusTarget || ''} onChange={e => updateButton(btn.key, { statusTarget: e.target.value })}>
                            <option value="booked">Booked</option>
                            <option value="in_progress">In Progress (Checked In)</option>
                            <option value="completed">Completed (Ready)</option>
                            <option value="invoiced">Invoiced</option>
                          </SelectInput>
                        </FormField>
                      )}
                      {(btn.behavior === 'message_modal' || btn.behavior === 'status_change') && (
                        <FormField label="Default message template">
                          <SelectInput value={btn.messageTemplate || ''} onChange={e => updateButton(btn.key, { messageTemplate: e.target.value || null })}>
                            <option value="">None</option>
                            {Object.keys(templates).filter(k => !k.startsWith('_')).map(k => (
                              <option key={k} value={k}>{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                            ))}
                          </SelectInput>
                        </FormField>
                      )}
                    </div>

                    {/* Visibility */}
                    <SectionLabel>Visibility</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.lg }}>
                      <div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>Show for appointment status</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <Checkbox label="All statuses" checked={vis.allStatuses} onChange={v => setVisibility(btn.key, 'allStatuses', v)} />
                          {!vis.allStatuses && (
                            <>
                              <Checkbox label="New (Booked)" checked={vis.booked} onChange={v => setVisibility(btn.key, 'booked', v)} indent />
                              <Checkbox label="Checked In" checked={vis.in_progress} onChange={v => setVisibility(btn.key, 'in_progress', v)} indent />
                              <Checkbox label="Completed" checked={vis.completed} onChange={v => setVisibility(btn.key, 'completed', v)} indent />
                              <Checkbox label="Invoiced" checked={vis.invoiced} onChange={v => setVisibility(btn.key, 'invoiced', v)} indent />
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>Show for appointment types</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <Checkbox label="All types" checked={vis.allTypes} onChange={v => setVisibility(btn.key, 'allTypes', v)} />
                          {!vis.allTypes && (
                            <>
                              <Checkbox label="Drop-off" checked={vis.dropoff} onChange={v => setVisibility(btn.key, 'dropoff', v)} indent />
                              <Checkbox label="Waiting" checked={vis.waiting} onChange={v => setVisibility(btn.key, 'waiting', v)} indent />
                              <Checkbox label="Heads-up" checked={vis.headsup} onChange={v => setVisibility(btn.key, 'headsup', v)} indent />
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Remove button */}
                    {!['edit', 'checkin', 'undo_checkin'].includes(btn.key) && (
                      <div style={{ marginTop: SPACING.lg, display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => removeButton(btn.key)} style={{
                          background: 'transparent', border: `1px solid ${COLORS.danger}30`,
                          color: COLORS.danger, padding: '6px 16px', borderRadius: RADIUS.sm,
                          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                        }}>
                          Remove Button
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add + Reset */}
        <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
          <Button variant="secondary" size="sm" onClick={addCustomButton}>
            Add Custom Button
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setButtons(DEFAULT_BUTTONS_CONFIG.map(b => ({ ...b })))}>
            Reset to Defaults
          </Button>
        </div>
      </DashboardCard>

      {/* ================================================================ */}
      {/* SAVE */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={{ background: saved ? '#22c55e' : undefined, borderColor: saved ? '#22c55e' : undefined }}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}
      onClick={e => e.stopPropagation()}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
        background: checked ? COLORS.red : COLORS.borderInput,
        position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ fontSize: FONT.sizeSm, color: checked ? COLORS.textPrimary : COLORS.textMuted }}>{label}</span>}
    </label>
  );
}

function Checkbox({ label, checked, onChange, indent }: { label: string; checked: boolean; onChange: (v: boolean) => void; indent?: boolean }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      marginLeft: indent ? SPACING.xl : 0,
    }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 16, height: 16, borderRadius: 3,
        border: `2px solid ${checked ? COLORS.red : COLORS.borderInput}`,
        background: checked ? COLORS.red : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
      }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M2 5l2 2 4-4"/>
          </svg>
        )}
      </div>
      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>{label}</span>
    </label>
  );
}

function MiniButton({ color, label, filled }: { color: string; label: string; filled?: boolean }) {
  return (
    <div style={{
      padding: '3px 10px', borderRadius: 4,
      background: filled ? `${color}30` : `${color}12`,
      border: `1px solid ${filled ? color : `${color}25`}`,
      color, fontSize: FONT.sizeXs, fontWeight: 600,
      whiteSpace: 'nowrap', lineHeight: 1.2,
    }}>
      {label}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted,
      textTransform: 'uppercase', letterSpacing: '1px',
      marginTop: SPACING.lg, marginBottom: SPACING.sm,
      paddingBottom: 4, borderBottom: `1px solid ${COLORS.border}`,
    }}>
      {children}
    </div>
  );
}
