'use client';

// ============================================================================
// NEW BOOKING TOAST
// ----------------------------------------------------------------------------
// Persistent toast that shows when a new auto_booking is created in real time.
// Stays on screen until the user clicks X or "Acknowledge" — never auto-
// dismisses, so a busy team won't miss a customer that booked while their
// hands were full of another car.
//
// Multiple toasts stack vertically. Each carries the YMM, services with film
// + shade, and the price so the team has full context without opening the
// appointment card.
// ============================================================================

import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

export interface NewBookingToastData {
  id: string;                       // booking row id
  customerName: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  appointmentType: string | null;
  servicesJson: Array<{
    label?: string;
    filmName?: string;
    shadeFront?: string;
    shadeRear?: string;
    shade?: string;
    price?: number;
  }>;
  subtotal: number;
  depositPaid: number;
  balanceDue: number;
  bookingSource: string | null;
}

interface Props {
  toasts: NewBookingToastData[];
  onDismiss: (id: string) => void;
}

export default function NewBookingToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: SPACING.lg,
        right: SPACING.lg,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING.md,
        maxWidth: 400,
        width: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <NewBookingToast key={t.id} data={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function NewBookingToast({ data, onDismiss }: { data: NewBookingToastData; onDismiss: (id: string) => void }) {
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ');
  const dateLabel = formatDate(data.appointmentDate);
  const timeLabel = data.appointmentTime ? formatTime(data.appointmentTime) : null;

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `2px solid ${COLORS.success}`,
        borderRadius: RADIUS.lg,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(34,197,94,0.2)',
        overflow: 'hidden',
        animation: 'fwt-toast-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'auto',
      }}
    >
      {/* Green header bar */}
      <div
        style={{
          background: COLORS.success,
          color: '#fff',
          padding: `${SPACING.sm}px ${SPACING.lg}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACING.md,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New Booking
          </div>
        </div>
        <button
          onClick={() => onDismiss(data.id)}
          aria-label="Dismiss"
          style={{
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: SPACING.lg }}>
        {/* Customer + vehicle */}
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: 2 }}>
            {data.customerName || '(no name)'}
          </div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>
            {vehicle || '(no vehicle)'}
          </div>
        </div>

        {/* Date + time + type */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACING.sm,
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            background: COLORS.inputBg,
            borderRadius: RADIUS.sm,
            marginBottom: SPACING.md,
            fontSize: FONT.sizeSm,
            color: COLORS.textPrimary,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ fontWeight: FONT.weightSemibold }}>{dateLabel}</span>
          {timeLabel && <span>at {timeLabel}</span>}
          {data.appointmentType && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: FONT.sizeXs,
                background: `${COLORS.borderAccentSolid}30`,
                color: COLORS.borderAccentSolid,
                padding: `2px ${SPACING.sm}px`,
                borderRadius: RADIUS.sm,
                textTransform: 'capitalize',
                fontWeight: FONT.weightSemibold,
              }}
            >
              {data.appointmentType.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Services */}
        {Array.isArray(data.servicesJson) && data.servicesJson.length > 0 && (
          <div style={{ marginBottom: SPACING.md }}>
            <div
              style={{
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightSemibold,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: SPACING.xs,
              }}
            >
              Services
            </div>
            {data.servicesJson.map((svc, i) => {
              const shadeLabel = svc.shadeFront && svc.shadeRear && svc.shadeFront !== svc.shadeRear
                ? `${svc.shadeFront} / ${svc.shadeRear}`
                : (svc.shadeFront || svc.shade || '');
              return (
                <div
                  key={i}
                  style={{
                    fontSize: FONT.sizeSm,
                    color: COLORS.textPrimary,
                    padding: '3px 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: SPACING.sm,
                  }}
                >
                  <span>
                    <strong>{svc.label || '—'}</strong>
                    {svc.filmName && <span style={{ color: COLORS.textSecondary }}> · {svc.filmName}</span>}
                    {shadeLabel && <span style={{ color: COLORS.textMuted }}> ({shadeLabel})</span>}
                  </span>
                  {typeof svc.price === 'number' && svc.price > 0 && (
                    <span style={{ color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      ${svc.price.toFixed(0)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Totals */}
        <div
          style={{
            paddingTop: SPACING.sm,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>
            <span>Subtotal</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>${(data.subtotal || 0).toFixed(2)}</span>
          </div>
          {data.depositPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.sizeSm, color: COLORS.success }}>
              <span>Deposit Paid</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: FONT.weightSemibold }}>
                -${data.depositPaid.toFixed(2)}
              </span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: FONT.sizeBase,
              fontWeight: FONT.weightBold,
              color: COLORS.textPrimary,
              marginTop: 2,
            }}
          >
            <span>Balance Due</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>${(data.balanceDue || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Acknowledge button */}
        <button
          onClick={() => onDismiss(data.id)}
          style={{
            marginTop: SPACING.md,
            width: '100%',
            background: COLORS.success,
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.sm,
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            fontSize: FONT.sizeSm,
            fontWeight: FONT.weightBold,
            cursor: 'pointer',
          }}
        >
          Acknowledge
        </button>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes fwt-toast-slide-in {
          0% { opacity: 0; transform: translateX(40px) scale(0.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const min = m || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${min} ${ampm}`;
  } catch {
    return timeStr;
  }
}
