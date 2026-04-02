'use client'

import { useState } from 'react'
import { FILM_DATA, SELECTOR_FILMS, FILTER_DEFINITIONS, PRICING_MULTIPLIER, DEFAULT_PRICING, calculatePriceBreakdown, formatPrice } from '@/app/lib/flat-glass-data'
import type { EstimatorState } from '@/app/lib/flat-glass-state'
import FilmSimulatorModal from './FilmSimulatorModal'
import DecorativeGalleryModal from './DecorativeGalleryModal'
import SecurityOptionsModal from './SecurityOptionsModal'

const RATING_LABELS: Record<string, string> = {
  heat: 'Heat Rejection',
  glare: 'Glare Reduction',
  privacy: 'Daytime Privacy',
  light: 'Natural Light',
  neutral: 'Neutral Look',
}

interface Props {
  filter: string
  onFilterChange: (filter: string) => void
  onSelectFilm: (filmId: string, displayName: string) => void
  onGoToQuestions: () => void
  onBack: () => void
  state: EstimatorState
  updateState: (updates: Partial<EstimatorState>) => void
}

export default function FilmSelectorSection({
  filter,
  onFilterChange,
  onSelectFilm,
  onGoToQuestions,
  onBack,
  state,
  updateState,
}: Props) {
  const [simulatorFilmId, setSimulatorFilmId] = useState<string | null>(null)
  const [showDecorativeModal, setShowDecorativeModal] = useState(false)
  const [showSecurityModal, setShowSecurityModal] = useState(false)

  const filteredFilms = SELECTOR_FILMS.filter((filmId) =>
    FILM_DATA[filmId].filters.includes(filter)
  )

  const hasWindows = state.rooms.some((r) => r.windows.length > 0)
  const activeDiscount = state.promoDiscount || state.baseDiscount || 0.25

  // Calculate price per film based on measurements already collected
  const getFilmPrice = (filmId: string): { retail: number; discounted: number } | null => {
    if (!hasWindows) return null
    const breakdown = calculatePriceBreakdown(filmId, state.rooms)
    if (breakdown.total === 0) return null
    const retail = Math.round(breakdown.total * PRICING_MULTIPLIER)
    const discounted = Math.round(retail * (1 - activeDiscount))
    return { retail, discounted }
  }

  return (
    <div className="fwt-container content-page film-selector-container">
      <div className="fwt-header">
        <h1>{hasWindows ? 'Choose Your Film to Lock In Your Price' : 'Find Your Perfect Film'}</h1>
        <p>{hasWindows ? 'Prices below are based on your window measurements' : 'Select what matters most to you, then choose a solution'}</p>
      </div>

      {/* Not Sure — prominent option at top */}
      <div className="not-sure-banner" onClick={onGoToQuestions}>
        <div className="not-sure-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="not-sure-content">
          <strong>Not sure which film is right for you?</strong>
          <span>Answer a few quick questions and we&apos;ll recommend the best solution for your needs</span>
        </div>
        <div className="not-sure-arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-section">
        <div className="filter-label">What Matters Most To You?</div>
        <div className="filter-tabs">
          {Object.entries(FILTER_DEFINITIONS).map(([key, f]) => (
            <div
              key={key}
              className={`filter-tab ${filter === key ? 'active' : ''}`}
              onClick={() => onFilterChange(key)}
            >
              <div className="filter-tab-header">
                <span className="filter-letter">{key}</span>
                <span className="filter-tab-title">{f.title}</span>
              </div>
              <div className="filter-tab-desc">{f.desc}</div>
              <div className="filter-tab-features">
                {f.features.map((feat) => (
                  <span key={feat} className="filter-feature">
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Traditional Solutions */}
      <div className="section-label">Traditional Solutions</div>
      <div className="films-grid">
        {filteredFilms.map((filmId) => {
          const film = FILM_DATA[filmId]
          return (
            <div
              key={filmId}
              className="film-card"
              onClick={() => {
                if (film.hasSimulator) {
                  setSimulatorFilmId(filmId)
                } else {
                  onSelectFilm(filmId, film.displayName)
                }
              }}
            >
              {film.isMostPopular && (
                <div className="popular-badge">Most Popular</div>
              )}
              <div className={`film-swatch ${film.swatchClass}`}>
                <span className="swatch-vlt">{film.shadeVLT}%</span>
              </div>
              <div className="film-name">{film.displayName}</div>
              <div className="film-tagline">{film.shortTagline}</div>
              <div className="film-ratings">
                {(['heat', 'glare', 'privacy', 'light', 'neutral'] as const).map(
                  (key) => (
                    <div key={key} className="rating-row">
                      <span className="rating-label">{RATING_LABELS[key]}</span>
                      <div className="rating-dots">
                        {Array.from({ length: 6 }, (_, i) => (
                          <span
                            key={i}
                            className={`rating-dot ${
                              i < film.ratings[key] ? `filled ${key}` : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
              {(() => {
                const price = getFilmPrice(filmId)
                if (price) {
                  return (
                    <div className="film-price-row">
                      <span className="film-price-retail">{formatPrice(price.retail)}</span>
                      <span className="film-price-deal">{formatPrice(price.discounted)}</span>
                    </div>
                  )
                }
                return null
              })()}
              <button className="film-btn">View &amp; Select</button>
            </div>
          )
        })}
      </div>

      {/* Specialty Solutions */}
      <div className="section-label" style={{ textAlign: 'center' }}>Specialty Solutions</div>
      <div className="specialty-grid">
        <div
          className="film-card specialty-card"
          onClick={() => setShowDecorativeModal(true)}
        >
          <div className="film-swatch decorative">
            <span className="specialty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 0 0 20" fill="currentColor" opacity="0.3" />
              </svg>
            </span>
          </div>
          <div className="film-name">Decorative Privacy</div>
          <div className="specialty-desc">
            Frosted patterns, gradients, logos &amp; custom designs. 24/7
            privacy options available.
          </div>
          <button className="film-btn">Browse 30+ Options</button>
        </div>

        <div
          className="film-card specialty-card"
          onClick={() => setShowSecurityModal(true)}
        >
          <div className="film-swatch security">
            <span className="specialty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
          </div>
          <div className="film-name">Security / Safety</div>
          <div className="specialty-desc">
            Shatter resistance, break-in deterrent, code compliance films.
          </div>
          <button className="film-btn">View Options</button>
        </div>
      </div>

      <div className="actions" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      {/* Modals */}
      {simulatorFilmId && (
        <FilmSimulatorModal
          filmId={simulatorFilmId}
          onSelect={(filmId, displayName) => {
            setSimulatorFilmId(null)
            onSelectFilm(filmId, displayName)
          }}
          onClose={() => setSimulatorFilmId(null)}
        />
      )}

      {showDecorativeModal && (
        <DecorativeGalleryModal
          onSelect={(filmId, displayName) => {
            setShowDecorativeModal(false)
            onSelectFilm(filmId, displayName)
          }}
          onClose={() => setShowDecorativeModal(false)}
        />
      )}

      {showSecurityModal && (
        <SecurityOptionsModal
          onSelect={(filmId, displayName) => {
            setShowSecurityModal(false)
            onSelectFilm(filmId, displayName)
          }}
          onClose={() => setShowSecurityModal(false)}
        />
      )}
    </div>
  )
}
