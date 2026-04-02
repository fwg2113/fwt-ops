'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// SELF-CHECKOUT PAGE
// Customer scans QR code in shop -> sees today's appointments -> taps theirs
// -> invoice is created (if needed) -> redirected to customer invoice view
// ============================================================================

const BRAND = '#dc2626';

interface CheckoutAppointment {
  id: string;
  bookingId: string;
  customerFirstName: string;
  maskedPhone: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  balanceDue: number;
  status: string;
  appointmentType: string;
  invoiceToken: string | null;
  invoiceStatus: string | null;
}

export default function SelfCheckoutPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<CheckoutAppointment[]>([]);
  const [shopName, setShopName] = useState('');
  const [heading, setHeading] = useState('Self Checkout');
  const [subtext, setSubtext] = useState('Find your vehicle below to view your invoice and pay');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAppointments() {
      try {
        const res = await fetch('/api/auto/checkout/self');
        const data = await res.json();
        setEnabled(data.enabled !== false);
        setAppointments(data.appointments || []);
        setShopName(data.shopName || '');
        if (data.heading) setHeading(data.heading);
        if (data.subtext) setSubtext(data.subtext);
      } catch {
        setError('Unable to load appointments');
      } finally {
        setLoading(false);
      }
    }
    fetchAppointments();
  }, []);

  async function handleSelect(apt: CheckoutAppointment) {
    // If invoice already exists, go straight to it
    if (apt.invoiceToken) {
      router.push(`/invoice/${apt.invoiceToken}`);
      return;
    }

    // Create invoice on-demand
    setClaiming(apt.id);
    try {
      const res = await fetch('/api/auto/checkout/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: apt.id }),
      });
      const data = await res.json();
      if (data.token) {
        router.push(`/invoice/${data.token}`);
      } else {
        setError('Unable to load your invoice. Please ask the team for help.');
        setClaiming(null);
      }
    } catch {
      setError('Something went wrong. Please ask the team for help.');
      setClaiming(null);
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  const readyAppointments = appointments.filter(a => a.balanceDue > 0 && a.invoiceStatus !== 'paid');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f4f6',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}} />

      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderBottom: '3px solid ' + BRAND,
        padding: '24px',
        textAlign: 'center',
      }}>
        {shopName && (
          <div style={{ fontSize: '28px', fontWeight: 800, color: BRAND, letterSpacing: '-0.5px' }}>
            {shopName.split(' ').map(w => w[0]).join('').toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '2px' }}>
          {shopName || 'Self Checkout'}
        </div>
      </div>

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Disabled state */}
        {!loading && !enabled && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 600, color: '#6b7280' }}>Self-checkout is not available at this time.</div>
          </div>
        )}

        {/* Title */}
        {enabled && (
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px 0' }}>
            {heading}
          </h1>
          <p style={{ fontSize: '15px', color: '#6b7280', margin: 0 }}>
            {subtext}
          </p>
        </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '48px',
            textAlign: 'center', color: '#6b7280', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            Loading...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '24px',
            textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: `2px solid ${BRAND}20`,
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>
              {error}
            </div>
            <button
              onClick={() => { setError(null); window.location.reload(); }}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: BRAND, color: '#fff', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', marginTop: '8px',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* No appointments */}
        {!loading && !error && readyAppointments.length === 0 && (
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '48px',
            textAlign: 'center', color: '#6b7280', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ marginBottom: '16px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>
              No appointments ready
            </div>
            <div style={{ fontSize: '14px' }}>
              Check back when your vehicle is done, or ask the team for help.
            </div>
          </div>
        )}

        {/* Appointment Cards */}
        {!loading && !error && readyAppointments.map(apt => {
          const vehicleStr = [apt.vehicleYear, apt.vehicleMake, apt.vehicleModel].filter(Boolean).join(' ');
          const isClaiming = claiming === apt.id;

          return (
            <button
              key={apt.id}
              onClick={() => !isClaiming && handleSelect(apt)}
              disabled={isClaiming}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '20px 24px',
                marginBottom: '12px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '2px solid #e5e7eb',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                cursor: isClaiming ? 'wait' : 'pointer',
                opacity: isClaiming ? 0.7 : 1,
                transition: 'all 0.2s ease',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              {/* Vehicle icon */}
              <div style={{
                width: 52, height: 52, borderRadius: '14px',
                background: `${BRAND}10`, border: `2px solid ${BRAND}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                  <path d="M5 17h2m10 0h2M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17H3v2h4v-2H5zm14 0h-2v2h4v-2h-2z"/>
                  <rect x="3" y="9" width="18" height="4" rx="1"/>
                </svg>
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '2px' }}>
                  {vehicleStr}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {apt.customerFirstName} {apt.maskedPhone ? `  |  ${apt.maskedPhone}` : ''}
                </div>
              </div>

              {/* Balance */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: BRAND }}>
                  {formatCurrency(apt.balanceDue)}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {isClaiming ? 'Loading...' : 'Tap to pay'}
                </div>
              </div>
            </button>
          );
        })}

        {/* Help note */}
        {!loading && !error && readyAppointments.length > 0 && (
          <div style={{
            textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: '13px',
          }}>
            Don't see your vehicle? Ask the team for help.
          </div>
        )}
      </div>
    </div>
  );
}
