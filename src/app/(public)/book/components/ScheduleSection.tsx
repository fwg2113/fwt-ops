'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { BulkConfig, AppointmentType } from '../lib/types';
import AppointmentTypeModal from './AppointmentTypeModal';

interface Props {
  config: BulkConfig;
  appointmentType: AppointmentType;
  selectedDate: string;
  selectedTime: string;
  allowSameDay: boolean;
  onTypeChange: (type: AppointmentType) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

const TYPE_PILLS: { key: AppointmentType; label: string; configKey: string }[] = [
  { key: 'dropoff', label: 'Drop-Off', configKey: 'enable_dropoff' },
  { key: 'waiting', label: 'Waiting', configKey: 'enable_waiting' },
  { key: 'headsup_30', label: '30-Min Heads-Up', configKey: 'enable_headsup_30' },
  { key: 'headsup_60', label: '60-Min Heads-Up', configKey: 'enable_headsup_60' },
];

// Types that require modal acknowledgment before selection
const MODAL_TYPES: AppointmentType[] = ['waiting', 'headsup_30', 'headsup_60'];

export default function ScheduleSection({
  config, appointmentType, selectedDate, selectedTime,
  allowSameDay, onTypeChange, onDateChange, onTimeChange,
}: Props) {
  const [availability, setAvailability] = useState<{
    available: boolean;
    dropoffRemaining: number;
    waitingRemaining: number;
    reason?: string;
  } | null>(null);
  const [checkingDate, setCheckingDate] = useState(false);
  const [pendingType, setPendingType] = useState<AppointmentType | null>(null);

  const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';

  // Which types are enabled in shop_config
  const enabledTypes = useMemo(() => {
    return TYPE_PILLS.filter(t => {
      const val = config.shopConfig[t.configKey as keyof typeof config.shopConfig];
      return val === true;
    });
  }, [config]);

  // Grid columns based on number of enabled types
  const gridCols = enabledTypes.length <= 2 ? 'repeat(2, 1fr)' :
                   enabledTypes.length === 3 ? 'repeat(3, 1fr)' :
                   'repeat(2, 1fr)';

  // Date bounds
  const dateBounds = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setDate(min.getDate() + (allowSameDay ? 0 : 1));
    const max = new Date(now);
    max.setDate(max.getDate() + (config.shopConfig.max_days_out || 45));
    return {
      min: min.toISOString().split('T')[0],
      max: max.toISOString().split('T')[0],
    };
  }, [config, allowSameDay]);

  // Check availability when date changes
  useEffect(() => {
    if (!selectedDate) {
      setAvailability(null);
      return;
    }

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

  // Get time slots for selected type + date
  const timeSlots = useMemo(() => {
    // Heads-up appointments don't get time slots — just a date
    if (isHeadsUp) return [];

    if (!selectedDate || !availability?.available) return [];

    if (appointmentType === 'dropoff') {
      if (availability.dropoffRemaining <= 0) return [];
      return config.dropoffSlots;
    } else {
      if (availability.waitingRemaining <= 0) return [];
      const dayOfWeek = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      return config.waitingSlots.filter(s => s.day_of_week === dayOfWeek);
    }
  }, [config, selectedDate, appointmentType, availability, isHeadsUp]);

  // Handle pill click — modal types open the modal first
  const handleTypeClick = useCallback((type: AppointmentType) => {
    if (type === appointmentType) return; // Already selected

    if (MODAL_TYPES.includes(type)) {
      setPendingType(type);
    } else {
      onTypeChange(type);
    }
  }, [appointmentType, onTypeChange]);

  // Modal accepted
  const handleModalAccept = useCallback(() => {
    if (pendingType) {
      onTypeChange(pendingType);
      // Heads-up types auto-set a placeholder time since they don't pick one
      if (pendingType === 'headsup_30' || pendingType === 'headsup_60') {
        onTimeChange('Heads-Up');
      }
    }
    setPendingType(null);
  }, [pendingType, onTypeChange, onTimeChange]);

  // Modal declined
  const handleModalDecline = useCallback(() => {
    setPendingType(null);
  }, []);

  // Validate date is not Sunday
  function handleDateChange(date: string) {
    if (!date) { onDateChange(''); return; }
    const d = new Date(date + 'T12:00:00');
    if (d.getDay() === 0) return;
    onDateChange(date);
  }

  const helpText = useMemo(() => {
    if (isHeadsUp) {
      if (!selectedDate) return 'Pick a date — we will reach out to you that day when we are ready.';
      if (checkingDate) return 'Checking availability...';
      if (!availability?.available) return availability?.reason || 'This date is not available.';
      return appointmentType === 'headsup_30'
        ? 'You will receive a text with at least 30 minutes notice on this date.'
        : 'You will receive a text with at least 60 minutes notice on this date.';
    }

    if (!selectedDate) return 'Pick a date to see available times.';
    if (checkingDate) return 'Checking availability...';
    if (!availability?.available) return availability?.reason || 'This date is not available.';

    if (appointmentType === 'dropoff') {
      if (availability.dropoffRemaining <= 0) return 'No drop-off slots available for this date.';
      return 'Choose a drop-off time: Your vehicle will be done by close of business.';
    } else {
      if (availability.waitingRemaining <= 0) return 'No waiting slots available for this date.';
      return 'Choose a waiting time:';
    }
  }, [selectedDate, checkingDate, availability, appointmentType, isHeadsUp]);

  return (
    <div>
      <div style={{ fontWeight: 800, paddingBottom: 25, margin: '25px 0 12px', fontSize: '1.1rem' }}>
        Schedule
      </div>

      {/* Appointment Type Pills */}
      <div className="fwt-pills" style={{ marginBottom: 16, gap: 12, gridTemplateColumns: gridCols }}>
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

      {/* Heads-up confirmation note (after accepted) */}
      {isHeadsUp && (
        <div style={{
          margin: '0 0 20px', padding: 16,
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="10" cy="10" r="10" fill="#16a34a"/>
              <path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#166534' }}>
              {appointmentType === 'headsup_30' ? (
                <>You will be contacted via text with at least <strong>30 minutes</strong> notice when we are ready for your vehicle. No specific appointment time is needed — just pick your preferred date below.</>
              ) : (
                <>You will be contacted via text with at least <strong>60 minutes</strong> notice when we are ready for your vehicle. No specific appointment time is needed — just pick your preferred date below.</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date Picker */}
      <div style={{ margin: '12px 0' }}>
        <label htmlFor="fwt-date" style={{ fontWeight: 800, marginBottom: 6, marginTop: 25, display: 'block' }}>
          {isHeadsUp ? 'Choose your preferred date (Mon-Sat)' : 'Choose a date (Mon-Sat)'}
        </label>
        <input
          id="fwt-date"
          type="date"
          value={selectedDate}
          onChange={e => handleDateChange(e.target.value)}
          min={dateBounds.min}
          max={dateBounds.max}
          style={{ width: '100%', maxWidth: 300, cursor: 'pointer', padding: '14px 16px', border: '1px solid #d0d0d0', borderRadius: 8, fontSize: '1rem' }}
          onClick={e => (e.target as HTMLInputElement).showPicker?.()}
        />
      </div>

      {/* Help Text */}
      <div className="fwt-sub" style={{ margin: '8px 0 12px' }}>
        {helpText}
      </div>

      {/* Time Slots (only for dropoff and waiting — not heads-up) */}
      {!isHeadsUp && timeSlots.length > 0 && (
        <div className="fwt-slots" style={{ marginBottom: 20 }}>
          {timeSlots.map(slot => (
            <button
              key={slot.id}
              type="button"
              className={`fwt-slot${selectedTime === slot.label ? ' is-selected' : ''}`}
              onClick={() => onTimeChange(slot.label)}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      {/* Appointment Type Modal */}
      {pendingType && (
        <AppointmentTypeModal
          type={pendingType}
          onAccept={handleModalAccept}
          onDecline={handleModalDecline}
        />
      )}
    </div>
  );
}
