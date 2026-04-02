'use client'

interface Props {
  selectedFilm: { filmId: string; displayName: string } | null
  propertyType: 'residential' | 'commercial' | null
  onSelectPath: (path: 'self' | 'come') => void
  onBack: () => void
}

export default function PathChoiceSection({ selectedFilm, onSelectPath, onBack }: Props) {
  return (
    <div className="fwt-container centered-page">
      <div className="fwt-header">
        <h2>How would you like to proceed?</h2>
        <p>
          Selected: <strong>{selectedFilm?.displayName || 'Multiple films'}</strong>
        </p>
      </div>

      <div className="options-grid two-up">
        <div className="option-card highlight" onClick={() => onSelectPath('self')}>
          <div className="option-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20" />
              <path d="M5 20V8l7-5 7 5v12" />
              <path d="M10 20v-6h4v6" />
              <line x1="2" y1="20" x2="22" y2="2" />
            </svg>
          </div>
          <h3>Get an Instant Quote</h3>
          <p>Enter your window dimensions and get pricing now.</p>
          <ul>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Get pricing immediately
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Measure at your convenience
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              We verify before installation
            </li>
          </ul>
          <div className="option-cta highlight">
            Get Instant Quote
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        </div>

        <div className="option-card" onClick={() => onSelectPath('come')}>
          <div className="option-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h3>Too Busy to Measure?</h3>
          <p>We&apos;ll come measure everything and provide an exact quote.</p>
          <ul>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Professional measurements
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              See film samples in person
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Fee depends on distance &amp; project size
            </li>
            <li>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-warning)" strokeWidth="2"><circle cx="7" cy="7" r="7" /><text x="7" y="10" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="bold">$</text></svg>
              Fee credited toward your job
            </li>
          </ul>
          <div className="option-cta">
            Schedule a Visit
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
