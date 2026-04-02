'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { BulkConfig, AppointmentType } from '../../lib/types';
import AppointmentTypeModal from '../../components/AppointmentTypeModal';
import '../../booking.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadService {
  service_key: string;
  label: string;
  film_id: number | null;
  film_name: string | null;
  price: number;
  shade_front: string | null;
  shade_rear: string | null;
}

interface LeadData {
  id: number;
  token: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_id: number | null;
  class_keys: string | null;
  services: LeadService[];
  total_price: number;
  charge_deposit: boolean;
  deposit_amount: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Appointment type config
// ---------------------------------------------------------------------------

const TYPE_PILLS: { key: AppointmentType; label: string; configKey: string }[] = [
  { key: 'dropoff', label: 'Drop-Off', configKey: 'enable_dropoff' },
  { key: 'waiting', label: 'Waiting', configKey: 'enable_waiting' },
  { key: 'headsup_30', label: '30-Min Heads-Up', configKey: 'enable_headsup_30' },
  { key: 'headsup_60', label: '60-Min Heads-Up', configKey: 'enable_headsup_60' },
];

// Types that require modal acknowledgment before selection
const MODAL_TYPES: AppointmentType[] = ['waiting', 'headsup_30', 'headsup_60'];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LeadBookingPage() {
  const params = useParams();
  const token = params.token as string;

  // --- Data ---
  const [lead, setLead] = useState<LeadData | null>(null);
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [loadError, setLoadError] = useState('');

  // --- Schedule state ---
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('dropoff');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  // --- Appointment type modal ---
  const [pendingType, setPendingType] = useState<AppointmentType | null>(null);

  // --- Availability ---
  const [availability, setAvailability] = useState<{
    available: boolean;
    dropoffRemaining: number;
    waitingRemaining: number;
    reason?: string;
  } | null>(null);
  const [checkingDate, setCheckingDate] = useState(false);

  // --- Contact ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // --- Booking ---
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // --- Load lead + config in parallel ---
  useEffect(() => {
    Promise.all([
      fetch(`/api/auto/leads/${encodeURIComponent(token)}`).then(r => r.json()),
      fetch('/api/auto/config').then(r => r.json()),
    ])
      .then(([leadData, configData]) => {
        if (leadData.error) { setLoadError('This link is no longer valid.'); return; }
        if (configData.error) { setLoadError('Unable to load booking data.'); return; }
        setLead(leadData.lead);
        setConfig(configData);

        // Pre-fill contact from lead if available
        if (leadData.lead.customer_name) {
          const parts = leadData.lead.customer_name.split(' ');
          setFirstName(parts[0] || '');
          setLastName(parts.slice(1).join(' ') || '');
        }
        if (leadData.lead.customer_phone) setPhone(leadData.lead.customer_phone);
        if (leadData.lead.customer_email) setEmail(leadData.lead.customer_email);
      })
      .catch(() => setLoadError('Failed to load. Please try again.'));
  }, [token]);

  // --- Derived: enabled appointment types ---
  const enabledTypes = useMemo(() => {
    if (!config) return [];
    return TYPE_PILLS.filter(t => {
      const val = config.shopConfig[t.configKey as keyof typeof config.shopConfig];
      return val === true;
    });
  }, [config]);

  const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';

  // --- Date bounds ---
  const dateBounds = useMemo(() => {
    if (!config) return { min: '', max: '' };
    const now = new Date();
    const min = new Date(now);
    min.setDate(min.getDate() + (config.shopConfig.allow_same_day ? 0 : 1));
    const max = new Date(now);
    max.setDate(max.getDate() + (config.shopConfig.max_days_out || 45));
    return {
      min: min.toISOString().split('T')[0],
      max: max.toISOString().split('T')[0],
    };
  }, [config]);

  // --- Check availability when date changes ---
  useEffect(() => {
    if (!selectedDate) { setAvailability(null); return; }
    setCheckingDate(true);
    fetch('/api/auto/check-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedDate, appointmentType }),
    })
      .then(r => r.json())
      .then(data => setAvailability(data))
      .catch(() => setAvailability(null))
      .finally(() => setCheckingDate(false));
  }, [selectedDate, appointmentType]);

  // --- Time slots ---
  const timeSlots = useMemo(() => {
    if (isHeadsUp || !config || !selectedDate || !availability?.available) return [];
    if (appointmentType === 'dropoff') {
      if (availability.dropoffRemaining <= 0) return [];
      return config.dropoffSlots;
    } else {
      if (availability.waitingRemaining <= 0) return [];
      const dayOfWeek = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      return config.waitingSlots.filter(s => s.day_of_week === dayOfWeek);
    }
  }, [config, selectedDate, appointmentType, availability, isHeadsUp]);

  // --- Date change handler (block Sundays) ---
  function handleDateChange(date: string) {
    if (!date) { setSelectedDate(''); return; }
    const d = new Date(date + 'T12:00:00');
    if (d.getDay() === 0) return; // Block Sundays
    setSelectedDate(date);
    setSelectedTime(''); // Reset time on date change
  }

  // --- Appointment type change (modal for waiting/heads-up) ---
  function handleTypeClick(type: AppointmentType) {
    if (type === appointmentType) return;
    if (MODAL_TYPES.includes(type)) {
      setPendingType(type);
    } else {
      setAppointmentType(type);
      setSelectedTime('');
    }
  }

  function handleModalAccept() {
    if (pendingType) {
      setAppointmentType(pendingType);
      setSelectedTime('');
      if (pendingType === 'headsup_30' || pendingType === 'headsup_60') {
        setSelectedTime('Heads-Up');
      }
    }
    setPendingType(null);
  }

  function handleModalDecline() {
    setPendingType(null);
  }

  // --- Can book? ---
  const canBook = useMemo(() => {
    if (!lead || !config) return false;
    if (!firstName || !lastName || !phone || !email) return false;
    if (phone.replace(/\D/g, '').length < 10) return false;
    if (!selectedDate) return false;
    if (!isHeadsUp && !selectedTime) return false;
    return true;
  }, [lead, config, firstName, lastName, phone, email, selectedDate, selectedTime, isHeadsUp]);

  // --- Handle booking ---
  const handleBook = useCallback(async () => {
    if (!canBook || !lead || !config) return;
    setBooking(true);
    setBookingError('');

    const bookingPayload = {
      firstName,
      lastName,
      phone,
      email,
      vehicleYear: String(lead.vehicle_year),
      vehicleMake: lead.vehicle_make,
      vehicleModel: lead.vehicle_model,
      classKeys: lead.class_keys || '',
      serviceType: 'tint',
      appointmentType,
      servicesJson: lead.services.map(s => ({
        serviceKey: s.service_key,
        label: s.label,
        filmId: s.film_id,
        filmName: s.film_name,
        filmAbbrev: null,
        shadeFront: s.shade_front,
        shadeRear: s.shade_rear,
        shade: s.shade_front,
        price: s.price,
        discountAmount: 0,
        duration: 60,
        module: 'auto_tint',
      })),
      subtotal: lead.total_price,
      discountCode: null,
      discountType: null,
      discountPercent: 0,
      discountAmount: 0,
      depositPaid: lead.charge_deposit ? lead.deposit_amount : 0,
      balanceDue: lead.total_price - (lead.charge_deposit ? lead.deposit_amount : 0),
      appointmentDate: selectedDate,
      appointmentTime: isHeadsUp ? null : selectedTime,
      durationMinutes: lead.services.length * 60,
      windowStatus: 'never',
      hasAftermarketTint: null,
      additionalInterests: '',
      notes: `Booked from lead link (${lead.token})`,
      calendarTitle: '',
      emojiMarker: '',
      leadToken: lead.token,
      skipDeposit: !lead.charge_deposit,
      depositOverride: lead.deposit_amount || null,
    };

    try {
      if (lead.charge_deposit && lead.deposit_amount > 0) {
        // Route through Stripe Checkout
        const res = await fetch('/api/auto/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingPayload),
        });
        const data = await res.json();
        if (data.url) {
          // Mark lead as booked before redirecting
          await fetch('/api/auto/leads', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: lead.token, status: 'booked', booked_at: new Date().toISOString() }),
          });
          window.location.href = data.url;
          return;
        } else if (data.skipPayment) {
          // Fall through to direct booking
        } else {
          setBookingError(data.error || 'Payment setup failed');
          setBooking(false);
          return;
        }
      }

      // Direct booking (no deposit)
      const res = await fetch('/api/auto/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });
      const data = await res.json();
      if (data.success) {
        // Mark lead as booked
        await fetch('/api/auto/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: lead.token,
            status: 'booked',
            booked_at: new Date().toISOString(),
            booking_id: data.booking?.id || null,
          }),
        });
        setBookingSuccess(true);
      } else {
        setBookingError(data.error || 'Booking failed');
      }
    } catch {
      setBookingError('Something went wrong. Please try again.');
    } finally {
      setBooking(false);
    }
  }, [canBook, lead, config, firstName, lastName, phone, email, appointmentType, selectedDate, selectedTime]);

  // --- Inject theme ---
  const themeStyle = config ? `
    :root {
      --accent: ${config.shopConfig.theme_ext_primary};
      --accent-hover: ${config.shopConfig.theme_ext_primary}dd;
      --button-text: ${config.shopConfig.theme_ext_secondary};
      --button-bg: ${config.shopConfig.theme_ext_background};
      --button-hover: ${config.shopConfig.theme_ext_background}f0;
    }
  ` : '';

  // --- Loading ---
  if (!lead && !loadError) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        <div className="fwt-loading" style={{ minHeight: 300 }} />
      </section>
    );
  }

  // --- Error ---
  if (loadError) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        <div className="fwt-card" style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 12 }}>Link Expired</h1>
          <p style={{ color: '#666' }}>{loadError}</p>
        </div>
      </section>
    );
  }

  // --- Already booked ---
  if (lead && lead.status === 'booked') {
    return (
      <section id="fwt-booking" style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        {themeStyle && <style dangerouslySetInnerHTML={{ __html: themeStyle }} />}
        <div className="fwt-card" style={{ textAlign: 'center', padding: 40 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto 16px' }}>
            <circle cx="32" cy="32" r="32" fill="#16a34a"/>
            <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 12 }}>Already Booked</h1>
          <p style={{ color: '#666' }}>This appointment has already been scheduled. We look forward to seeing you!</p>
        </div>
      </section>
    );
  }

  // --- Success ---
  if (bookingSuccess && lead) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        {themeStyle && <style dangerouslySetInnerHTML={{ __html: themeStyle }} />}
        <div className="fwt-card" style={{ textAlign: 'center', padding: 40 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto 16px' }}>
            <circle cx="32" cy="32" r="32" fill="#16a34a"/>
            <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 }}>Appointment Booked!</h1>
          <p style={{ fontSize: '1.1rem', color: '#666', lineHeight: 1.6 }}>
            You will receive a confirmation with all the details.
          </p>
          <p style={{ fontSize: '1rem', color: '#666', marginTop: 16 }}>
            {lead.vehicle_year} {lead.vehicle_make} {lead.vehicle_model} -- {selectedDate}
            {!isHeadsUp ? ` at ${selectedTime}` : ''}
          </p>
        </div>
      </section>
    );
  }

  if (!lead || !config) return null;

  // --- Main render ---
  return (
    <section id="fwt-booking" style={{ maxWidth: 700, margin: '0 auto', padding: 20, background: 'transparent' }}>
      {themeStyle && <style dangerouslySetInnerHTML={{ __html: themeStyle }} />}

      <h1 style={{ margin: '6px 0 10px', fontSize: '1.8rem', textAlign: 'center', fontWeight: 800 }}>
        Your Appointment
      </h1>
      <p className="fwt-sub" style={{ textAlign: 'center', marginBottom: 30 }}>
        Here is what we discussed. Pick a date and time to finalize your booking.
      </p>

      {/* ================================================================ */}
      {/* Vehicle + Services Summary (locked in) */}
      {/* ================================================================ */}
      <div className="fwt-card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>
          {lead.vehicle_year} {lead.vehicle_make} {lead.vehicle_model}
        </div>

        {lead.services.map((svc, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < lead.services.length - 1 ? '1px solid #eee' : 'none',
          }}>
            <div>
              <div style={{ fontWeight: 600 }}>{svc.label}</div>
              {svc.film_name && (
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 2 }}>
                  {svc.film_name}
                  {svc.shade_front ? ` -- ${svc.shade_front}` : ''}
                  {svc.shade_rear ? ` / ${svc.shade_rear}` : ''}
                </div>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              ${svc.price}
            </div>
          </div>
        ))}

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 16, paddingTop: 16,
          borderTop: '2px solid #222',
          fontWeight: 800, fontSize: '1.1rem',
        }}>
          <span>Total</span>
          <span>${Number(lead.total_price).toLocaleString()}</span>
        </div>

        {/* Deposit info */}
        {lead.charge_deposit && lead.deposit_amount > 0 && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: '#f8f9fa', borderRadius: 8,
            fontSize: '0.9rem', color: '#444',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Deposit due today</span>
              <span style={{ fontWeight: 700 }}>${lead.deposit_amount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span>Balance due at appointment</span>
              <span style={{ fontWeight: 600 }}>${(Number(lead.total_price) - Number(lead.deposit_amount)).toLocaleString()}</span>
            </div>
          </div>
        )}
        {!lead.charge_deposit && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac',
            fontSize: '0.9rem', color: '#166534',
          }}>
            No deposit required -- pay in full at your appointment.
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          background: 'rgb(214, 31, 37)', border: '1px solid rgb(0, 0, 0)', borderRadius: 8,
          padding: 12, margin: '16px 0 0', fontSize: '0.9rem', lineHeight: 1.5, color: '#ffffff',
        }}>
          <strong>Note:</strong> The selected services and options are not final and can be changed. We will go over all options when you arrive with the vehicle.
        </div>
      </div>

      {/* ================================================================ */}
      {/* Schedule */}
      {/* ================================================================ */}
      <div className="fwt-card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, paddingBottom: 16, fontSize: '1.1rem' }}>
          Choose Your Appointment
        </div>

        {/* Appointment Type Pills */}
        {enabledTypes.length > 1 && (
          <div className="fwt-pills" style={{
            marginBottom: 16, gap: 12,
            gridTemplateColumns: enabledTypes.length <= 2 ? 'repeat(2, 1fr)' : enabledTypes.length === 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          }}>
            {enabledTypes.map(t => (
              <button
                key={t.key}
                type="button"
                className={`fwt-pill${appointmentType === t.key ? ' is-selected' : ''}`}
                onClick={() => handleTypeClick(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Heads-up note */}
        {isHeadsUp && (
          <div style={{
            margin: '0 0 20px', padding: 16,
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
          }}>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#166534' }}>
              {appointmentType === 'headsup_30'
                ? <>You will be contacted via text with at least <strong>30 minutes</strong> notice when we are ready for your vehicle.</>
                : <>You will be contacted via text with at least <strong>60 minutes</strong> notice when we are ready for your vehicle.</>
              }
              {' '}No specific appointment time is needed -- just pick your preferred date below.
            </div>
          </div>
        )}

        {/* Date */}
        <div style={{ margin: '12px 0' }}>
          <label htmlFor="lead-date" style={{ fontWeight: 800, marginBottom: 6, display: 'block' }}>
            {isHeadsUp ? 'Choose your preferred date (Mon-Sat)' : 'Choose a date (Mon-Sat)'}
          </label>
          <input
            id="lead-date"
            type="date"
            value={selectedDate}
            onChange={e => handleDateChange(e.target.value)}
            min={dateBounds.min}
            max={dateBounds.max}
            style={{
              width: '100%', maxWidth: 300, cursor: 'pointer',
              padding: '14px 16px', border: '1px solid #d0d0d0',
              borderRadius: 8, fontSize: '1rem',
            }}
            onClick={e => (e.target as HTMLInputElement).showPicker?.()}
          />
        </div>

        {/* Status text */}
        <div className="fwt-sub" style={{ margin: '8px 0 12px' }}>
          {!selectedDate ? 'Pick a date to see available times.' :
           checkingDate ? 'Checking availability...' :
           !availability?.available ? (availability?.reason || 'This date is not available.') :
           isHeadsUp ? (appointmentType === 'headsup_30'
             ? 'You will receive a text with at least 30 minutes notice on this date.'
             : 'You will receive a text with at least 60 minutes notice on this date.') :
           appointmentType === 'dropoff' ? (
             availability.dropoffRemaining <= 0 ? 'No drop-off slots available for this date.' :
             'Choose a drop-off time: Your vehicle will be done by close of business.'
           ) : (
             availability.waitingRemaining <= 0 ? 'No waiting slots available for this date.' :
             'Choose a waiting time:'
           )}
        </div>

        {/* Time Slots */}
        {!isHeadsUp && timeSlots.length > 0 && (
          <div className="fwt-slots" style={{ marginBottom: 20 }}>
            {timeSlots.map(slot => (
              <button
                key={slot.id}
                type="button"
                className={`fwt-slot${selectedTime === slot.label ? ' is-selected' : ''}`}
                onClick={() => setSelectedTime(slot.label)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}

        {/* Appointment Type Modal (waiting/heads-up disclaimer) */}
        {pendingType && (
          <AppointmentTypeModal
            type={pendingType}
            onAccept={handleModalAccept}
            onDecline={handleModalDecline}
          />
        )}
      </div>

      {/* ================================================================ */}
      {/* Contact Info */}
      {/* ================================================================ */}
      <div className="fwt-card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, paddingBottom: 16, fontSize: '1.1rem' }}>
          Your Information
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>First Name *</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Last Name *</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Phone *</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(301) 555-1234"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Book Button */}
      {/* ================================================================ */}
      {bookingError && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 8, color: '#991b1b', fontSize: '0.9rem',
        }}>
          {bookingError}
        </div>
      )}

      <button
        type="button"
        className="fwt-btn"
        disabled={!canBook || booking}
        onClick={handleBook}
        style={{
          width: '100%', padding: '18px', fontSize: '1.1rem',
          fontWeight: 800, borderRadius: 10,
          opacity: !canBook || booking ? 0.5 : 1,
          cursor: !canBook || booking ? 'not-allowed' : 'pointer',
        }}
      >
        {booking ? 'Booking...' :
         lead.charge_deposit && lead.deposit_amount > 0
           ? `Book & Pay $${lead.deposit_amount} Deposit`
           : 'Book Appointment'}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  border: '1px solid #d0d0d0',
  borderRadius: 8,
  fontSize: '1rem',
  outline: 'none',
};
