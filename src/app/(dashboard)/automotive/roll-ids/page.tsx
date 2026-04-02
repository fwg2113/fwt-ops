'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { AutoFilm, AutoFilmShade } from '@/app/components/booking/types';

interface RollEntry {
  film_id: number;
  shade_id: number;
  roll_id: string;
}

interface ActiveRoll {
  id: number;
  film_id: number;
  shade_id: number;
  roll_id: string;
}

export default function RollIdsPage() {
  const [films, setFilms] = useState<AutoFilm[]>([]);
  const [shades, setShades] = useState<AutoFilmShade[]>([]);
  const [activeRolls, setActiveRolls] = useState<ActiveRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Local editable state: map of "filmId-shadeId" -> roll_id string
  const [rollValues, setRollValues] = useState<Record<string, string>>({});
  // Track which values have been modified
  const [dirty, setDirty] = useState(false);

  // Load films, shades, and active rolls
  useEffect(() => {
    Promise.all([
      fetch('/api/auto/config').then(r => r.json()),
      fetch('/api/auto/roll-inventory').then(r => r.json()),
    ])
      .then(([config, inventory]) => {
        const offeredFilms = (config.films || []).filter((f: AutoFilm) => f.offered);
        const offeredShades = (config.filmShades || []).filter((s: AutoFilmShade) => s.offered);
        setFilms(offeredFilms);
        setShades(offeredShades);
        setActiveRolls(inventory.rolls || []);

        // Initialize roll values from active inventory
        const values: Record<string, string> = {};
        for (const roll of (inventory.rolls || []) as ActiveRoll[]) {
          values[`${roll.film_id}-${roll.shade_id}`] = roll.roll_id;
        }
        setRollValues(values);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Get shades for a film, sorted by shade_numeric
  const getShadesForFilm = useCallback((filmId: number) => {
    return shades
      .filter(s => s.film_id === filmId)
      .sort((a, b) => (b.shade_numeric || 0) - (a.shade_numeric || 0));
  }, [shades]);

  // Update a roll ID value
  const updateRollId = useCallback((filmId: number, shadeId: number, value: string) => {
    setRollValues(prev => ({ ...prev, [`${filmId}-${shadeId}`]: value }));
    setDirty(true);
    setSaveStatus('idle');
  }, []);

  // Count how many roll IDs are filled
  const filledCount = useMemo(() => {
    return Object.values(rollValues).filter(v => v && v.trim()).length;
  }, [rollValues]);

  // Total possible slots
  const totalSlots = useMemo(() => {
    return films.reduce((sum, f) => sum + getShadesForFilm(f.id).length, 0);
  }, [films, getShadesForFilm]);

  // Save all changes
  async function handleSave() {
    setSaving(true);

    // Build the rolls array from all film/shade combos
    const rolls: RollEntry[] = [];
    for (const film of films) {
      for (const shade of getShadesForFilm(film.id)) {
        const key = `${film.id}-${shade.id}`;
        rolls.push({
          film_id: film.id,
          shade_id: shade.id,
          roll_id: rollValues[key] || '',
        });
      }
    }

    try {
      const res = await fetch('/api/auto/roll-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolls }),
      });

      if (res.ok) {
        setDirty(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch { /* silent */ }
    setSaving(false);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Roll" titleAccent="IDs" subtitle="Automotive" />
        <div style={{ padding: SPACING.xxl, color: COLORS.textMuted, textAlign: 'center' }}>Loading roll inventory...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roll"
        titleAccent="IDs"
        subtitle="Automotive -- Active film roll IDs for warranty tracking"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              {filledCount} / {totalSlots} assigned
            </span>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {/* Film cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: SPACING.lg,
      }}>
        {films.map(film => {
          const filmShades = getShadesForFilm(film.id);
          if (filmShades.length === 0) return null;

          return (
            <DashboardCard
              key={film.id}
              title={film.display_name || film.name}
              icon={
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: film.card_styles?.bg || COLORS.red,
                }} />
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                {filmShades.map(shade => {
                  const key = `${film.id}-${shade.id}`;
                  const value = rollValues[key] || '';

                  return (
                    <div key={shade.id} style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.md,
                    }}>
                      <span style={{
                        fontSize: FONT.sizeSm,
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.textSecondary,
                        minWidth: 40,
                        textAlign: 'right',
                      }}>
                        {shade.shade_value}
                      </span>
                      <input
                        type="text"
                        value={value}
                        onChange={e => updateRollId(film.id, shade.id, e.target.value)}
                        placeholder="Enter Roll ID"
                        style={{
                          flex: 1,
                          padding: `${SPACING.sm}px ${SPACING.md}px`,
                          background: COLORS.inputBg,
                          color: COLORS.textPrimary,
                          border: `1px solid ${value ? COLORS.borderAccent : COLORS.borderInput}`,
                          borderRadius: RADIUS.sm,
                          fontSize: FONT.sizeSm,
                          fontFamily: 'monospace',
                          outline: 'none',
                          transition: 'border-color 0.15s',
                        }}
                        onFocus={e => e.target.style.borderColor = COLORS.red}
                        onBlur={e => e.target.style.borderColor = value ? COLORS.borderAccent : COLORS.borderInput}
                      />
                    </div>
                  );
                })}
              </div>
            </DashboardCard>
          );
        })}
      </div>
    </div>
  );
}
