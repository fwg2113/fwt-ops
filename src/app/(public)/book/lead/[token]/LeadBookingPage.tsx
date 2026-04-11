'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { BulkConfig, AppointmentType, AutoFilm, AutoFilmShade } from '../../lib/types';
import { FilmCard, ShadePicker } from '@/app/components/booking';
import { getAllowedShades, needsSplitShades } from '@/app/components/booking/pricing';
import AppointmentTypeModal from '../../components/AppointmentTypeModal';
import TintLawsModal, { TintLawsButton } from '../../components/TintLawsModal';
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
  original_price?: number;
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
  options_mode: boolean;
  pre_appointment_type: string | null;
  pre_appointment_date: string | null;
  pre_appointment_time: string | null;
  followup_discount_type: string | null;
  followup_discount_amount: number | null;
  document_id: string | null;
}

// ---------------------------------------------------------------------------
// Appointment type config
// ---------------------------------------------------------------------------

const TYPE_PILLS: { key: AppointmentType; label: string; configKey: string }[] = [
  { key: 'dropoff', label: 'Drop-Off', configKey: 'enable_dropoff' },
  { key: 'waiting', label: 'Waiting', configKey: 'enable_waiting' },
  { key: 'headsup_30', label: 'Flex-Wait (30 min)', configKey: 'enable_headsup_30' },
  { key: 'headsup_60', label: 'Flex-Wait (60 min)', configKey: 'enable_headsup_60' },
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

  // --- Window status ---
  const [windowStatus, setWindowStatus] = useState('');
  const [hasAftermarketTint, setHasAftermarketTint] = useState('');
  const [showTintLaws, setShowTintLaws] = useState(false);

  // --- Policy checkboxes ---
  const [policyCheckbox, setPolicyCheckbox] = useState(false);
  const [priceAckCheckbox, setPriceAckCheckbox] = useState(false);

  // --- Windshield ---
  const [windshieldReplaced, setWindshieldReplaced] = useState('');
  const [windshield72hrAck, setWindshield72hrAck] = useState(false);

  // --- Booking ---
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // --- Pre-set appointment: allow customer to override ---
  const [overrideSchedule, setOverrideSchedule] = useState(false);

  // --- Options mode: customer picks one film per service group ---
  const [optionSelections, setOptionSelections] = useState<Record<string, number>>({});
  // { serviceKey: index into that group's options }

  // Shade overrides for options mode (optional -- customer can refine shade)
  const [optionShades, setOptionShades] = useState<Record<string, { front: string | null; rear: string | null }>>({});

  // Group services for options mode:
  // - Each service_key gets its own group with its film options
  // - Primary services are tagged as exclusive (mutually exclusive -- pick one)
  // - Add-ons are independent
  const serviceGroups = useMemo(() => {
    if (!lead || !lead.options_mode || !config) return [];

    const svcLookup = new Map<string, boolean>();
    for (const s of (config.services || [])) {
      svcLookup.set(s.service_key, s.is_primary);
    }

    const groups = new Map<string, { label: string; options: LeadService[]; exclusive: boolean }>();
    for (const svc of lead.services) {
      if (!groups.has(svc.service_key)) {
        groups.set(svc.service_key, {
          label: svc.label,
          options: [],
          exclusive: svcLookup.get(svc.service_key) ?? false,
        });
      }
      groups.get(svc.service_key)!.options.push(svc);
    }

    return Array.from(groups.entries()).map(([key, group]) => ({ serviceKey: key, ...group }));
  }, [lead, config]);

  // Compute selected services (resolved from options) and total
  const resolvedServices = useMemo(() => {
    if (!lead) return [];
    if (!lead.options_mode) return lead.services;
    // Include groups where the customer made a selection (skip _film key)
    return serviceGroups
      .filter(group => optionSelections[group.serviceKey] !== undefined)
      .map(group => {
        const svc = group.options[optionSelections[group.serviceKey]];
        if (!svc) return null;
        // Apply per-service shade override
        const shadeOverride = optionShades[group.serviceKey];
        if (shadeOverride?.front) {
          return { ...svc, shade_front: shadeOverride.front, shade_rear: shadeOverride.rear || shadeOverride.front };
        }
        return svc;
      })
      .filter(Boolean) as typeof lead.services;
  }, [lead, serviceGroups, optionSelections, optionShades]);

  // Check if at least one primary service is selected (required for options mode)
  const hasPrimarySelected = useMemo(() => {
    if (!lead?.options_mode) return true;
    const primaryGroups = serviceGroups.filter(g => g.exclusive);
    if (primaryGroups.length === 0) return true;
    return primaryGroups.some(g => optionSelections[g.serviceKey] !== undefined);
  }, [lead, serviceGroups, optionSelections]);

  const resolvedTotal = useMemo(() => {
    return resolvedServices.reduce((sum, svc) => sum + (svc?.price || 0), 0);
  }, [resolvedServices]);

  // --- Has windshield service? ---
  const hasWindshield = useMemo(() => {
    if (!lead) return false;
    const services = lead.options_mode ? resolvedServices : lead.services;
    return services.some(s => s.service_key === 'FULL_WS');
  }, [lead, resolvedServices]);

  // --- 72-hour minimum date (when windshield was recently replaced) ---
  const windshield72hrMinDate = useMemo(() => {
    if (!hasWindshield || windshieldReplaced !== 'yes' || !windshield72hrAck) return null;
    const d = new Date();
    d.setDate(d.getDate() + 3); // 72 hours = 3 days
    return d.toISOString().split('T')[0];
  }, [hasWindshield, windshieldReplaced, windshield72hrAck]);

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

        // Pre-fill appointment if pre-set by shop
        if (leadData.lead.pre_appointment_type) setAppointmentType(leadData.lead.pre_appointment_type);
        if (leadData.lead.pre_appointment_date) setSelectedDate(leadData.lead.pre_appointment_date);
        if (leadData.lead.pre_appointment_time) setSelectedTime(leadData.lead.pre_appointment_time);
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
        setSelectedTime('Flex-Wait');
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
    // Options mode: must have at least one option selected (not necessarily all groups)
    if (lead.options_mode) {
      if (!hasPrimarySelected) return false;
    }
    // Window status required
    if (!windowStatus) return false;
    if (windowStatus === 'previously' && !hasAftermarketTint) return false;
    // Policy checkbox required if deposit
    if (lead.charge_deposit && lead.deposit_amount > 0 && !policyCheckbox) return false;
    // Price ack checkbox
    if (config.shopConfig.price_ack_enabled !== false && !priceAckCheckbox) return false;
    // Windshield checks
    if (hasWindshield && !windshieldReplaced) return false;
    if (hasWindshield && windshieldReplaced === 'yes' && !windshield72hrAck) return false;
    // If windshield was replaced recently, enforce 72-hour min date
    if (windshield72hrMinDate && selectedDate < windshield72hrMinDate) return false;
    return true;
  }, [lead, config, firstName, lastName, phone, email, selectedDate, selectedTime, isHeadsUp, serviceGroups, optionSelections, hasPrimarySelected, windowStatus, hasAftermarketTint, policyCheckbox, priceAckCheckbox, hasWindshield, windshieldReplaced, windshield72hrAck, windshield72hrMinDate]);

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
      existingDocumentId: lead.document_id || null, // Link to existing FLQA quote instead of creating a duplicate
      servicesJson: (lead.options_mode ? resolvedServices : lead.services).map(s => ({
        serviceKey: s.service_key,
        label: s.label,
        filmId: s.film_id,
        filmName: s.film_name,
        filmAbbrev: null,
        shadeFront: s.shade_front,
        shadeRear: s.shade_rear,
        shade: s.shade_front,
        price: s.price,
        originalPrice: s.original_price || s.price,
        discountAmount: 0,
        duration: 60,
        module: 'auto_tint',
      })),
      subtotal: (() => {
        const base = lead.options_mode ? resolvedTotal : Number(lead.total_price);
        if (lead.followup_discount_type && Number(lead.followup_discount_amount) > 0) {
          const disc = lead.followup_discount_type === 'dollar'
            ? Math.min(Number(lead.followup_discount_amount), base)
            : Math.round(base * (Number(lead.followup_discount_amount) / 100));
          return Math.max(0, base - disc);
        }
        return base;
      })(),
      discountCode: lead.followup_discount_type ? 'FOLLOWUP' : null,
      discountType: lead.followup_discount_type || null,
      discountPercent: lead.followup_discount_type === 'percent' ? Number(lead.followup_discount_amount) : 0,
      discountAmount: (() => {
        if (!lead.followup_discount_type || !Number(lead.followup_discount_amount)) return 0;
        const base = lead.options_mode ? resolvedTotal : Number(lead.total_price);
        return lead.followup_discount_type === 'dollar'
          ? Math.min(Number(lead.followup_discount_amount), base)
          : Math.round(base * (Number(lead.followup_discount_amount) / 100));
      })(),
      depositPaid: lead.charge_deposit ? lead.deposit_amount : 0,
      balanceDue: (() => {
        const base = lead.options_mode ? resolvedTotal : Number(lead.total_price);
        let final = base;
        if (lead.followup_discount_type && Number(lead.followup_discount_amount) > 0) {
          const disc = lead.followup_discount_type === 'dollar'
            ? Math.min(Number(lead.followup_discount_amount), base)
            : Math.round(base * (Number(lead.followup_discount_amount) / 100));
          final = Math.max(0, base - disc);
        }
        return final - (lead.charge_deposit ? lead.deposit_amount : 0);
      })(),
      appointmentDate: selectedDate,
      appointmentTime: isHeadsUp ? null : selectedTime,
      durationMinutes: (lead.options_mode ? resolvedServices : lead.services).length * 60,
      windowStatus: windowStatus || 'never',
      hasAftermarketTint: hasAftermarketTint || null,
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
        // Route through Square Checkout
        const res = await fetch('/api/square/checkout', {
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
        {lead.options_mode ? 'Your Tint Options' : 'Your Appointment'}
      </h1>
      <p className="fwt-sub" style={{ textAlign: 'center', marginBottom: 30 }}>
        {lead.options_mode
          ? 'Choose your preferred option for each service, then pick a date and time to book.'
          : 'Here is what we discussed. Pick a date and time to finalize your booking.'
        }
      </p>

      {/* ================================================================ */}
      {/* Vehicle + Services Summary (locked in) */}
      {/* ================================================================ */}
      <div className="fwt-card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>
          {lead.vehicle_year} {lead.vehicle_make} {lead.vehicle_model}
        </div>

        {lead.options_mode ? (
          /* Options mode: Step 1 pick film, Step 2 pick services with inline shades */
          (() => {
            const extTheme = config ? {
              primary: String(config.shopConfig.theme_ext_primary || '#dc2626'),
              secondary: String(config.shopConfig.theme_ext_secondary || '#1a1a1a'),
              accent: String(config.shopConfig.theme_ext_accent || '#dc2626'),
              background: String(config.shopConfig.theme_ext_background || '#ffffff'),
            } : undefined;

            const primaryGroups = serviceGroups.filter(g => g.exclusive);
            const addonGroups = serviceGroups.filter(g => !g.exclusive);

            // Get unique films across all options
            const uniqueFilmIds = new Set<number>();
            for (const svc of lead.services) {
              if (svc.film_id) uniqueFilmIds.add(svc.film_id);
            }
            const uniqueFilms = Array.from(uniqueFilmIds)
              .map(id => (config?.films as AutoFilm[])?.find(f => f.id === id))
              .filter(Boolean) as AutoFilm[];

            const selectedFilmId = optionSelections['_film'] !== undefined
              ? uniqueFilms[optionSelections['_film']]?.id || null
              : null;

            function getPrice(serviceKey: string, filmId: number | null): number | null {
              const match = lead!.services.find(s => s.service_key === serviceKey && s.film_id === filmId);
              return match ? match.price : null;
            }

            // Get allowed shades for a service + film combo
            function getShadesForService(serviceKey: string, filmId: number): AutoFilmShade[] {
              if (!config) return [];
              const allShades = (config.filmShades as AutoFilmShade[]).filter(s => s.offered);
              const svcShades = (config.serviceShades || []) as { service_key: string; film_key: string; shade_value: string }[];
              const films = config.films as AutoFilm[];
              return getAllowedShades(serviceKey, filmId, allShades, svcShades, films);
            }

            function handleFilmSelect(filmIdx: number) {
              const newFilmId = uniqueFilms[filmIdx]?.id || null;
              setOptionSelections(prev => {
                if (prev['_film'] === filmIdx) {
                  // Deselect film -- clear everything
                  return {} as Record<string, number>;
                }
                // Switch film but keep service selections -- remap to new film's option index
                const next: Record<string, number> = { '_film': filmIdx };
                for (const group of [...primaryGroups, ...addonGroups]) {
                  if (prev[group.serviceKey] !== undefined) {
                    // Find this film's option in this group
                    const idx = group.options.findIndex(o => o.film_id === newFilmId);
                    if (idx >= 0) next[group.serviceKey] = idx;
                  }
                }
                return next;
              });
              // Clear shade selections since available shades change per film
              setOptionShades({});
            }

            function handlePrimaryToggle(serviceKey: string) {
              if (!selectedFilmId) return;
              setOptionSelections(prev => {
                const next = { ...prev };
                const wasSelected = next[serviceKey] !== undefined;
                // Clear all primary selections
                for (const pg of primaryGroups) delete next[pg.serviceKey];
                // Toggle: if it was selected, leave it deselected. Otherwise select it.
                if (!wasSelected) {
                  const group = primaryGroups.find(g => g.serviceKey === serviceKey);
                  if (group) {
                    const idx = group.options.findIndex(o => o.film_id === selectedFilmId);
                    if (idx >= 0) next[serviceKey] = idx;
                  }
                }
                // Clear primary shade selections
                for (const pg of primaryGroups) delete next[`_shade_${pg.serviceKey}`];
                return next;
              });
              // Clear shades for primaries
              setOptionShades(prev => {
                const next = { ...prev };
                for (const pg of primaryGroups) delete next[pg.serviceKey];
                return next;
              });
            }

            function handleAddonToggle(serviceKey: string) {
              if (!selectedFilmId) return;
              setOptionSelections(prev => {
                const next = { ...prev };
                if (next[serviceKey] !== undefined) {
                  delete next[serviceKey];
                } else {
                  const group = addonGroups.find(g => g.serviceKey === serviceKey);
                  if (group) {
                    const idx = group.options.findIndex(o => o.film_id === selectedFilmId);
                    if (idx >= 0) next[serviceKey] = idx;
                  }
                }
                return next;
              });
              setOptionShades(prev => {
                const next = { ...prev };
                delete next[serviceKey];
                return next;
              });
            }

            const selectedPrimaryKey = primaryGroups.find(g => optionSelections[g.serviceKey] !== undefined)?.serviceKey || null;

            // Render a service row with inline shade picker
            function renderServiceRow(
              serviceKey: string,
              label: string,
              price: number,
              isSelected: boolean,
              onToggle: () => void,
              isPrimary: boolean,
            ) {
              const shades = selectedFilmId ? getShadesForService(serviceKey, selectedFilmId) : [];
              const shadeState = optionShades[serviceKey];

              return (
                <div>
                  <button
                    onClick={onToggle}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '16px 20px', borderRadius: 12,
                      background: isSelected
                        ? (isPrimary ? '#fef2f2' : '#f0fdf4')
                        : '#f9fafb',
                      border: `2px solid ${isSelected
                        ? (isPrimary ? (extTheme?.primary || '#dc2626') : '#86efac')
                        : '#e5e7eb'}`,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isPrimary ? (
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          border: isSelected ? `6px solid ${extTheme?.primary || '#dc2626'}` : '2px solid #d1d5db',
                          transition: 'border 0.15s',
                        }} />
                      ) : (
                        <div style={{
                          width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                          background: isSelected ? '#16a34a' : 'transparent',
                          border: isSelected ? '2px solid #16a34a' : '2px solid #d1d5db',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {isSelected && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </div>
                      )}
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1a1a' }}>
                        {label}
                      </span>
                    </div>
                    <span style={{
                      fontWeight: 800, fontSize: '1.15rem',
                      color: isSelected
                        ? (isPrimary ? (extTheme?.primary || '#dc2626') : '#16a34a')
                        : '#1a1a1a',
                    }}>
                      {isPrimary ? '' : '+'}{price === 0 ? 'FREE' : `$${price}`}
                    </span>
                  </button>

                  {/* Inline shade picker when this service is selected */}
                  {isSelected && shades.length > 0 && (() => {
                    // Check if this service + vehicle requires split front/rear shades
                    const classKeys = lead?.class_keys?.split('|') || [];
                    const isSplit = config ? needsSplitShades({ class_keys: classKeys } as unknown as Parameters<typeof needsSplitShades>[0], config.classRules || [], serviceKey) : false;

                    return (
                      <div style={{ padding: '8px 20px 0', marginBottom: 4 }}>
                        {isSplit ? (
                          <>
                            <ShadePicker
                              label="2 Front Doors"
                              shades={shades}
                              selectedShade={shadeState?.front || null}
                              onSelect={(shade) => setOptionShades(prev => ({
                                ...prev,
                                [serviceKey]: { front: shade, rear: prev[serviceKey]?.rear || null },
                              }))}
                            />
                            <ShadePicker
                              label="Rear"
                              shades={shades}
                              selectedShade={shadeState?.rear || null}
                              onSelect={(shade) => setOptionShades(prev => ({
                                ...prev,
                                [serviceKey]: { front: prev[serviceKey]?.front || null, rear: shade },
                              }))}
                            />
                          </>
                        ) : (
                          <ShadePicker
                            label="Choose Your Shade (optional)"
                            shades={shades}
                            selectedShade={shadeState?.front || null}
                            onSelect={(shade) => setOptionShades(prev => ({
                              ...prev,
                              [serviceKey]: { front: shade, rear: shade },
                            }))}
                          />
                        )}
                        <div style={{ fontSize: '0.7rem', color: '#999', marginTop: 4, fontStyle: 'italic' }}>
                          Selecting a shade is not required -- we will go over all options when you arrive.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            }

            return (
              <>
                {/* Step 1: Choose Your Film */}
                <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 8, color: '#222' }}>
                  Choose Your Film
                </div>
                <div className="fwt-films">
                  {uniqueFilms.map((film, fi) => {
                    const filmShades = config
                      ? (config.filmShades as AutoFilmShade[]).filter(s => s.film_id === film.id && s.offered)
                      : [];
                    return (
                      <FilmCard
                        key={film.id}
                        film={film}
                        isSelected={selectedFilmId === film.id}
                        onClick={() => handleFilmSelect(fi)}
                        displaySpecs={config?.shopConfig.film_card_specs as string[] | undefined}
                        filmShades={filmShades}
                        layout={config?.shopConfig.film_card_layout as 'classic' | 'horizontal' | 'minimal' | undefined}
                        theme={extTheme}
                      />
                    );
                  })}
                </div>

                {/* Step 2: Services + inline shade pickers */}
                {selectedFilmId && primaryGroups.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 12, color: '#222' }}>
                      Choose Your Service
                    </div>

                    {primaryGroups.map((group, gi) => {
                      const price = getPrice(group.serviceKey, selectedFilmId);
                      if (price === null) return null;
                      const isSelected = selectedPrimaryKey === group.serviceKey;

                      return (
                        <div key={group.serviceKey}>
                          {renderServiceRow(
                            group.serviceKey, group.label, price, isSelected,
                            () => handlePrimaryToggle(group.serviceKey), true
                          )}

                          {gi < primaryGroups.length - 1 && (() => {
                            const nextPrice = getPrice(primaryGroups[gi + 1].serviceKey, selectedFilmId);
                            if (nextPrice === null) return null;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '12px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#d0d0d0' }} />
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#bbb', letterSpacing: '2px' }}>OR</span>
                                <div style={{ flex: 1, height: 1, background: '#d0d0d0' }} />
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add-ons */}
                {selectedFilmId && addonGroups.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 12, color: '#222' }}>
                      Add-Ons <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#999' }}>(optional)</span>
                    </div>
                    {addonGroups.map(group => {
                      const price = getPrice(group.serviceKey, selectedFilmId);
                      if (price === null) return null;
                      const isSelected = optionSelections[group.serviceKey] !== undefined;

                      return (
                        <div key={group.serviceKey} style={{ marginBottom: 8 }}>
                          {renderServiceRow(
                            group.serviceKey, group.label, price, isSelected,
                            () => handleAddonToggle(group.serviceKey), false
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()
        ) : (
          /* Normal mode: static service list */
          <>
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
          </>
        )}

        {/* Total + Follow-up Discount */}
        {(() => {
          const baseTotal = lead.options_mode ? resolvedTotal : Number(lead.total_price);
          const hasDiscount = lead.followup_discount_type && Number(lead.followup_discount_amount) > 0;
          const discountAmt = hasDiscount
            ? lead.followup_discount_type === 'dollar'
              ? Math.min(Number(lead.followup_discount_amount), baseTotal)
              : Math.round(baseTotal * (Number(lead.followup_discount_amount) / 100))
            : 0;
          const finalTotal = Math.max(0, baseTotal - discountAmt);

          return (
            <>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: 16, paddingTop: 16,
                borderTop: '2px solid #222',
                fontWeight: 800, fontSize: '1.1rem',
              }}>
                <span>{hasDiscount ? 'Subtotal' : 'Total'}</span>
                <span style={{ textDecoration: hasDiscount ? 'line-through' : 'none', opacity: hasDiscount ? 0.5 : 1 }}>
                  ${baseTotal.toLocaleString()}
                </span>
              </div>

              {hasDiscount && (
                <>
                  <div style={{
                    marginTop: 8, padding: '10px 14px',
                    background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>
                        Special Offer: {lead.followup_discount_type === 'dollar' ? `$${lead.followup_discount_amount} OFF` : `${lead.followup_discount_amount}% OFF`}
                      </span>
                      <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>-${discountAmt.toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginTop: 8,
                    fontWeight: 800, fontSize: '1.2rem', color: '#166534',
                  }}>
                    <span>Your Price</span>
                    <span>${finalTotal.toLocaleString()}</span>
                  </div>
                </>
              )}

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
                    <span style={{ fontWeight: 600 }}>${(finalTotal - Number(lead.deposit_amount)).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </>
          );
        })()}
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
        {lead?.pre_appointment_date && !overrideSchedule ? (
          <>
            <div style={{ fontWeight: 800, paddingBottom: 16, fontSize: '1.1rem' }}>
              Your Appointment
            </div>
            <div style={{
              padding: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
            }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                {(() => {
                  const typeLabel = TYPE_PILLS.find(t => t.key === appointmentType)?.label || appointmentType;
                  const dateObj = new Date(lead.pre_appointment_date + 'T12:00:00');
                  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  return `${typeLabel} -- ${dateStr}`;
                })()}
              </div>
              {selectedTime && selectedTime !== 'Flex-Wait' && (
                <div style={{ fontSize: '0.95rem', color: '#166534' }}>
                  {(() => {
                    const [h, m] = selectedTime.split(':').map(Number);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
                  })()}
                </div>
              )}
              {!selectedTime && isHeadsUp && (
                <div style={{ fontSize: '0.9rem', color: '#166534', lineHeight: 1.5 }}>
                  {appointmentType === 'headsup_30'
                    ? <>You will be contacted via text with at least <strong>30 minutes</strong> notice when we are ready for your vehicle.</>
                    : <>You will be contacted via text with at least <strong>60 minutes</strong> notice when we are ready for your vehicle.</>
                  }
                </div>
              )}
              <div style={{ fontSize: '0.85rem', color: '#166534', marginTop: 8, opacity: 0.8 }}>
                This appointment has been scheduled for you. Complete the form below to confirm.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOverrideSchedule(true);
                setSelectedDate('');
                setSelectedTime('');
                setAppointmentType('dropoff');
              }}
              style={{
                marginTop: 12, background: 'none', border: 'none', cursor: 'pointer',
                color: '#6b7280', fontSize: '0.9rem', textDecoration: 'underline',
                padding: 0,
              }}
            >
              Need a different date or time? Choose your own.
            </button>
          </>
        ) : (
          <>
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
            min={windshield72hrMinDate && windshield72hrMinDate > dateBounds.min ? windshield72hrMinDate : dateBounds.min}
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
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* Policy Checkboxes + Windshield + Window Status */}
      {/* ================================================================ */}
      <div className="fwt-card" style={{ marginBottom: 20 }}>
        {/* Deposit Policy Checkbox */}
        {lead.charge_deposit && lead.deposit_amount > 0 && (
          <div style={{ margin: '0 0 20px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={policyCheckbox}
                onChange={e => setPolicyCheckbox(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span>
                {config.shopConfig.deposit_refundable ? (
                  <>I understand the ${config.shopConfig.deposit_amount} deposit is <strong>refundable</strong> if I cancel at least <strong>{config.shopConfig.deposit_refund_hours || 24} hours</strong> before my scheduled appointment time. Cancellations within {config.shopConfig.deposit_refund_hours || 24} hours are non-refundable.</>
                ) : (
                  <>I understand the ${config.shopConfig.deposit_amount} deposit is <strong>non-refundable</strong>.</>
                )}
              </span>
            </label>
          </div>
        )}

        {/* Windshield Replacement Check */}
        {hasWindshield && (
          <div style={{ margin: '0 0 20px', padding: 16, background: '#fff3cd', border: '2px solid #ffc107', borderRadius: 8 }}>
            <div style={{ fontWeight: 800, marginBottom: 12, color: '#856404' }}>
              Windshield Replacement Check
            </div>
            <div style={{ marginBottom: 12, color: '#856404' }}>
              Has your windshield been replaced in the last 72 hours (3 days)?
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="windshield-replaced-lead" value="no"
                  checked={windshieldReplaced === 'no'} onChange={() => setWindshieldReplaced('no')} />
                <span style={{ fontWeight: 600 }}>No</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="windshield-replaced-lead" value="yes"
                  checked={windshieldReplaced === 'yes'} onChange={() => setWindshieldReplaced('yes')} />
                <span style={{ fontWeight: 600 }}>Yes</span>
              </label>
            </div>

            {windshieldReplaced === 'yes' && (
              <div style={{ marginTop: 12, padding: 12, background: '#ffffff', borderRadius: 6 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={windshield72hrAck}
                    onChange={e => {
                      setWindshield72hrAck(e.target.checked);
                      if (e.target.checked) {
                        // Force schedule override -- pre-set date may be too soon
                        const minDate = new Date();
                        minDate.setDate(minDate.getDate() + 3);
                        const minDateStr = minDate.toISOString().split('T')[0];
                        if (selectedDate && selectedDate < minDateStr) {
                          setOverrideSchedule(true);
                          setSelectedDate('');
                          setSelectedTime('');
                        }
                      }
                    }}
                    style={{ marginTop: 3, flexShrink: 0 }} />
                  <span style={{ color: '#856404', fontWeight: 600 }}>
                    I acknowledge that my appointment must be scheduled at least 72 hours (3 days) after my windshield was replaced to ensure proper adhesion.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Price Change Acknowledgement */}
        {config.shopConfig.price_ack_enabled !== false && (
          <div style={{ margin: '0 0 20px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1.5 }}>
              <input type="checkbox" checked={priceAckCheckbox}
                onChange={e => setPriceAckCheckbox(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }} />
              <span>
                {config.shopConfig.price_ack_text || 'I understand that the final price is subject to change if additional labor is required beyond the standard installation process (e.g., removal of existing tint, adhesive residue removal, etc.).'}
              </span>
            </label>
          </div>
        )}

        {/* Tint Laws */}
        <div style={{ margin: '0 0 20px' }}>
          <TintLawsButton onClick={() => setShowTintLaws(true)} />
        </div>

        {/* Window Status Question */}
        <div style={{ margin: '0 0 0' }}>
          <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>
            What is the current status of the windows? <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            className="fwt-select"
            value={windowStatus}
            onChange={e => { setWindowStatus(e.target.value); if (e.target.value !== 'previously') setHasAftermarketTint(''); }}
            style={{ width: '100%', maxWidth: 400, padding: '14px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }}
          >
            <option value="">Select status...</option>
            <option value="never">Never tinted</option>
            <option value="previously">Previously tinted</option>
            <option value="unsure">I am not sure!</option>
          </select>
        </div>

        {/* Conditional Follow-up */}
        {windowStatus === 'previously' && (
          <div style={{ margin: '20px 0 0 20px' }}>
            <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>
              Is there currently any aftermarket window tint on any of the windows? <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'not_sure', label: 'Not Sure' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '1rem' }}>
                  <input type="radio" name="has-tint-lead" value={opt.value}
                    checked={hasAftermarketTint === opt.value}
                    onChange={() => setHasAftermarketTint(opt.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {showTintLaws && <TintLawsModal onClose={() => setShowTintLaws(false)} />}

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
