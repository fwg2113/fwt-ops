'use client'

import { useState } from 'react'
import type { EstimatorState } from '@/app/lib/flat-glass-state'
import { formatPrice, calculatePriceBreakdown, PRICING_MULTIPLIER } from '@/app/lib/flat-glass-data'

interface Props {
  state: EstimatorState
  updateState: (updates: Partial<EstimatorState>) => void
  onSelectPath: (path: 'save' | 'consult' | 'commit') => void
  onBack: () => void
}

export default function OptionsSection({ state, updateState, onSelectPath, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false)

  // Calculate prices using the same system as TotalsPanel
  const filmId = state.selectedFilm?.filmId
  const breakdown = filmId ? calculatePriceBreakdown(filmId, state.rooms) : null
  const retailPrice = breakdown ? Math.round(breakdown.total * PRICING_MULTIPLIER) : 0
  const activeDiscount = state.promoDiscount || state.baseDiscount || 0.25
  const commitPrice = Math.round(retailPrice * (1 - activeDiscount))
  const savings = retailPrice - commitPrice
  const depositAmount = Math.round(commitPrice * 0.50)
  const discountPercent = Math.round(activeDiscount * 100)

  // Save-for-later gets a smaller discount
  const saveDiscount = Math.max(0, activeDiscount - 0.10)
  const savePrice = Math.round(retailPrice * (1 - saveDiscount))
  const saveDiscountPercent = Math.round(saveDiscount * 100)

  const handleSubmit = async (path: 'save' | 'commit') => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/flat-glass/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          propertyType: state.propertyType,
          contact: {
            name: state.contact.name,
            email: state.contact.email,
            phone: state.contact.phone,
            address: `${state.contact.street}, ${state.contact.city}, ${state.contact.state} ${state.contact.zip}`,
          },
          filmId: state.selectedFilm?.filmId,
          filmName: state.selectedFilm?.displayName,
          rooms: state.rooms,
          totals: {
            totalWindows: state.rooms.reduce((sum, r) => sum + r.windows.reduce((ws, w) => ws + (w.quantity || 1) * (w.panes || 1), 0), 0),
            totalSqFt: state.rooms.reduce((sum, r) => sum + r.windows.reduce((ws, w) => {
              const width = w.width === 'oversize' ? 120 : parseFloat(String(w.width)) || 0
              const height = w.height === 'oversize' ? 120 : parseFloat(String(w.height)) || 0
              return ws + (width * height / 144) * (w.quantity || 1) * (w.panes || 1)
            }, 0), 0),
            hasOversized: state.rooms.some(r => r.windows.some(w => w.width === 'oversize' || w.height === 'oversize')),
          },
          price: path === 'commit' ? commitPrice : savePrice,
          retailPrice,
          commitPrice: path === 'commit' ? commitPrice : null,
          depositAmount: path === 'commit' ? depositAmount : null,
          discount: path === 'commit' ? activeDiscount : saveDiscount,
          promoCode: state.promoCode || null,
          pricingMultiplier: PRICING_MULTIPLIER,
          baseDiscount: state.baseDiscount,
          answers: state.answers,
          distanceMiles: state.distance,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        updateState({
          submissionId: data.submissionId,
          selectedPath: path,
          price: path === 'commit' ? commitPrice : savePrice,
          commitPrice,
          commitSavings: savings,
          depositAmount,
        })
        onSelectPath(path)
      } else {
        alert(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      alert('Connection error. Please check your internet and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fwt-container centered-page">
      <div className="fwt-header">
        <h2>Ready to move forward?</h2>
        <p>
          Selected: <strong>{state.selectedFilm?.displayName}</strong>
        </p>
      </div>

      <h3 className="options-heading">Choose Your Next Step</h3>

      <div className="options-grid-commit-first">
        {/* PRIMARY: Commit Now */}
        <div className="option-card highlight commit-card" onClick={() => !submitting && handleSubmit('commit')}>
          <div className="option-badge save-badge">Save {discountPercent}%</div>
          <div className="option-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Commit Now</h3>
          <p className="urgency-text">
            <strong>Exclusive one-time offer!</strong> This {discountPercent}% discount is only
            available right now.
          </p>
          <ul>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Your price: <span className="price-strike">{formatPrice(retailPrice)}</span>{' '}
              <strong className="price-highlight">{formatPrice(commitPrice)}</strong>
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              You save: <strong className="price-highlight">{formatPrice(savings)}</strong>
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Due today: <strong>{formatPrice(depositAmount)}</strong> (50% deposit)
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Balance due upon completion
            </li>
          </ul>
          <div className="option-cta highlight">
            {submitting ? 'Submitting...' : `Pay ${formatPrice(depositAmount)} Deposit`}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        </div>

        {/* SECONDARY: Save Quote */}
        <div className="option-card save-card" onClick={() => !submitting && handleSubmit('save')}>
          <div className="option-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </div>
          <h3>Not Ready to Decide?</h3>
          <p>Save your quote and we&apos;ll email it to you. Take your time.</p>
          <ul>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Quote emailed to you
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Resume anytime with your link
            </li>
            {saveDiscountPercent > 0 && (
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                Your saved price: <strong>{formatPrice(savePrice)}</strong> ({saveDiscountPercent}% off)
              </li>
            )}
          </ul>
          <div className="option-cta">
            {submitting ? 'Submitting...' : 'Save & Email Quote'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
      </div>
    </div>
  )
}
