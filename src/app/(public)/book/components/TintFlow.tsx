'use client';

import type { BulkConfig, AutoVehicle, AutoFilm, AutoFilmShade } from '../lib/types';
import { TESLA_MODEL3_CONFIG } from '../lib/types';
import { calculateServicePrice, getAllowedShades } from '../lib/pricing';
import { FilmCard, ShadePicker } from '@/app/components/booking';

interface Props {
  config: BulkConfig;
  vehicle: AutoVehicle;
  availableFilms: AutoFilm[];
  requiresSplitShades: boolean;
  isTesla3: boolean;
  // Tint state
  primaryServiceKey: string | null;
  selectedFilmId: number | null;
  shadeFront: string | null;
  shadeRear: string | null;
  shadeUniform: boolean;
  selectedAddons: Set<string>;
  addonConfigs: Record<string, { filmId: number | null; shade: string | null }>;
  teslaClassKey: string | null;
  // Price
  primaryPrice: number;
  // Actions
  onPrimarySelect: (key: string | null) => void;
  onFilmSelect: (filmId: number | null) => void;
  onShadeFrontSelect: (shade: string | null) => void;
  onShadeRearSelect: (shade: string | null) => void;
  onShadeUniformChange: (uniform: boolean) => void;
  onAddonToggle: (key: string) => void;
  onAddonFilmSelect: (addonKey: string, filmId: number | null) => void;
  onAddonShadeSelect: (addonKey: string, shade: string | null) => void;
  onTeslaClassKeySelect: (key: string | null) => void;
}

export default function TintFlow({
  config, vehicle, availableFilms, requiresSplitShades, isTesla3,
  primaryServiceKey, selectedFilmId, shadeFront, shadeRear, shadeUniform,
  selectedAddons, addonConfigs, teslaClassKey, primaryPrice,
  onPrimarySelect, onFilmSelect, onShadeFrontSelect, onShadeRearSelect,
  onShadeUniformChange, onAddonToggle, onAddonFilmSelect, onAddonShadeSelect,
  onTeslaClassKeySelect,
}: Props) {
  // Only show primary services where the vehicle has pricing
  const standardPrimaryServices = config.services.filter(s => {
    if (!s.is_primary || s.service_type !== 'tint') return false;
    // Check if any of the vehicle's class keys have pricing for this service
    return vehicle.class_keys.some(ck =>
      config.pricing.some(p => p.class_key === ck && p.service_key === s.service_key)
    );
  });
  const addonServices = config.services.filter(s => s.is_addon && s.service_type === 'tint');

  // Check for custom classes on this vehicle
  const customPrimaryClasses = (config.vehicleCustomClasses || [])
    .filter(cc => cc.vehicle_id === vehicle.id && cc.category === 'primary' && cc.enabled);
  const customSecondaryClasses = (config.vehicleCustomClasses || [])
    .filter(cc => cc.vehicle_id === vehicle.id && cc.category === 'secondary' && cc.enabled);

  // If custom primary classes exist, they replace standard primary services
  const hasCustomPrimary = customPrimaryClasses.length > 0;
  const primaryServices = hasCustomPrimary
    ? customPrimaryClasses.map(cc => ({
        service_key: cc.class_key,
        label: cc.label,
        is_primary: true,
        is_addon: false,
        service_type: 'tint' as const,
        duration_minutes: cc.duration_minutes,
        sort_order: cc.sort_order,
        enabled: true,
        id: cc.id,
        conflicts_with: null,
        show_note: cc.description,
      }))
    : standardPrimaryServices;

  // Get shades for selected primary film
  const primaryFilmShades = selectedFilmId
    ? getAllowedShades(
        primaryServiceKey || 'FULL_SIDES',
        selectedFilmId,
        config.filmShades,
        config.serviceShades,
        config.films
      )
    : [];

  // Compute addon save amounts (10% discount display)
  const addonDiscountEnabled = config.shopConfig.addon_discount_enabled !== false;
  const addonDiscountPercent = config.shopConfig.addon_discount_percent || 10;

  const excludedFilms = config.shopConfig.addon_discount_excluded_films || [];

  function getAddonSaveAmount(addonKey: string, filmId: number): number {
    if (!addonDiscountEnabled) return 0;
    if (!primaryServiceKey) return 0;
    const film = config.films.find(f => f.id === filmId);
    if (!film) return 0;
    // Check shop-level film exclusions
    if (excludedFilms.includes(film.name)) return 0;
    const price = calculateServicePrice(vehicle, addonKey, filmId, config.pricing, config.vehicleClasses);
    return Math.round(price * (addonDiscountPercent / 100));
  }

  return (
    <div>
      {/* Primary Services */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '1rem' }}>Primary Services</div>
        <div className="fwt-prompt" style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: 20 }}>
          Choose A Service
        </div>

        {/* Custom class image (if first custom class has one) */}
        {hasCustomPrimary && customPrimaryClasses[0]?.image_url && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img
              src={customPrimaryClasses[0].image_url}
              alt={`${vehicle.make} ${vehicle.model}`}
              style={{ width: '100%', maxWidth: 500, borderRadius: 12 }}
              loading="lazy"
            />
          </div>
        )}

        <div className={hasCustomPrimary ? '' : 'fwt-pills fwt-primary-pills'}
          style={hasCustomPrimary ? {
            display: 'grid',
            gridTemplateColumns: `repeat(${primaryServices.length}, 1fr)`,
            gap: 16, maxWidth: 700, margin: '0 auto',
          } : primaryServices.length === 1 ? {
            display: 'flex', justifyContent: 'center',
            maxWidth: 300, margin: '0 auto',
          } : undefined}
        >
          {primaryServices.map(svc => (
            <div key={svc.service_key} style={hasCustomPrimary ? { display: 'flex' } : undefined} className={hasCustomPrimary ? '' : 'pill-wrap'}>
              <button
                type="button"
                className={`fwt-pill${primaryServiceKey === svc.service_key ? ' is-selected' : ''}`}
                onClick={() => onPrimarySelect(primaryServiceKey === svc.service_key ? null : svc.service_key)}
                style={hasCustomPrimary ? {
                  padding: '20px 24px', textAlign: 'center',
                  flexDirection: 'column', width: '100%',
                  height: '100%',
                } : undefined}
              >
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{svc.label}</div>
                {hasCustomPrimary && svc.show_note && (
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 6, lineHeight: 1.4, fontWeight: 400 }}>{svc.show_note}</div>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Film Selection (shows after primary selected) */}
      {primaryServiceKey && (
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '1rem' }}>
            {primaryServices.find(s => s.service_key === primaryServiceKey)?.label || 'Service'}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#666', marginBottom: 12 }}>
            Choose Your Film
          </div>

          <div className="fwt-films">
            {availableFilms.map(film => (
              <FilmCard
                key={film.id}
                film={film}
                isSelected={selectedFilmId === film.id}
                onClick={() => onFilmSelect(selectedFilmId === film.id ? null : film.id)}
                displaySpecs={config.shopConfig.film_card_specs}
                filmShades={config.filmShades.filter(s => s.film_id === film.id && s.offered)}
                layout={config.shopConfig.film_card_layout}
                theme={{ primary: config.shopConfig.theme_ext_primary, secondary: config.shopConfig.theme_ext_secondary, accent: config.shopConfig.theme_ext_accent, background: config.shopConfig.theme_ext_background }}
              />
            ))}
          </div>

          {/* Shade Selection */}
          {selectedFilmId && primaryFilmShades.length > 0 && (
            <div>
              {requiresSplitShades ? (
                <>
                  <ShadePicker
                    label="2 Front Doors"
                    shades={primaryFilmShades}
                    selectedShade={shadeFront}
                    onSelect={onShadeFrontSelect}
                    mostPopularShade="15%"
                  />
                  <ShadePicker
                    label="Rear"
                    shades={primaryFilmShades}
                    selectedShade={shadeRear}
                    onSelect={onShadeRearSelect}
                    mostPopularShade="56%"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={shadeUniform}
                      onChange={e => onShadeUniformChange(e.target.checked)}
                    />
                    <span style={{ fontSize: '0.95rem' }}>Make all side and rear windows uniform</span>
                  </label>
                </>
              ) : (
                <ShadePicker
                  label="Choose Your Shade(s)"
                  shades={primaryFilmShades}
                  selectedShade={shadeFront}
                  onSelect={onShadeFrontSelect}
                  mostPopularShade="15%"
                />
              )}
            </div>
          )}

          {/* Price display */}
          {selectedFilmId && (shadeFront || !requiresSplitShades) && (
            <div className="fwt-price" style={{ marginTop: 16 }}>
              ${primaryPrice}
            </div>
          )}
        </div>
      )}

      {/* Primary Configuration Cards placeholder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginBottom: 40 }} />

      {/* Secondary Services (Add-Ons) */}
      <div style={{ paddingTop: 0 }}>
        <div style={{ fontWeight: 800, margin: '6px 0 10px' }}>
          <span style={{ fontSize: '1rem', display: 'block', marginBottom: 8 }}>Secondary Services</span>
          {addonDiscountEnabled && config.shopConfig.addon_discount_promo_text && (
            <span className="fwt-badge fwt-addon-discount-badge">
              {config.shopConfig.addon_discount_promo_text}
            </span>
          )}
        </div>

        {addonDiscountEnabled && config.shopConfig.addon_discount_disclaimer && (
          <div className="fwt-sub fwt-disclaimer" style={{ margin: '20px 0 30px 0' }}
            dangerouslySetInnerHTML={{ __html: config.shopConfig.addon_discount_disclaimer }}
          />
        )}

        <div className="fwt-pills fwt-addon-pills">
          {addonServices.map(svc => {
            const isSelected = selectedAddons.has(svc.service_key);
            const isMostPopular = svc.service_key === 'FULL_WS' || svc.service_key === 'SUN_STRIP';
            return (
              <div key={svc.service_key} className="pill-wrap">
                {isMostPopular && <span className="pill-flag">MOST POPULAR</span>}
                <button
                  type="button"
                  className={`fwt-pill${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onAddonToggle(svc.service_key)}
                >
                  {svc.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add-On Configuration Cards */}
      {selectedAddons.size > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="fwt-divider" style={{ height: 1, background: '#e5e5e5', margin: '20px 0' }} />
          <div style={{ fontWeight: 800, margin: '10px 0 6px', fontSize: '0.9rem', color: '#666' }}>Add-On Details</div>

          {Array.from(selectedAddons).map(addonKey => {
            const svc = config.services.find(s => s.service_key === addonKey);
            const addonConfig = addonConfigs[addonKey] || { filmId: null, shade: null };
            const isSunStrip = addonKey === 'SUN_STRIP';

            // Sun Strip: always Black 5%, no selection needed
            if (isSunStrip) {
              const blackFilm = config.films.find(f => f.name === 'Black');
              const price = blackFilm
                ? calculateServicePrice(vehicle, addonKey, blackFilm.id, config.pricing, config.vehicleClasses)
                : 0;
              return (
                <div key={addonKey} className="fwt-card" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{svc?.label || addonKey}</div>
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>AutoBahn Black - 5%</div>
                  <div className="fwt-price" style={{ fontSize: '1.2rem', marginTop: 8 }}>${price}</div>
                </div>
              );
            }

            // Get allowed shades for this addon
            const addonShades = addonConfig.filmId
              ? getAllowedShades(addonKey, addonConfig.filmId, config.filmShades, config.serviceShades, config.films)
              : [];

            const addonPrice = addonConfig.filmId
              ? calculateServicePrice(vehicle, addonKey, addonConfig.filmId, config.pricing, config.vehicleClasses)
              : 0;

            return (
              <div key={addonKey} className="fwt-card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>{svc?.label || addonKey}</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#666', marginBottom: 8 }}>Choose Your Film</div>

                <div className="fwt-films">
                  {availableFilms.map(film => {
                    const saveAmount = primaryServiceKey ? getAddonSaveAmount(addonKey, film.id) : 0;
                    return (
                      <FilmCard
                        key={film.id}
                        film={film}
                        isSelected={addonConfig.filmId === film.id}
                        onClick={() => onAddonFilmSelect(addonKey, addonConfig.filmId === film.id ? null : film.id)}
                        saveBadge={saveAmount > 0 ? `SAVE $${saveAmount}` : null}
                                displaySpecs={config.shopConfig.film_card_specs}
                        filmShades={config.filmShades.filter(s => s.film_id === film.id && s.offered)}
                      />
                    );
                  })}
                </div>

                {addonConfig.filmId && addonShades.length > 0 && (
                  <ShadePicker
                    label="Choose Your Shade(s)"
                    shades={addonShades}
                    selectedShade={addonConfig.shade}
                    onSelect={shade => onAddonShadeSelect(addonKey, shade)}
                    mostPopularShade={addonKey === 'FULL_WS' ? '56%' : undefined}
                  />
                )}

                {addonConfig.filmId && addonConfig.shade && (() => {
                  const saveAmt = getAddonSaveAmount(addonKey, addonConfig.filmId);
                  const discountedPrice = addonPrice - saveAmt;
                  return (
                    <div className="fwt-price" style={{ fontSize: '1.2rem', marginTop: 12 }}>
                      {saveAmt > 0 ? (
                        <>
                          <span style={{ textDecoration: 'line-through', color: '#999', fontSize: '1rem', marginRight: 8 }}>
                            ${addonPrice}
                          </span>
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>
                            ${discountedPrice}
                          </span>
                        </>
                      ) : (
                        <>${addonPrice}</>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
