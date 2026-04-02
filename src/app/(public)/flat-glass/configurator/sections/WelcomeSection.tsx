'use client'

import { useState } from 'react'

interface Props {
  onStart: (promoCode: string, promoDiscount: number) => void
}

export default function WelcomeSection({ onStart }: Props) {
  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<'idle' | 'valid' | 'invalid' | 'checking'>('idle')
  const [appliedDiscount, setAppliedDiscount] = useState(0)
  const [appliedLabel, setAppliedLabel] = useState('')

  const applyCode = async () => {
    if (!code.trim()) return
    setCodeStatus('checking')

    try {
      const res = await fetch('/api/flat-glass/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()

      if (data.valid) {
        setCodeStatus('valid')
        setAppliedDiscount(data.discount)
        setAppliedLabel(data.label)
      } else {
        setCodeStatus('invalid')
        setAppliedDiscount(0)
        setAppliedLabel('')
      }
    } catch {
      setCodeStatus('invalid')
      setAppliedDiscount(0)
      setAppliedLabel('')
    }
  }

  const handleStart = () => {
    onStart(
      codeStatus === 'valid' ? code.trim().toUpperCase() : '',
      codeStatus === 'valid' ? appliedDiscount : 0
    )
  }

  const displayDiscount = codeStatus === 'valid' ? Math.round(appliedDiscount * 100) : 25

  return (
    <div className="fwt-container">
      <div className="welcome-section">
        {/* Hero */}
        <div className="welcome-hero">
          <div className="welcome-badge">Online Exclusive</div>
          <h1 className="welcome-headline">
            Get <span className="welcome-discount-num">{displayDiscount}% Off</span> Your Window Film Project
          </h1>
          <p className="welcome-sub">
            Instant quotes, transparent pricing, no appointment needed.
            Our online estimator gives you the best price available — guaranteed.
          </p>
        </div>

        {/* Promo Code */}
        <div className="welcome-promo-section">
          <div className="promo-input-row">
            <input
              type="text"
              className={`promo-input ${codeStatus === 'valid' ? 'valid' : codeStatus === 'invalid' ? 'invalid' : ''}`}
              placeholder="Have a promo code? Enter it here"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                if (codeStatus !== 'idle') setCodeStatus('idle')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim()) applyCode()
              }}
            />
            <button
              className="btn btn-secondary promo-apply-btn"
              onClick={applyCode}
              disabled={!code.trim()}
            >
              Apply
            </button>
          </div>
          {codeStatus === 'valid' && (
            <div className="promo-message promo-valid">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              Code applied — you&apos;re getting <strong>{appliedLabel}</strong>!
            </div>
          )}
          {codeStatus === 'invalid' && (
            <div className="promo-message promo-invalid">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Code not recognized. You&apos;ll still get <strong>25% off</strong>.
            </div>
          )}
          {codeStatus === 'idle' && !code && (
            <p className="promo-note">No code? No problem — everyone gets <strong>25% off</strong> online.</p>
          )}
        </div>

        {/* How It Works */}
        <div className="welcome-steps">
          <h2 className="welcome-steps-title">How It Works</h2>
          <div className="welcome-steps-grid">
            <div className="welcome-step">
              <div className="welcome-step-num">1</div>
              <div className="welcome-step-content">
                <strong>Measure Your Windows</strong>
                <span>Quick measurements — just a tape measure and 5 minutes</span>
              </div>
            </div>
            <div className="welcome-step">
              <div className="welcome-step-num">2</div>
              <div className="welcome-step-content">
                <strong>Choose Your Film</strong>
                <span>See real prices per film based on your measurements</span>
              </div>
            </div>
            <div className="welcome-step">
              <div className="welcome-step-num">3</div>
              <div className="welcome-step-content">
                <strong>Lock In Your Price</strong>
                <span>Commit today for the best deal or save your quote for later</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="welcome-cta">
          <button className="btn btn-primary btn-lg" onClick={handleStart}>
            Start My Quote
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <p className="welcome-cta-note">Takes about 5 minutes. No account required.</p>
        </div>

        {/* Trust signals */}
        <div className="welcome-trust">
          <div className="trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <span>17+ Years Experience</span>
          </div>
          <div className="trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            <span>Licensed &amp; Insured</span>
          </div>
          <div className="trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            <span>5-Star Rated</span>
          </div>
        </div>
      </div>
    </div>
  )
}
