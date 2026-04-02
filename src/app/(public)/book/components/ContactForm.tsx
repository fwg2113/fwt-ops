'use client';

import { ADDITIONAL_INTERESTS } from '../lib/types';

interface Props {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  additionalInterests: Set<string>;
  onFieldChange: (field: string, value: string) => void;
  onInterestToggle: (interest: string) => void;
}

export default function ContactForm({
  firstName, lastName, phone, email,
  additionalInterests,
  onFieldChange, onInterestToggle,
}: Props) {
  return (
    <div>
      <div className="fwt-divider" style={{ height: 1, background: '#e5e5e5', margin: '20px 0' }} />

      {/* Contact Fields */}
      <div className="fwt-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label htmlFor="fwt-first" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
            First name
          </label>
          <input
            id="fwt-first"
            className="fwt-select"
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={e => onFieldChange('firstName', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label htmlFor="fwt-last" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
            Last name
          </label>
          <input
            id="fwt-last"
            className="fwt-select"
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={e => onFieldChange('lastName', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label htmlFor="fwt-phone" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
            Phone
          </label>
          <input
            id="fwt-phone"
            className="fwt-select"
            type="tel"
            placeholder="(555) 555-5555"
            value={phone}
            onChange={e => onFieldChange('phone', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label htmlFor="fwt-email" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
            Email
          </label>
          <input
            id="fwt-email"
            className="fwt-select"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => onFieldChange('email', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Additional Interests */}
      <div style={{ margin: '30px 0' }}>
        <div className="fwt-divider" style={{ height: 1, background: '#e5e5e5', margin: '0 0 20px' }} />

        <label style={{ fontWeight: 800, display: 'block', marginBottom: 12, fontSize: '1rem' }}>
          I am also interested in... <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#666' }}>(Optional)</span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {ADDITIONAL_INTERESTS.map(interest => (
            <label key={interest} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={additionalInterests.has(interest)}
                onChange={() => onInterestToggle(interest)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem' }}>{interest}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
