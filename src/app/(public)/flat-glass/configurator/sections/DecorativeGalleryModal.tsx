'use client'

import { useState } from 'react'
import { DECORATIVE_FILMS, DECORATIVE_MINIMUM } from '@/app/lib/flat-glass-data'

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  standard: { label: 'Standard', color: '#22c55e' },
  premium: { label: 'Premium', color: '#3b82f6' },
  designer: { label: 'Designer', color: '#8b5cf6' },
  specialty: { label: 'Specialty', color: '#f59e0b' },
}

interface Props {
  onSelect: (filmId: string, displayName: string) => void
  onClose: () => void
}

export default function DecorativeGalleryModal({ onSelect, onClose }: Props) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const popularFilms = DECORATIVE_FILMS.filter((f) => f.popular)
  const otherFilms = DECORATIVE_FILMS.filter((f) => !f.popular)

  const selectedFilm = selectedCode ? DECORATIVE_FILMS.find((f) => f.code === selectedCode) : null

  const handleContinue = () => {
    if (selectedFilm) {
      onSelect('decorative', selectedFilm.name)
    }
  }

  const renderCard = (film: (typeof DECORATIVE_FILMS)[0]) => {
    const tier = TIER_LABELS[film.tier] || TIER_LABELS.standard
    const maxWidth = Math.max(...film.availableWidths)
    const directionLabel = film.direction === 'H' ? 'Horiz' : film.direction === 'V' ? 'Vert' : ''
    const isSelected = selectedCode === film.code

    return (
      <div
        key={film.code}
        className={`decorative-card ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedCode(isSelected ? null : film.code)}
      >
        <div className="decorative-card-check">
          {isSelected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </div>
        <div className="decorative-tier-badge" style={{ background: tier.color }}>
          {tier.label}
        </div>
        <div className="decorative-card-image">
          <img src={film.image} alt={film.name} loading="lazy" />
        </div>
        <div className="decorative-card-info">
          <div className="decorative-card-name">{film.name}</div>
          <div className="decorative-card-meta">
            <span className="decorative-price">${film.ratePerSqFt}/sqft</span>
            <span className="decorative-size">
              {maxWidth}&quot;{directionLabel ? ` ${directionLabel}` : ''}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fwt-decorative-modal-overlay" onClick={onClose}>
      <div className="fwt-decorative-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="decorative-modal-header">
          <h2>Decorative Privacy Films</h2>
          <p>Select the pattern you&apos;re interested in. Pricing shown is per square foot (10% waste factor included).</p>
          <div className="decorative-tier-legend">
            <span className="tier-item"><span className="tier-dot" style={{ background: '#22c55e' }} /> Standard $18-20</span>
            <span className="tier-item"><span className="tier-dot" style={{ background: '#3b82f6' }} /> Premium $25-28</span>
            <span className="tier-item"><span className="tier-dot" style={{ background: '#8b5cf6' }} /> Designer $30-35</span>
            <span className="tier-item"><span className="tier-dot" style={{ background: '#f59e0b' }} /> Specialty $38-40</span>
          </div>
        </div>

        <div className="decorative-modal-body">
          <div className="decorative-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" /></svg>
            {' '}Most Popular
          </div>
          <div className="decorative-grid">
            {popularFilms.map(renderCard)}
          </div>

          <div className="decorative-section-label">More Options</div>
          <div className="decorative-grid">
            {otherFilms.map(renderCard)}
          </div>

          <div className="decorative-note">
            <span className="note-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </span>
            <div>
              <strong>${DECORATIVE_MINIMUM} minimum</strong> for decorative film projects.<br />
              Size constraints apply based on roll widths. We&apos;ll confirm during consultation.
            </div>
          </div>
        </div>

        <div className="decorative-modal-footer">
          <div className="decorative-selections-display">
            {selectedFilm ? (
              <><strong>Selected:</strong> {selectedFilm.name} <span style={{ color: '#666' }}>(${selectedFilm.ratePerSqFt}/sqft)</span></>
            ) : (
              'Click a film to select it'
            )}
          </div>
          <button className="btn btn-primary" onClick={handleContinue} disabled={!selectedFilm}>
            Continue with Selected
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
