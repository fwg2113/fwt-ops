'use client'

import type { EstimatorState } from '@/app/lib/flat-glass-state'
import { formatPrice, CONFIG } from '@/app/lib/flat-glass-data'

interface Props {
  state: EstimatorState
  onStartOver: () => void
}

export default function ConfirmationSection({ state, onStartOver }: Props) {
  const isSave = state.selectedPath === 'save'
  const isCommit = state.selectedPath === 'commit'
  const isRequest = state.selectedPath === 'request'

  return (
    <div className="fwt-container centered-page confirmation">
      <div className="confirmation-icon">
        {isSave ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        ) : isRequest ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" />
          </svg>
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--fwt-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
      </div>

      <h2>
        {isSave
          ? 'Quote Saved!'
          : isRequest
          ? 'Request Submitted!'
          : 'Appointment Confirmed!'}
      </h2>

      {isSave && (
        <>
          <p>
            We&apos;ve sent your quote to <strong>{state.contact.email}</strong>.
          </p>
          <p>Click the link in the email anytime to pick up where you left off.</p>
          <div className="incentive-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            <strong>Book within 14 days for 10% off!</strong>
          </div>
        </>
      )}

      {isRequest && (
        <>
          <p>Thank you, {state.contact.name}!</p>
          <p>
            We&apos;ll reach out within <strong>1 business day</strong> to confirm scheduling
            and discuss pricing.
          </p>
          <div className="confirmation-details">
            <div className="detail-row">
              <span>Film:</span>
              <strong>{state.selectedFilm?.displayName}</strong>
            </div>
            {state.windowCountEstimate && (
              <div className="detail-row">
                <span>Est. Windows:</span>
                <strong>{state.windowCountEstimate}</strong>
              </div>
            )}
          </div>
        </>
      )}

      {isCommit && (
        <>
          <p>Thank you, {state.contact.name}! Your deposit has been received.</p>
          <div className="confirmation-details">
            <div className="detail-row">
              <span>Film:</span>
              <strong>{state.selectedFilm?.displayName}</strong>
            </div>
            <div className="detail-row">
              <span>Windows:</span>
              <strong>
                {state.totals.totalWindows} ({state.totals.totalSqFt.toFixed(1)} sq ft)
              </strong>
            </div>
            <div className="detail-row">
              <span>Commit Price:</span>
              <strong>{formatPrice(state.commitPrice)}</strong>
            </div>
            <div className="detail-row">
              <span>Deposit Paid:</span>
              <strong>{formatPrice(state.depositAmount)}</strong>
            </div>
            <div className="detail-row">
              <span>Balance Due:</span>
              <strong>{formatPrice(state.commitPrice - state.depositAmount)}</strong>
            </div>
          </div>
        </>
      )}

      {!isSave && !isCommit && !isRequest && (
        <>
          <p>Thank you, {state.contact.name}!</p>
          <div className="confirmation-details">
            <div className="detail-row">
              <span>Film:</span>
              <strong>{state.selectedFilm?.displayName}</strong>
            </div>
            <div className="detail-row">
              <span>Estimate:</span>
              <strong>{formatPrice(state.price)}</strong>
            </div>
          </div>
        </>
      )}

      <p className="contact-note">
        Questions? Call{' '}
        <a href={`tel:${CONFIG.PHONE}`}>{CONFIG.PHONE}</a>
      </p>

      <button className="btn btn-secondary" onClick={onStartOver}>
        Start New Estimate
      </button>
    </div>
  )
}
