'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BulkConfig } from './lib/types';
import { useBookingState } from './lib/use-booking-state';
import { VehicleSelector, ServiceTypeSelector } from '@/app/components/booking';
import GiftCertificateSection from './components/GiftCertificateSection';
import VehicleInquiryForm from './components/VehicleInquiryForm';
import TintFlow from './components/TintFlow';
import RemovalFlow from './components/RemovalFlow';
import AlaCarteFlow from './components/AlaCarteFlow';
import SummarySection from './components/SummarySection';
import ScheduleSection from './components/ScheduleSection';
import ContactForm from './components/ContactForm';
import './booking.css';

export default function BookingPage() {
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showInquiry, setShowInquiry] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const bs = useBookingState(config);

  // Load bulk config on mount
  useEffect(() => {
    fetch('/api/auto/config')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setConfig(data);
      })
      .catch(err => setLoadError(err.message || 'Failed to load booking data'));
  }, []);

  // Compute primary price for display
  const primaryPrice = bs.selectedServices.find(
    s => s.serviceKey === bs.state.primaryServiceKey
  )?.price || 0;

  // Has windshield selected?
  const hasWindshield = bs.state.selectedAddons.has('FULL_WS');

  // Can book?
  const canBook = (() => {
    if (!bs.selectedVehicle) return false;
    if (bs.selectedServices.length === 0) return false;
    if (!bs.state.policyCheckbox) return false;
    if (config?.shopConfig.price_ack_enabled !== false && !bs.state.priceAckCheckbox) return false;
    if (!bs.state.windowStatus) return false;
    if (bs.state.windowStatus === 'previously' && !bs.state.hasAftermarketTint) return false;
    if (hasWindshield && !bs.state.windshieldReplaced) return false;
    if (hasWindshield && bs.state.windshieldReplaced === 'yes' && !bs.state.windshield72hrAck) return false;
    if (!bs.state.selectedDate) return false;
    // Heads-up appointments don't need a time slot, just a date
    const isHeadsUp = bs.state.appointmentType === 'headsup_30' || bs.state.appointmentType === 'headsup_60';
    if (!isHeadsUp && !bs.state.selectedTime) return false;
    if (!bs.state.firstName || !bs.state.lastName || !bs.state.phone || !bs.state.email) return false;
    // Validate phone: at least 10 digits
    const phoneDigits = bs.state.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) return false;
    return true;
  })();

  // Handle booking — routes through Stripe Checkout for deposits, direct for GC/no-deposit
  const handleBook = useCallback(async () => {
    if (!canBook || !config || !bs.selectedVehicle) return;
    setBooking(true);
    setBookingError('');

    const bookingPayload = {
      firstName: bs.state.firstName,
      lastName: bs.state.lastName,
      phone: bs.state.phone,
      email: bs.state.email,
      vehicleYear: bs.state.selectedYear,
      vehicleMake: bs.state.selectedMake,
      vehicleModel: bs.state.selectedModel,
      classKeys: bs.selectedVehicle.class_keys.join('|'),
      serviceType: bs.state.serviceType,
      appointmentType: bs.state.appointmentType,
      servicesJson: bs.selectedServices,
      subtotal: bs.priceSummary.subtotal,
      discountCode: bs.state.gcValidation?.code || null,
      discountType: bs.state.gcValidation?.discountType || null,
      discountPercent: bs.state.gcValidation?.discountType === 'percent' ? bs.state.gcValidation.amount : 0,
      discountAmount: bs.priceSummary.promoDiscount + bs.priceSummary.gcCredit + bs.priceSummary.defaultDiscountTotal,
      depositPaid: bs.priceSummary.depositAmount,
      balanceDue: bs.priceSummary.balanceDue,
      appointmentDate: bs.state.selectedDate,
      appointmentTime: bs.state.selectedTime,
      durationMinutes: bs.priceSummary.totalDuration,
      windowStatus: bs.state.windowStatus,
      hasAftermarketTint: bs.state.hasAftermarketTint || null,
      additionalInterests: Array.from(bs.state.additionalInterests).join(', '),
      notes: '',
      calendarTitle: '',
      emojiMarker: '',
    };

    try {
      // Check if this booking needs Stripe payment (deposit required and no GC bypass)
      const needsPayment = config.shopConfig.require_deposit
        && bs.priceSummary.depositAmount > 0
        && (bs.state.gcValidation?.chargeDeposit !== false);

      if (needsPayment) {
        // Route through Square Checkout
        const res = await fetch('/api/square/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingPayload),
        });

        const data = await res.json();
        if (data.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
          return; // Don't setBooking(false) — page is navigating away
        } else if (data.skipPayment) {
          // Deposit not required — fall through to direct booking
        } else {
          setBookingError(data.error || 'Failed to create checkout session');
          setBooking(false);
          return;
        }
      }

      // Direct booking (no deposit — GC, bypass, or deposit not required)
      const res = await fetch('/api/auto/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      const data = await res.json();
      if (data.success) {
        setBookingSuccess(true);
      } else {
        setBookingError(data.error || 'Failed to create booking');
      }
    } catch {
      setBookingError('Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  }, [canBook, config, bs]);

  // Success screen
  if (bookingSuccess) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 1100, margin: '0 auto', padding: 20, background: 'transparent' }}>
        <div className="fwt-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#16a34a"/>
              <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 }}>Appointment Booked!</h1>
          <p style={{ fontSize: '1.1rem', color: '#666', lineHeight: 1.6 }}>
            You will receive an email/sms confirmation containing all the details of this appointment.
          </p>
          <p style={{ fontSize: '1rem', color: '#666', marginTop: 16 }}>
            {bs.state.selectedYear} {bs.state.selectedMake} {bs.state.selectedModel} — {bs.state.selectedDate} at {bs.state.selectedTime}
          </p>
        </div>
      </section>
    );
  }

  // Loading state
  if (!config && !loadError) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        <div className="fwt-loading" style={{ minHeight: 300 }} />
      </section>
    );
  }

  // Error state
  if (loadError) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        <div className="fwt-card" style={{ textAlign: 'center', padding: 40 }}>
          <h1>Unable to Load Booking</h1>
          <p style={{ color: '#666' }}>{loadError}</p>
          <button className="fwt-btn" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
            Try Again
          </button>
        </div>
      </section>
    );
  }

  // Inquiry form
  if (showInquiry) {
    return (
      <section id="fwt-booking" style={{ maxWidth: 1100, margin: '0 auto', padding: 20, background: 'transparent' }}>
        <h1 style={{ margin: '6px 0 10px', fontSize: '1.8rem', textAlign: 'center', fontWeight: 800 }}>
          Book An Appointment
        </h1>
        <VehicleInquiryForm onBack={() => setShowInquiry(false)} />
      </section>
    );
  }

  // Inject theme CSS variables from shop config
  const themeStyle = config ? `
    :root {
      --accent: ${config.shopConfig.theme_ext_primary};
      --accent-hover: ${config.shopConfig.theme_ext_primary}dd;
      --button-text: ${config.shopConfig.theme_ext_secondary};
      --button-bg: ${config.shopConfig.theme_ext_background};
      --button-hover: ${config.shopConfig.theme_ext_background}f0;
    }
  ` : '';

  return (
    <section id="fwt-booking" style={{ maxWidth: 1100, margin: '0 auto', padding: 20, background: 'transparent' }}>
      {themeStyle && <style dangerouslySetInnerHTML={{ __html: themeStyle }} />}
      {/* Page Header */}
      <h1 style={{ margin: '6px 0 10px', fontSize: '1.8rem', textAlign: 'center', fontWeight: 800 }}>
        Book An Appointment
      </h1>
      <p className="fwt-sub" style={{ textAlign: 'center', marginBottom: 30 }}>
        Choose your vehicle, select your services, and pick your appointment time.
      </p>

      {/* GC Section */}
      {config!.shopConfig.enable_gift_certificates && (
        <GiftCertificateSection
          onValidated={bs.setGCValidation}
          gcValidation={bs.state.gcValidation}
          shopPhone={config!.shopConfig.shop_phone}
          gcHelpText={config!.shopConfig.gc_help_text}
          gcCallEnabled={config!.shopConfig.gc_call_enabled}
          gcCallNumber={config!.shopConfig.gc_call_number}
          gcTextEnabled={config!.shopConfig.gc_text_enabled}
          gcTextNumber={config!.shopConfig.gc_text_number}
        />
      )}

      {/* Vehicle Selection */}
      <VehicleSelector
        years={bs.years}
        makes={bs.makes}
        models={bs.models}
        selectedYear={bs.state.selectedYear}
        selectedMake={bs.state.selectedMake}
        selectedModel={bs.state.selectedModel}
        loading={bs.loading}
        onYearChange={bs.setYear}
        onMakeChange={bs.setMake}
        onModelChange={bs.setModel}
        onNotListed={() => setShowInquiry(true)}
      />

      {/* Service Selection (shows after vehicle selected) */}
      {bs.selectedVehicle && (
        <div className="fwt-card" style={{ marginBottom: 20 }}>
          <ServiceTypeSelector
            serviceType={bs.state.serviceType}
            onChange={bs.setServiceType}
          />

          {/* Tint Flow */}
          {bs.state.serviceType === 'tint' && (
            <TintFlow
              config={config!}
              vehicle={bs.selectedVehicle}
              availableFilms={bs.availableFilms}
              requiresSplitShades={bs.requiresSplitShades}
              isTesla3={bs.isTesla3}
              primaryServiceKey={bs.state.primaryServiceKey}
              selectedFilmId={bs.state.selectedFilmId}
              shadeFront={bs.state.shadeFront}
              shadeRear={bs.state.shadeRear}
              shadeUniform={bs.state.shadeUniform}
              selectedAddons={bs.state.selectedAddons}
              addonConfigs={bs.state.addonConfigs}
              teslaClassKey={bs.state.teslaClassKey}
              primaryPrice={primaryPrice}
              onPrimarySelect={bs.setPrimaryService}
              onFilmSelect={bs.setFilm}
              onShadeFrontSelect={bs.setShadeFront}
              onShadeRearSelect={bs.setShadeRear}
              onShadeUniformChange={bs.setShadeUniform}
              onAddonToggle={bs.toggleAddon}
              onAddonFilmSelect={bs.setAddonFilm}
              onAddonShadeSelect={bs.setAddonShade}
              onTeslaClassKeySelect={bs.setTeslaClassKey}
            />
          )}

          {/* Removal Flow */}
          {bs.state.serviceType === 'removal' && (
            <RemovalFlow
              config={config!}
              vehicle={bs.selectedVehicle}
              selectedRemovals={bs.state.selectedRemovals}
              onToggle={bs.toggleRemoval}
            />
          )}

          {/* A La Carte Flow */}
          {bs.state.serviceType === 'alacarte' && (
            <AlaCarteFlow
              config={config!}
              vehicle={bs.selectedVehicle}
              availableFilms={bs.availableFilms}
              selectedWindows={bs.state.selectedAlaCarteWindows}
              windowConfigs={bs.state.alaCarteConfigs}
              onToggleWindow={bs.toggleAlaCarteWindow}
              onFilmSelect={bs.setAlaCarteFilm}
              onShadeSelect={bs.setAlaCarteShade}
            />
          )}
        </div>
      )}

      {/* Summary & Checkout */}
      <div className="fwt-card" style={{ marginTop: 20 }}>
        <SummarySection
          config={config!}
          priceSummary={bs.priceSummary}
          gcValidation={bs.state.gcValidation}
          hasWindshield={hasWindshield}
          windshieldReplaced={bs.state.windshieldReplaced}
          windshield72hrAck={bs.state.windshield72hrAck}
          onWindshieldReplacedChange={v => bs.setField('windshieldReplaced', v)}
          onWindshield72hrAckChange={v => bs.setField('windshield72hrAck', v)}
          windowStatus={bs.state.windowStatus}
          hasAftermarketTint={bs.state.hasAftermarketTint}
          onWindowStatusChange={v => bs.setField('windowStatus', v)}
          onAftermarketTintChange={v => bs.setField('hasAftermarketTint', v)}
          policyCheckbox={bs.state.policyCheckbox}
          priceAckCheckbox={bs.state.priceAckCheckbox}
          onPolicyChange={v => bs.setField('policyCheckbox', v)}
          onPriceAckChange={v => bs.setField('priceAckCheckbox', v)}
        />

        {/* Schedule */}
        <ScheduleSection
          config={config!}
          appointmentType={bs.state.appointmentType}
          selectedDate={bs.state.selectedDate}
          selectedTime={bs.state.selectedTime}
          allowSameDay={bs.state.gcValidation?.allowSameDay || false}
          onTypeChange={bs.setAppointmentType}
          onDateChange={v => bs.setField('selectedDate', v)}
          onTimeChange={v => bs.setField('selectedTime', v)}
        />

        {/* Contact Form */}
        <ContactForm
          firstName={bs.state.firstName}
          lastName={bs.state.lastName}
          phone={bs.state.phone}
          email={bs.state.email}
          additionalInterests={bs.state.additionalInterests}
          onFieldChange={(field, value) => bs.setField(field as keyof typeof bs.state, value)}
          onInterestToggle={bs.toggleInterest}
        />

        {/* Book Button */}
        {bookingError && (
          <div style={{ color: '#d61f26', fontWeight: 600, marginBottom: 12 }}>{bookingError}</div>
        )}

        <div style={{ marginTop: 20 }}>
          <button
            id="fwt-book"
            className="fwt-btn"
            type="button"
            disabled={!canBook || booking}
            onClick={handleBook}
            style={{
              background: 'rgb(214, 31, 37)', color: '#ffffff',
              border: '1px solid #ffffff', padding: '14px 32px',
              borderRadius: 999, fontWeight: 800, fontSize: '1rem',
              cursor: canBook && !booking ? 'pointer' : 'not-allowed',
            }}
          >
            {booking ? 'Booking...' : 'Book Appointment'}
          </button>
        </div>

        <div className="fwt-sub" style={{ marginTop: 12, fontSize: '0.85rem' }}>
          You will receive a email/sms confirmation containing all the details of this appointment.
        </div>
      </div>
    </section>
  );
}
