'use client'

interface Props {
  onContinue: () => void
  onBack: () => void
}

export default function PrimerSection({ onContinue, onBack }: Props) {
  return (
    <div className="fwt-container centered-page">
      <div className="fwt-header">
        <h2>Before We Start</h2>
        <p>A quick word on how window film works</p>
      </div>

      <div className="primer-box">
        <h3>All window films balance appearance and performance:</h3>
        <ul className="primer-list">
          <li className="primer-item reflective">
            <span className="primer-swatch reflective" />
            <div>
              <strong>Darker / More Reflective</strong>
              <br />
              Better heat rejection, glare reduction &amp; daytime privacy
            </div>
          </li>
          <li className="primer-item neutral">
            <span className="primer-swatch neutral" />
            <div>
              <strong>Lighter / More Neutral</strong>
              <br />
              Subtler look, but less effective at blocking heat &amp; glare
            </div>
          </li>
        </ul>
        <p className="primer-note">
          There&apos;s no &quot;best&quot; film — just the best fit for{' '}
          <em>your</em> priorities. These questions help us find it.
        </p>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <button className="btn btn-primary" onClick={onContinue}>
          Got It
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  )
}
