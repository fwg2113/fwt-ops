'use client'

interface Props {
  onSelect: (type: 'residential' | 'commercial') => void
}

export default function PropertyTypeSection({ onSelect }: Props) {
  return (
    <div className="property-type-page">
      <div className="property-type-inner">
        <div className="property-type-step">Step 1 of 3</div>
        <h1 className="property-type-headline">Where are we tinting?</h1>
        <p className="property-type-sub">This helps us show the right room types and window options</p>

        <div className="property-type-options">
          <div className="property-type-card" onClick={() => onSelect('residential')}>
            <div className="property-type-icon-wrap">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="property-type-label">Home</div>
            <div className="property-type-desc">Residential property</div>
            <div className="property-type-examples">Living room, bedroom, kitchen, bathroom</div>
          </div>

          <div className="property-type-card" onClick={() => onSelect('commercial')}>
            <div className="property-type-icon-wrap">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
              </svg>
            </div>
            <div className="property-type-label">Business</div>
            <div className="property-type-desc">Commercial property</div>
            <div className="property-type-examples">Office, storefront, conference room, lobby</div>
          </div>
        </div>

        <div className="property-type-discount-reminder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
          Your online discount is locked in
        </div>
      </div>
    </div>
  )
}
