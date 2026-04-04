'use client';

import { useState, useMemo } from 'react';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { DashboardCard, Button, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Service {
  id: number; service_key: string; label: string; service_type: string;
  duration_minutes: number; is_primary: boolean; is_addon: boolean;
  enabled: boolean; sort_order: number; conflicts_with: string | null; show_note: string | null;
}

interface Film { id: number; name: string; offered: boolean; brand_id: number; tier_label: string | null; }
interface FilmShade { id: number; film_id: number; shade_value: string; shade_label: string | null; shade_numeric: number | null; offered: boolean; }
interface ServiceShade { id: number; service_key: string; film_key: string; shade_value: string; }

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function ServicesTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const services = (data.services || []) as Service[];
  const films = ((data.films || []) as Film[]).filter(f => f.offered);
  const filmShades = (data.filmShades || []) as FilmShade[];
  const serviceShades = (data.serviceShades || []) as ServiceShade[];

  const [editing, setEditing] = useState<number | null>(null);
  const [editDuration, setEditDuration] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Shade rules expand
  const [expandedRules, setExpandedRules] = useState<string | null>(null);
  // Map of "filmName|shadeValue" -> boolean for the currently expanded service
  const [ruleToggles, setRuleToggles] = useState<Record<string, boolean>>({});
  const [savingRules, setSavingRules] = useState(false);
  const [savedRules, setSavedRules] = useState(false);

  function startEdit(svc: Service) {
    setEditing(svc.id);
    setEditDuration(String(svc.duration_minutes));
    setEditLabel(svc.label);
  }

  async function saveEdit(svc: Service) {
    setSaving(true);
    await onSave('auto_services', svc.id, {
      label: editLabel,
      duration_minutes: parseInt(editDuration) || svc.duration_minutes,
    });
    setSaving(false);
    setEditing(null);
    onRefresh();
  }

  async function toggleEnabled(svc: Service) {
    await onSave('auto_services', svc.id, { enabled: !svc.enabled });
    onRefresh();
  }

  // Build toggle key
  function tKey(filmName: string, shadeValue: string): string {
    return `${filmName}|${shadeValue}`;
  }

  // Initialize toggles when expanding a service
  function expandRules(serviceKey: string) {
    if (expandedRules === serviceKey) {
      setExpandedRules(null);
      return;
    }

    // Build toggle state: for each film+shade, is it currently allowed?
    const toggles: Record<string, boolean> = {};
    const rulesForService = serviceShades.filter(ss => ss.service_key === serviceKey);
    const hasRules = rulesForService.length > 0;

    films.forEach(film => {
      const shades = filmShades.filter(s => s.film_id === film.id && s.offered);
      const rulesForFilm = rulesForService.filter(ss => ss.film_key === film.name);

      shades.forEach(shade => {
        const key = tKey(film.name, shade.shade_value);
        if (!hasRules) {
          // No rules for this service at all = everything allowed
          toggles[key] = true;
        } else {
          // Service has rules — only shades explicitly listed are allowed
          // Films with zero entries = all disabled (not available for this service)
          toggles[key] = rulesForFilm.some(r => r.shade_value === shade.shade_value);
        }
      });
    });

    setRuleToggles(toggles);
    setExpandedRules(serviceKey);
    setSavedRules(false);
  }

  function toggleRule(filmName: string, shadeValue: string) {
    const key = tKey(filmName, shadeValue);
    setRuleToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAllForFilm(filmName: string, filmId: number) {
    const shades = filmShades.filter(s => s.film_id === filmId && s.offered);
    const keys = shades.map(s => tKey(filmName, s.shade_value));
    const allOn = keys.every(k => ruleToggles[k]);
    setRuleToggles(prev => {
      const next = { ...prev };
      keys.forEach(k => next[k] = !allOn);
      return next;
    });
  }

  async function saveRules(serviceKey: string) {
    setSavingRules(true);

    // Build rules array from toggles — include every shade that is ON
    const rules: Array<{ film_key: string; shade_value: string }> = [];
    let totalCount = 0;

    films.forEach(film => {
      const shades = filmShades.filter(s => s.film_id === film.id && s.offered);
      shades.forEach(shade => {
        totalCount++;
        const key = tKey(film.name, shade.shade_value);
        if (ruleToggles[key]) {
          rules.push({ film_key: film.name, shade_value: shade.shade_value });
        }
      });
    });

    // If ALL are enabled, send empty (no restrictions). Otherwise send the allowed list.
    const allEnabled = rules.length === totalCount;
    const finalRules = allEnabled ? [] : rules;

    try {
      const res = await fetch('/api/auto/settings/service-shades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_key: serviceKey, rules: finalRules }),
      });
      const result = await res.json();
      if (result.success) {
        setSavedRules(true);
        setTimeout(() => setSavedRules(false), 2000);
        setExpandedRules(null);
        onRefresh();
      }
    } catch { /* silent */ }
    finally { setSavingRules(false); }
  }

  const groups = [
    { title: 'Primary Services', items: services.filter(s => s.is_primary) },
    { title: 'Secondary Services (Add-Ons)', items: services.filter(s => s.is_addon) },
    { title: 'Removal Services', items: services.filter(s => s.service_type === 'removal') },
    { title: 'Ala Carte Services', items: services.filter(s => s.service_type === 'alacarte') },
  ];

  // Only tint services need shade rules (not removals)
  const tintServiceKeys = new Set(
    services.filter(s => s.service_type === 'tint').map(s => s.service_key)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {groups.map(group => (
        <DashboardCard key={group.title} title={group.title}>
          {group.items.map(svc => {
            const isExpandedRules = expandedRules === svc.service_key;
            const hasTintShades = tintServiceKeys.has(svc.service_key);
            const hasRestrictions = serviceShades.some(ss => ss.service_key === svc.service_key);

            return (
              <div key={svc.id}>
                {/* Service row */}
                {isMobile ? (
                  <div style={{
                    padding: `${SPACING.sm}px 0`,
                    borderBottom: isExpandedRules ? 'none' : `1px solid ${COLORS.border}`,
                    opacity: svc.enabled ? 1 : 0.5,
                  }}>
                    {/* Mobile row 1: checkbox + name + edit/actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                      <input type="checkbox" checked={svc.enabled} onChange={() => toggleEnabled(svc)}
                        style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer', flexShrink: 0 }} />

                      {editing === svc.id ? (
                        <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
                          style={{ flex: 1, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {svc.label}
                        </span>
                      )}

                      {editing === svc.id ? (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <Button variant="primary" size="sm" onClick={() => saveEdit(svc)} disabled={saving}>Save</Button>
                          <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>X</Button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => startEdit(svc)} style={{
                            background: 'rgba(255,255,255,0.06)', color: COLORS.textMuted,
                            border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
                            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                          }}>
                            Edit
                          </button>
                          {hasTintShades && (
                            <button onClick={() => expandRules(svc.service_key)} style={{
                              background: isExpandedRules ? COLORS.activeBg : 'rgba(255,255,255,0.06)',
                              color: isExpandedRules ? COLORS.red : COLORS.textMuted,
                              border: `1px solid ${isExpandedRules ? COLORS.red : 'transparent'}`,
                              borderRadius: RADIUS.sm, padding: '4px 10px',
                              fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                            }}>
                              Rules
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mobile row 2: service_key + duration + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginTop: 4, paddingLeft: 26 }}>
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>
                        {svc.service_key}
                      </span>

                      {editing === svc.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)}
                            style={{ width: 50, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeXs, textAlign: 'center' }} />
                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>min</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                          {svc.duration_minutes}m
                        </span>
                      )}

                      <StatusBadge label={svc.service_type} variant={
                        svc.service_type === 'tint' ? 'info' : svc.service_type === 'removal' ? 'warning' : 'neutral'
                      } />
                      {hasTintShades && (
                        <StatusBadge
                          label={hasRestrictions ? 'Restricted' : 'All'}
                          variant={hasRestrictions ? 'warning' : 'neutral'}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.md,
                  padding: `${SPACING.sm}px 0`,
                  borderBottom: isExpandedRules ? 'none' : `1px solid ${COLORS.border}`,
                  opacity: svc.enabled ? 1 : 0.5,
                }}>
                  <input type="checkbox" checked={svc.enabled} onChange={() => toggleEnabled(svc)}
                    style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'pointer', flexShrink: 0 }} />

                  {editing === svc.id ? (
                    <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
                      style={{ flex: 1, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm }} />
                  ) : (
                    <span style={{ flex: 1, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                      {svc.label}
                    </span>
                  )}

                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace', minWidth: 120 }}>
                    {svc.service_key}
                  </span>

                  {editing === svc.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)}
                        style={{ width: 60, background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm, textAlign: 'center' }} />
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>min</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, minWidth: 60, textAlign: 'center' }}>
                      {svc.duration_minutes}m
                    </span>
                  )}

                  <StatusBadge label={svc.service_type} variant={
                    svc.service_type === 'tint' ? 'info' : svc.service_type === 'removal' ? 'warning' : 'neutral'
                  } />

                  {/* Shade rules indicator */}
                  {hasTintShades && (
                    <StatusBadge
                      label={hasRestrictions ? 'Restricted' : 'All Shades'}
                      variant={hasRestrictions ? 'warning' : 'neutral'}
                    />
                  )}

                  {editing === svc.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="primary" size="sm" onClick={() => saveEdit(svc)} disabled={saving}>Save</Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(svc)} style={{
                        background: 'rgba(255,255,255,0.06)', color: COLORS.textMuted,
                        border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
                        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                      }}>
                        Edit
                      </button>
                      {hasTintShades && (
                        <button onClick={() => expandRules(svc.service_key)} style={{
                          background: isExpandedRules ? COLORS.activeBg : 'rgba(255,255,255,0.06)',
                          color: isExpandedRules ? COLORS.red : COLORS.textMuted,
                          border: `1px solid ${isExpandedRules ? COLORS.red : 'transparent'}`,
                          borderRadius: RADIUS.sm, padding: '4px 10px',
                          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                        }}>
                          Shade Rules
                        </button>
                      )}
                    </div>
                  )}
                </div>
                )}

                {/* Expanded shade rules */}
                {isExpandedRules && (
                  <div style={{
                    padding: SPACING.lg, margin: `0 0 ${SPACING.sm}px`,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: `0 0 ${RADIUS.lg}px ${RADIUS.lg}px`,
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: SPACING.lg,
                    }}>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                        Allowed Shades for {svc.label}
                      </div>
                      <Button variant="primary" size="sm" onClick={() => saveRules(svc.service_key)} disabled={savingRules}
                        style={savedRules ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
                        {savingRules ? 'Saving...' : savedRules ? 'Saved' : 'Save Rules'}
                      </Button>
                    </div>

                    {films.map(film => {
                      const shades = filmShades
                        .filter(s => s.film_id === film.id && s.offered)
                        .sort((a, b) => (a.shade_numeric || 0) - (b.shade_numeric || 0));

                      if (shades.length === 0) return null;

                      const allOn = shades.every(s => ruleToggles[tKey(film.name, s.shade_value)]);
                      const noneOn = shades.every(s => !ruleToggles[tKey(film.name, s.shade_value)]);

                      return (
                        <div key={film.id} style={{ marginBottom: SPACING.lg }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
                          }}>
                            <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                              {film.name}
                            </span>
                            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {film.tier_label}
                            </span>
                            <button onClick={() => toggleAllForFilm(film.name, film.id)} style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              fontSize: FONT.sizeXs, color: allOn ? COLORS.danger : '#22c55e',
                              fontWeight: FONT.weightSemibold, padding: '2px 6px',
                            }}>
                              {allOn ? 'Disable All' : noneOn ? 'Enable All' : 'Toggle All'}
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                            {shades.map(shade => {
                              const key = tKey(film.name, shade.shade_value);
                              const isOn = !!ruleToggles[key];

                              return (
                                <button key={shade.id} onClick={() => toggleRule(film.name, shade.shade_value)}
                                  style={{
                                    padding: '6px 16px', borderRadius: RADIUS.md, cursor: 'pointer',
                                    background: isOn ? '#22c55e18' : 'transparent',
                                    color: isOn ? '#22c55e' : COLORS.textMuted,
                                    border: `1px solid ${isOn ? '#22c55e40' : COLORS.borderInput}`,
                                    fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                                    opacity: isOn ? 1 : 0.4,
                                    textDecoration: isOn ? 'none' : 'line-through',
                                    transition: 'all 0.15s',
                                  }}>
                                  {shade.shade_label || shade.shade_value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.sm }}>
                      Green shades are available for this service. Grayed out shades will not be shown to customers.
                      If all shades are enabled for all films, no restrictions are applied.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </DashboardCard>
      ))}
    </div>
  );
}
