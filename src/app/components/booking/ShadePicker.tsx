'use client';

import type { AutoFilmShade } from './types';

interface Props {
  label: string;
  shades: AutoFilmShade[];
  selectedShade: string | null;
  onSelect: (shade: string) => void;
  mostPopularShade?: string;
}

export default function ShadePicker({ label, shades, selectedShade, onSelect, mostPopularShade }: Props) {
  if (shades.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#666', marginBottom: 8 }}>
        {label}
      </div>
      <div className="fwt-pills fwt-shades">
        {shades.map(shade => (
          <div key={shade.id} className="pill-wrap">
            {mostPopularShade === shade.shade_value && (
              <span className="pill-flag">MOST POPULAR</span>
            )}
            <button
              type="button"
              className={`fwt-pill${selectedShade === shade.shade_value ? ' is-selected' : ''}`}
              data-shade={shade.shade_value}
              onClick={() => onSelect(shade.shade_value)}
            >
              {shade.shade_label || shade.shade_value}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
