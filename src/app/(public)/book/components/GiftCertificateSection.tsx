'use client';

import { useState } from 'react';
import type { GCValidation } from '../lib/types';

interface Props {
  onValidated: (gc: GCValidation | null) => void;
  gcValidation: GCValidation | null;
  shopPhone?: string | null;
  gcHelpText?: string | null;
  gcCallEnabled?: boolean;
  gcCallNumber?: string | null;
  gcTextEnabled?: boolean;
  gcTextNumber?: string | null;
}

export default function GiftCertificateSection({
  onValidated, gcValidation,
  shopPhone, gcHelpText, gcCallEnabled, gcCallNumber, gcTextEnabled, gcTextNumber,
}: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const callNumber = gcCallNumber || shopPhone || '';
  const textNumber = gcTextNumber || shopPhone || '';
  const showCall = gcCallEnabled !== false && callNumber;
  const showText = gcTextEnabled !== false && textNumber;
  const helpText = gcHelpText || 'If you\'re having issues with validating, please let us know:';

  async function handleValidate() {
    if (!code.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auto/validate-gc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        onValidated(data as GCValidation);
      } else {
        setError(data.error || 'Invalid code');
        onValidated(null);
      }
    } catch {
      setError('Validation failed. Please try again.');
      onValidated(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fwt-card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, marginBottom: 16, fontSize: '1.1rem' }}>
        Have a Gift Certificate or Promo Code?
      </div>

      {/* Input and Validate Button */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Enter code"
          maxLength={10}
          inputMode="text"
          style={{
            flex: 1, minWidth: 200, padding: '12px 16px',
            border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem',
          }}
          onKeyDown={e => e.key === 'Enter' && handleValidate()}
        />
        <button
          type="button"
          onClick={handleValidate}
          disabled={loading}
          style={{
            background: '#ffffff', color: '#1a1a1a', border: '2px solid #d0d0d0',
            padding: '12px 24px', borderRadius: 24, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {loading ? 'Validating...' : 'Validate'}
        </button>
      </div>

      {/* Status Messages */}
      {gcValidation && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#16a34a', fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#16a34a" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.41 5.59L7 10l-2.41-2.41L5.3 6.88 7 8.59l3.71-3.71.7.71z"/>
            </svg>
            Code validated! Credit: ${gcValidation.amount}
          </div>
          {gcValidation.discountType === 'dollar' && (
            <div style={{ color: '#d61f26', fontStyle: 'italic', fontSize: '0.9rem', marginTop: 4 }}>
              Not applicable on Sun Strips, or Sun Roofs without a primary service!
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, color: '#d61f26', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Help Text + Contact Buttons */}
      {(showCall || showText) && (
        <>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: 12 }}>
            {helpText}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {showCall && (
              <a
                href={`tel:${callNumber}`}
                style={{
                  background: '#ffffff', color: '#1a1a1a', border: '2px solid #d0d0d0',
                  padding: '10px 20px', borderRadius: 24, fontWeight: 700,
                  textDecoration: 'none', fontSize: '0.95rem',
                }}
              >
                Call Us
              </a>
            )}
            {showText && (
              <a
                href={`sms:${textNumber}`}
                style={{
                  background: '#ffffff', color: '#1a1a1a', border: '2px solid #d0d0d0',
                  padding: '10px 20px', borderRadius: 24, fontWeight: 700,
                  textDecoration: 'none', fontSize: '0.95rem',
                }}
              >
                Text Us
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
