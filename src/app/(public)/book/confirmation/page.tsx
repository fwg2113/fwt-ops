'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

interface BookingDetails {
  customerName: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  services: Array<{ service_label?: string; film_name?: string; shade_label?: string }>;
  subtotal: number;
  discountAmount: number;
  depositPaid: number;
  balanceDue: number;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
}

function formatDate(date: string | null): string {
  if (!date) return '';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return date; }
}

function formatTime(time: string | null): string {
  if (!time) return '';
  try {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return time; }
}

function buildGoogleCalendarUrl(details: BookingDetails, bookingId: string | null): string {
  const date = details.appointmentDate?.replace(/-/g, '') || '';
  const time = details.appointmentTime?.replace(/:/g, '') || '090000';
  // Assume 2 hour appointment
  const startHour = parseInt(details.appointmentTime?.split(':')[0] || '9');
  const endHour = startHour + 2;
  const endTime = `${endHour.toString().padStart(2, '0')}${details.appointmentTime?.split(':')[1] || '00'}00`;
  const start = `${date}T${time}00`;
  const end = `${date}T${endTime}`;
  const vehicle = [details.vehicleYear, details.vehicleMake, details.vehicleModel].filter(Boolean).join(' ');
  const title = encodeURIComponent(`${details.shopName} - ${vehicle}`);
  const desc = encodeURIComponent(`Booking ID: ${bookingId || 'N/A'}\nVehicle: ${vehicle}\nDeposit Paid: $${details.depositPaid}\nBalance Due: $${details.balanceDue}`);
  const location = encodeURIComponent(details.shopAddress);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${desc}&location=${location}`;
}

function buildIcsContent(details: BookingDetails, bookingId: string | null): string {
  const date = details.appointmentDate?.replace(/-/g, '') || '';
  const time = details.appointmentTime?.replace(/:/g, '') || '090000';
  const startHour = parseInt(details.appointmentTime?.split(':')[0] || '9');
  const endHour = startHour + 2;
  const endTime = `${endHour.toString().padStart(2, '0')}${details.appointmentTime?.split(':')[1] || '00'}00`;
  const vehicle = [details.vehicleYear, details.vehicleMake, details.vehicleModel].filter(Boolean).join(' ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${date}T${time}00`,
    `DTEND:${date}T${endTime}`,
    `SUMMARY:${details.shopName} - ${vehicle}`,
    `DESCRIPTION:Booking ID: ${bookingId || 'N/A'}\\nVehicle: ${vehicle}\\nDeposit: $${details.depositPaid}\\nBalance: $${details.balanceDue}`,
    `LOCATION:${details.shopAddress}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [details, setDetails] = useState<BookingDetails | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;

    const checkBooking = async () => {
      try {
        const res = await fetch(`/api/auto/checkout/verify?session_id=${sessionId}`);
        const data = await res.json();

        if (data.confirmed) {
          setBookingId(data.bookingId);
          if (data.details) setDetails(data.details);
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
        setStatus('success');
      }
    };

    poll();
  }, [sessionId]);

  const vehicle = details
    ? [details.vehicleYear, details.vehicleMake, details.vehicleModel].filter(Boolean).join(' ')
    : '';

  return (
    <section style={{ maxWidth: 500, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {status === 'loading' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 48, height: 48, border: '4px solid #e5e7eb', borderTopColor: '#16a34a',
            borderRadius: '50%', margin: '0 auto 20px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#333', marginBottom: 8 }}>
            Confirming your booking...
          </div>
          <div style={{ color: '#666' }}>Please wait while we process your payment.</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {status === 'success' && (
        <div>
          {/* Success header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ marginBottom: 16 }}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="32" fill="#16a34a"/>
                <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 4px' }}>
              Booking Confirmed
            </h1>
            {bookingId && (
              <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
                Booking ID: <strong>{bookingId}</strong>
              </p>
            )}
          </div>

          {/* Appointment details card */}
          {details && (
            <div style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
              overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {/* Vehicle + Date header */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                  {vehicle}
                </div>
                <div style={{ fontSize: '0.95rem', color: '#555' }}>
                  {formatDate(details.appointmentDate)}
                  {details.appointmentTime && ` at ${formatTime(details.appointmentTime)}`}
                </div>
                {details.appointmentType && (
                  <div style={{
                    display: 'inline-block', marginTop: 8,
                    padding: '3px 10px', borderRadius: 12,
                    background: '#f0fdf4', color: '#15803d',
                    fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
                  }}>
                    {details.appointmentType.replace(/_/g, ' ')}
                  </div>
                )}
              </div>

              {/* Services */}
              {Array.isArray(details.services) && details.services.length > 0 && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Services</div>
                  {details.services.map((svc, i) => (
                    <div key={i} style={{ fontSize: '0.9rem', color: '#333', padding: '3px 0' }}>
                      {svc.service_label}
                      {svc.film_name && <span style={{ color: '#666' }}> -- {svc.film_name}</span>}
                      {svc.shade_label && <span style={{ color: '#888' }}> ({svc.shade_label})</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Payment summary */}
              <div style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
                  <span style={{ color: '#666' }}>Subtotal</span>
                  <span style={{ color: '#333', fontWeight: 500 }}>${(details.subtotal || 0).toFixed(2)}</span>
                </div>
                {details.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#16a34a' }}>Discount</span>
                    <span style={{ color: '#16a34a', fontWeight: 500 }}>-${details.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
                  <span style={{ color: '#16a34a' }}>Deposit Paid</span>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>-${(details.depositPaid || 0).toFixed(2)}</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '8px 0 0',
                  borderTop: '1px solid #f3f4f6', marginTop: 4,
                  fontSize: '1rem', fontWeight: 700,
                }}>
                  <span style={{ color: '#1a1a1a' }}>Balance Due</span>
                  <span style={{ color: '#1a1a1a' }}>${(details.balanceDue || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Add to Calendar buttons */}
          {details && details.appointmentDate && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <a
                href={buildGoogleCalendarUrl(details, bookingId)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 16px', borderRadius: 8,
                  background: '#fff', border: '1px solid #e5e7eb',
                  color: '#333', fontSize: '0.85rem', fontWeight: 600,
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Google Calendar
              </a>
              <button
                onClick={() => {
                  const ics = buildIcsContent(details, bookingId);
                  const blob = new Blob([ics], { type: 'text/calendar' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'appointment.ics';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 16px', borderRadius: 8,
                  background: '#fff', border: '1px solid #e5e7eb',
                  color: '#333', fontSize: '0.85rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                iCalendar
              </button>
            </div>
          )}

          {/* Shop contact info */}
          {details && (
            <div style={{
              textAlign: 'center', padding: '16px 20px',
              background: '#f9fafb', borderRadius: 8, marginBottom: 20,
              fontSize: '0.85rem', color: '#666', lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: 4 }}>{details.shopName}</div>
              {details.shopPhone && <div>{details.shopPhone}</div>}
              {details.shopAddress && <div>{details.shopAddress}</div>}
            </div>
          )}

          {/* Book another */}
          <div style={{ textAlign: 'center' }}>
            <a href="/book" style={{
              display: 'inline-block',
              background: '#d61f26', color: '#fff', padding: '14px 32px',
              borderRadius: 999, fontWeight: 700, textDecoration: 'none',
              fontSize: '0.95rem',
            }}>
              Book Another Appointment
            </a>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ textAlign: 'center' }}>
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
