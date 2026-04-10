'use client';

import { useEffect, useRef } from 'react';
import type { AppointmentType } from '../lib/types';

interface Props {
  type: AppointmentType;
  onAccept: () => void;
  onDecline: () => void;
}

const CONTENT: Record<Exclude<AppointmentType, 'dropoff' | 'warranty'>, {
  title: string;
  sections: { heading?: string; body: string }[];
  summary: string;
}> = {
  waiting: {
    title: 'Waiting Appointment',
    sections: [
      {
        heading: 'What to Expect',
        body: 'A waiting appointment is a precise, scheduled time. You will wait on-site while we complete the work on your vehicle. Please plan to be at the shop for the full duration of the service.',
      },
      {
        heading: 'Arrival',
        body: 'Please arrive at your scheduled appointment time. Your vehicle will be pulled in promptly so we can get started right away.',
      },
      {
        heading: 'Duration',
        body: 'Service times vary depending on the work being done. You will see the estimated duration in your booking summary. We have a comfortable waiting area available for you.',
      },
    ],
    summary: 'I understand this is an on-site waiting appointment and I will remain at the shop for the duration of the service.',
  },
  headsup_30: {
    title: 'Heads-Up Appointment — 30 Minute Minimum Notice',
    sections: [
      {
        heading: 'How It Works',
        body: 'Instead of a fixed appointment time, you select a date and we add you to our priority queue for that day. When a bay opens up, we will text you with at least 30 minutes notice so you can head over.',
      },
      {
        heading: 'No Unnecessary Waiting',
        body: 'If you arrive at the time we provide, your vehicle is pulled right in and work begins immediately. You will still wait for the duration of your service, but you will not be sitting around due to schedule overlaps or delays from earlier appointments. Your wait is only for your own job.',
      },
      {
        heading: 'Our Goal Is to Get You In Early',
        body: 'We prioritize heads-up appointments to bring you in as early in the day as possible. In many cases, we will be able to give you significantly more than 30 minutes notice — that is simply the guaranteed minimum. The more flexible you are, the earlier we can typically get you in.',
      },
      {
        heading: 'Ideal For',
        body: 'This option works best if you are available and flexible during business hours on your selected date. As long as you can come by within 30 minutes of our text, this appointment type offers the most convenient, no-hassle experience.',
      },
    ],
    summary: 'I understand that I will not receive a fixed appointment time. I will be contacted via text with at least 30 minutes notice when my vehicle is ready to be pulled in.',
  },
  headsup_60: {
    title: 'Heads-Up Appointment — 60 Minute Minimum Notice',
    sections: [
      {
        heading: 'How It Works',
        body: 'Instead of a fixed appointment time, you select a date and we add you to our priority queue for that day. When a bay opens up, we will text you with at least 60 minutes notice so you have plenty of time to head over.',
      },
      {
        heading: 'No Unnecessary Waiting',
        body: 'If you arrive at the time we provide, your vehicle is pulled right in and work begins immediately. You will still wait for the duration of your service, but you will not be sitting around due to schedule overlaps or delays from earlier appointments. Your wait is only for your own job.',
      },
      {
        heading: 'Our Goal Is to Get You In Early',
        body: 'We prioritize heads-up appointments to bring you in as early in the day as possible. In many cases, we will be able to give you significantly more than 60 minutes notice — that is simply the guaranteed minimum. The more flexible you are, the earlier we can typically get you in.',
      },
      {
        heading: 'Ideal For',
        body: 'This option works best if you need a bit more lead time to get to the shop. You will have at least a full hour from the time we reach out, making it easy to wrap up what you are doing and head over.',
      },
    ],
    summary: 'I understand that I will not receive a fixed appointment time. I will be contacted via text with at least 60 minutes notice when my vehicle is ready to be pulled in.',
  },
};

export default function AppointmentTypeModal({ type, onAccept, onDecline }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onDecline]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (type === 'dropoff' || type === 'warranty') return null;
  const content = CONTENT[type];
  if (!content) return null;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onDecline(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: '#ffffff', borderRadius: 16,
        maxWidth: 560, width: '100%', maxHeight: '90vh',
        overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 24px 0', borderBottom: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="14" fill="#d61f26" opacity="0.1"/>
              <circle cx="14" cy="14" r="10" stroke="#d61f26" strokeWidth="1.5" fill="none"/>
              <path d="M14 8v6l4 2" stroke="#d61f26" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1a1a1a' }}>
              {content.title}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px' }}>
          {content.sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              {section.heading && (
                <div style={{
                  fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a',
                  marginBottom: 6,
                }}>
                  {section.heading}
                </div>
              )}
              <div style={{
                fontSize: '0.9rem', lineHeight: 1.65, color: '#444444',
              }}>
                {section.body}
              </div>
            </div>
          ))}
        </div>

        {/* Acknowledgment */}
        <div style={{
          padding: '0 24px 24px',
        }}>
          <div style={{
            background: '#f8f8f8', borderRadius: 10, padding: 16,
            marginBottom: 20, border: '1px solid #e5e5e5',
          }}>
            <div style={{
              fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a',
              lineHeight: 1.5,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="#d61f26" style={{ verticalAlign: 'middle', marginRight: 6, marginTop: -2 }}>
                <path d="M7 0a7 7 0 1 1 0 14A7 7 0 0 1 7 0zm-.4 3.5v4.2h.8V3.5h-.8zm0 5.3v.8h.8v-.8h-.8z"/>
              </svg>
              {content.summary}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={onDecline}
              style={{
                flex: 1, padding: '14px 20px',
                background: '#ffffff', color: '#1a1a1a',
                border: '2px solid #d0d0d0', borderRadius: 999,
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={onAccept}
              style={{
                flex: 1, padding: '14px 20px',
                background: '#d61f26', color: '#ffffff',
                border: '2px solid #d61f26', borderRadius: 999,
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              I Understand, Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
