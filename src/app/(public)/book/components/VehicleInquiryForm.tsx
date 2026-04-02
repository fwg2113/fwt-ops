'use client';

import { useState } from 'react';

interface Props {
  onBack: () => void;
}

export default function VehicleInquiryForm({ onBack }: Props) {
  const [form, setForm] = useState({
    year: '', make: '', model: '',
    name: '', email: '', phone: '',
    notes: '',
  });
  const [services, setServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const serviceOptions = [
    'Full Tint (Sides & Rear)',
    'Front Two Doors Only',
    'Full Windshield',
    'Sunroof',
    'Sun Strip (Top Strip)',
    'Commercial Window Tint',
    'Residential Window Tint',
    'Paint Protection Film',
  ];

  function toggleService(svc: string) {
    setServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]);
  }

  async function handleSubmit() {
    if (!form.year || !form.make || !form.model || !form.name || !form.phone) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auto/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, services }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Failed to submit inquiry');
      }
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="fwt-card" style={{ marginBottom: 30, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 12 }}>
          Thank You!
        </div>
        <div style={{ fontSize: '1.1rem', color: '#666', lineHeight: 1.6 }}>
          We&apos;ve received your inquiry and will get in touch soon to discuss pricing and scheduling.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 30 }}>
      <div className="fwt-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 }}>
            We&apos;d Love to Help With Your Vehicle!
          </div>
          <div style={{ fontSize: '1.1rem', color: '#666', lineHeight: 1.6 }}>
            Please provide your vehicle details and we&apos;ll get in touch soon to discuss pricing and scheduling.
          </div>
        </div>

        {/* Vehicle Information */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>Vehicle Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <input type="text" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
              placeholder="Year (e.g., 2023)" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
            <input type="text" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
              placeholder="Make (e.g., Ferrari)" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
            <input type="text" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="Model (e.g., 296 GTB)" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
          </div>
        </div>

        {/* Contact Information */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>Your Contact Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full Name" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="Email Address" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="Phone Number" style={{ padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }} />
          </div>
        </div>

        {/* Services Interested In */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>Services Interested In</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {serviceOptions.map(svc => (
              <label key={svc} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={services.includes(svc)} onChange={() => toggleService(svc)} />
                <span>{svc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Additional Notes */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>
            Additional Notes <span style={{ fontWeight: 400, color: '#666' }}>(Optional)</span>
          </div>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Tell us more about your vehicle or any special concerns..."
            style={{ width: '100%', minHeight: 120, padding: '12px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {error && <div style={{ color: '#d61f26', fontWeight: 600, marginBottom: 16 }}>{error}</div>}

        <button type="button" onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: 16, background: '#d61f26', color: 'white', border: 'none', borderRadius: 8, fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer' }}>
          {submitting ? 'Submitting...' : 'Submit Inquiry'}
        </button>

        <button type="button" onClick={onBack}
          style={{ width: '100%', padding: 12, marginTop: 12, background: 'white', color: '#1a1a1a', border: '2px solid #d0d0d0', borderRadius: 8, fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>
          Back to Vehicle Selection
        </button>
      </div>
    </div>
  );
}
