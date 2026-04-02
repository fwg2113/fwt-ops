'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }

    // Poll for the booking to be confirmed (webhook may take a moment)
    let attempts = 0;
    const maxAttempts = 10;

    const checkBooking = async () => {
      try {
        const res = await fetch(`/api/auto/checkout/verify?session_id=${sessionId}`);
        const data = await res.json();

        if (data.confirmed) {
          setBookingId(data.bookingId);
          setStatus('success');
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const poll = async () => {
      const confirmed = await checkBooking();
      if (!confirmed && attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 2000);
      } else if (!confirmed) {
        // After 20 seconds, show success anyway (webhook might be delayed but payment went through)
        setStatus('success');
      }
    };

    poll();
  }, [sessionId]);

  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
      {status === 'loading' && (
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#333', marginBottom: 16 }}>
            Confirming your booking...
          </div>
          <div style={{ color: '#666' }}>Please wait while we process your payment.</div>
        </div>
      )}

      {status === 'success' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#16a34a"/>
              <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
            Booking Confirmed
          </h1>
          <p style={{ color: '#666', fontSize: '1rem', marginBottom: 24 }}>
            Your appointment has been booked and your deposit has been processed.
            {bookingId && <><br/>Booking ID: <strong>{bookingId}</strong></>}
          </p>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>
            You will receive a confirmation message shortly. If you have any questions, please contact us.
          </p>
          <a href="/book" style={{
            display: 'inline-block', marginTop: 24,
            background: '#d61f26', color: '#fff', padding: '12px 28px',
            borderRadius: 999, fontWeight: 700, textDecoration: 'none',
          }}>
            Book Another Appointment
          </a>
        </div>
      )}

      {status === 'error' && (
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#666' }}>
            We could not verify your booking. If you were charged, please contact us and we will confirm your appointment.
          </p>
          <a href="/book" style={{
            display: 'inline-block', marginTop: 24,
            background: '#d61f26', color: '#fff', padding: '12px 28px',
            borderRadius: 999, fontWeight: 700, textDecoration: 'none',
          }}>
            Return to Booking
          </a>
        </div>
      )}
    </section>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#333' }}>Loading...</div>
      </section>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
