'use client'

import { useState } from 'react'
import { SECURITY_FILM_OPTIONS, SECURITY_MINIMUM } from '@/app/lib/flat-glass-data'
import type { SecurityFilmOption } from '@/app/lib/flat-glass-data'

interface Props {
  onSelect: (filmId: string, displayName: string) => void
  onClose: () => void
}

export default function SecurityOptionsModal({ onSelect, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedOption = selectedId ? SECURITY_FILM_OPTIONS.find((o) => o.id === selectedId) : null

  const handleContinue = () => {
    if (selectedOption) {
      onSelect('security', `Security Film - ${selectedOption.label}`)
    }
  }

  return (
    <div className="fwt-security-modal-overlay" onClick={onClose}>
      <div className="fwt-security-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="security-modal-header">
          <h2>Security / Safety Film</h2>
          <p>Security film holds glass together on impact, protecting against break-ins and accidents.</p>
        </div>

        <div className="security-modal-body">
          <div className="security-options-list">
            {SECURITY_FILM_OPTIONS.map((opt) => {
              const isSelected = selectedId === opt.id
              return (
                <div
                  key={opt.id}
                  className={`security-option-card ${isSelected ? 'selected' : ''} ${opt.recommended ? 'recommended' : ''}`}
                  onClick={() => setSelectedId(isSelected ? null : opt.id)}
                >
                  <div className={`security-radio ${isSelected ? 'checked' : ''}`} />
                  <div className="security-content">
                    <div className="security-label">{opt.label}</div>
                    <div className="security-desc">{opt.desc}</div>
                  </div>
                  {opt.recommended && <span className="security-badge">Most Common</span>}
                </div>
              )
            })}
          </div>

          <div className="security-note">
            <span className="note-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </span>
            <div>
              Security film pricing will be provided during consultation based on glass size and quantity.
            </div>
          </div>
        </div>

        <div className="security-modal-footer">
          <button className="btn btn-primary" onClick={handleContinue} disabled={!selectedOption}>
            Continue with Selected
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
