'use client';

import type { BulkConfig, AutoVehicle, AutoFilm } from '../lib/types';
import { calculateAlaCartePrice, getAllowedShades } from '../lib/pricing';
import { FilmCard, ShadePicker } from '@/app/components/booking';

interface Props {
  config: BulkConfig;
  vehicle: AutoVehicle;
  availableFilms: AutoFilm[];
  selectedWindows: Set<string>;
  windowConfigs: Record<string, { filmId: number | null; shade: string | null }>;
  onToggleWindow: (key: string) => void;
  onFilmSelect: (windowKey: string, filmId: number | null) => void;
  onShadeSelect: (windowKey: string, shade: string | null) => void;
}

export default function AlaCarteFlow({
  config, vehicle, availableFilms,
  selectedWindows, windowConfigs,
  onToggleWindow, onFilmSelect, onShadeSelect,
}: Props) {
  const alaCarteServices = config.services.filter(s => s.service_type === 'alacarte');

  // Check if both front doors are selected
  const hasBothFronts = selectedWindows.has('ALACARTE_DFD') && selectedWindows.has('ALACARTE_PFD');

  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '1rem' }}>
          Ala Carte - Single Window Tinting
        </div>
        <div className="fwt-prompt" style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: 20 }}>
          Select Windows to Tint
        </div>
        <div className="fwt-sub" style={{ textAlign: 'center', marginBottom: 30, color: '#666' }}>
          Perfect for replacing a single damaged window or adding tint to specific areas. Select the windows you need tinted.
        </div>

        <div className="fwt-pills" style={{ flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {alaCarteServices.map(svc => (
            <button
              key={svc.service_key}
              type="button"
              className={`fwt-pill${selectedWindows.has(svc.service_key) ? ' is-selected' : ''}`}
              onClick={() => onToggleWindow(svc.service_key)}
            >
              {svc.label}
            </button>
          ))}
        </div>

        {/* Configuration cards per selected window */}
        {selectedWindows.size > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginTop: 30 }}>
            {Array.from(selectedWindows).map(windowKey => {
              const svc = alaCarteServices.find(s => s.service_key === windowKey);
              const wConfig = windowConfigs[windowKey] || { filmId: null, shade: null };
              const shades = wConfig.filmId
                ? getAllowedShades(windowKey, wConfig.filmId, config.filmShades, config.serviceShades, config.films)
                : [];
              const price = wConfig.filmId
                ? calculateAlaCartePrice(vehicle, windowKey, wConfig.filmId, config.pricing)
                : 0;

              return (
                <div key={windowKey} className="fwt-card">
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>{svc?.label || windowKey}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#666', marginBottom: 8 }}>Choose Your Film</div>

                  <div className="fwt-films">
                    {availableFilms.map(film => (
                      <FilmCard
                        key={film.id}
                        film={film}
                        isSelected={wConfig.filmId === film.id}
                        onClick={() => onFilmSelect(windowKey, wConfig.filmId === film.id ? null : film.id)}
                        displaySpecs={config.shopConfig.film_card_specs}
                        filmShades={config.filmShades.filter(s => s.film_id === film.id && s.offered)}
                        layout={config.shopConfig.film_card_layout}
                        theme={{ primary: config.shopConfig.theme_ext_primary, secondary: config.shopConfig.theme_ext_secondary, accent: config.shopConfig.theme_ext_accent, background: config.shopConfig.theme_ext_background }}
                      />
                    ))}
                  </div>

                  {wConfig.filmId && shades.length > 0 && (
                    <ShadePicker
                      label="Choose Your Shade(s)"
                      shades={shades}
                      selectedShade={wConfig.shade}
                      onSelect={shade => onShadeSelect(windowKey, shade)}
                    />
                  )}

                  {wConfig.filmId && wConfig.shade && (
                    <div className="fwt-price" style={{ fontSize: '1.2rem', marginTop: 12 }}>${price}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Both front doors tip */}
        {hasBothFronts && (
          <div style={{ marginTop: 20, padding: 16, background: '#d4edda', border: '1px solid #28a745', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, color: '#155724', marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="#155724" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm-.5 4v5h1V4h-1zm0 6v1h1v-1h-1z"/>
              </svg>
              Tip: Need Both Front Doors?
            </div>
            <div style={{ color: '#155724', fontSize: '0.95rem' }}>
              If you need both front doors tinted, select &quot;Window Tint&quot; above and choose &quot;2 Front Doors Only&quot; for the best value!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
