'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DashboardCard, StatCard, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

interface TodayAppointment {
  id: string;
  booking_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  appointment_type: string;
  appointment_time: string | null;
  duration_minutes: number | null;
  subtotal: number;
  balance_due: number;
  status: string;
}

interface DashboardData {
  today: {
    date: string;
    appointments: TodayAppointment[];
    total: number;
    dropoffs: number;
    waiting: number;
    headsups: number;
    checkedIn: number;
    revenue: number;
  };
  mtd: {
    totalSales: number;
    projectedSales: number;
    completedCount: number;
    bookedCount: number;
    workingDaysSoFar: number;
    totalWorkingDays: number;
    dailyAvg: number;
  };
  inquiries: Array<{
    id: string;
    booking_id: string;
    customer_name: string;
    customer_phone: string | null;
    vehicle_year: number | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    notes: string | null;
    created_at: string;
  }>;
  pendingGCCount: number;
}

const TYPE_COLORS: Record<string, string> = {
  dropoff: '#3b82f6',
  waiting: '#ef4444',
  headsup_30: '#f59e0b',
  headsup_60: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: '30m HU',
  headsup_60: '60m HU',
};

function formatTime(time: string | null): string {
  if (!time) return 'TBD';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function CommandCenter() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isTouch = isMobile || isTablet;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auto/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div>
      <PageHeader
        title="Command"
        titleAccent="Center"
        subtitle={todayFormatted}
      />

      {/* Quick Stats Row */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: SPACING.lg, marginBottom: SPACING.xl }}>
          <QuickStat label="Today's Appointments" value={data.today.total} color={COLORS.textPrimary} compact={isMobile} />
          <QuickStat label="Checked In" value={data.today.checkedIn} color="#22c55e" compact={isMobile} />
          <QuickStat label="Today's Revenue" value={`$${data.today.revenue.toLocaleString()}`} color={COLORS.red} compact={isMobile} />
          <QuickStat label="Pending Inquiries" value={data.inquiries.length} color="#f59e0b" compact={isMobile} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

        {/* Today's Schedule (Auto Appointments) */}
        <DashboardCard
          title="Today's Schedule (Auto Appointments)"
          noPadding
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          actions={
            data ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' }}>
                <StatusBadge label={`${data.today.dropoffs} Drop-Off`} variant="info" />
                <StatusBadge label={`${data.today.waiting} Waiting`} variant="danger" />
                {data.today.headsups > 0 && <StatusBadge label={`${data.today.headsups} Heads-Up`} variant="warning" />}
                {!isMobile && (
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginLeft: SPACING.sm }}>
                    Est. ${data.today.revenue.toLocaleString()}
                  </span>
                )}
              </div>
            ) : undefined
          }
        >
          {loading ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
          ) : !data || data.today.appointments.length === 0 ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
              No appointments scheduled for today.
            </div>
          ) : (
            <div style={{ padding: SPACING.md }}>
              {data.today.appointments.filter(a => a.status !== 'cancelled').map(apt => {
                const typeColor = TYPE_COLORS[apt.appointment_type] || '#6b7280';
                const isCheckedIn = apt.status === 'in_progress' || apt.status === 'completed' || apt.status === 'invoiced';
                return (
                  <div key={apt.id} style={{
                    display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    gap: isMobile ? SPACING.xs : SPACING.md,
                    padding: isMobile ? `${SPACING.sm}px ${SPACING.sm}px` : `${SPACING.sm}px ${SPACING.md}px`,
                    borderRadius: RADIUS.md,
                    marginBottom: isMobile ? 4 : 2,
                    borderLeft: `3px solid ${typeColor}`,
                    background: `${typeColor}08`,
                  }}>
                    {isMobile ? (
                      <>
                        {/* Mobile row 1: time + type + dot + price */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, width: '100%' }}>
                          <span style={{
                            fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                            color: typeColor,
                          }}>
                            {formatTime(apt.appointment_time)}
                          </span>
                          <span style={{
                            fontSize: FONT.sizeXs, fontWeight: FONT.weightBold,
                            color: typeColor, textTransform: 'uppercase',
                          }}>
                            {TYPE_LABELS[apt.appointment_type]}
                          </span>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: isCheckedIn ? '#22c55e' : '#6b7280',
                          }} />
                          <span style={{ flex: 1 }} />
                          <span style={{
                            fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                            color: COLORS.textPrimary,
                          }}>
                            ${Number(apt.balance_due).toFixed(0)}
                          </span>
                        </div>
                        {/* Mobile row 2: vehicle + customer */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, width: '100%' }}>
                          <span style={{
                            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                            color: COLORS.textPrimary, flex: 1,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                          </span>
                          <span style={{
                            fontSize: FONT.sizeXs, color: COLORS.textMuted,
                            whiteSpace: 'nowrap',
                          }}>
                            {apt.customer_name}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Time */}
                        <span style={{
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                          color: typeColor, minWidth: 70,
                        }}>
                          {formatTime(apt.appointment_time)}
                        </span>

                        {/* Checked-in dot */}
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: isCheckedIn ? '#22c55e' : '#6b7280',
                        }} />

                        {/* Type badge */}
                        <span style={{
                          fontSize: FONT.sizeXs, fontWeight: FONT.weightBold,
                          color: typeColor, textTransform: 'uppercase', minWidth: 60,
                        }}>
                          {TYPE_LABELS[apt.appointment_type]}
                        </span>

                        {/* Vehicle */}
                        <span style={{
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                          color: COLORS.textPrimary, flex: 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                        </span>

                        {/* Customer */}
                        <span style={{
                          fontSize: FONT.sizeSm, color: COLORS.textMuted,
                          whiteSpace: 'nowrap',
                        }}>
                          {apt.customer_name}
                        </span>

                        {/* Price */}
                        <span style={{
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                          color: COLORS.textPrimary, minWidth: 50, textAlign: 'right',
                        }}>
                          ${Number(apt.balance_due).toFixed(0)}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}

              {/* View All link */}
              <div style={{ textAlign: 'center', paddingTop: SPACING.md }}>
                <a href="/automotive/appointments" style={{
                  fontSize: FONT.sizeSm, color: COLORS.red,
                  textDecoration: 'none', fontWeight: FONT.weightSemibold,
                }}>
                  View Full Schedule
                </a>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* New Leads / Inquiries */}
        <DashboardCard
          title="New Leads"
          noPadding
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
          actions={
            data && data.inquiries.length > 0 ? (
              <StatusBadge label={`${data.inquiries.length} pending`} variant="warning" />
            ) : undefined
          }
        >
          {loading ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
          ) : !data || data.inquiries.length === 0 ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
              No new inquiries.
            </div>
          ) : (
            <div style={{ padding: SPACING.md }}>
              {data.inquiries.map(inq => (
                <div key={inq.id} style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.md,
                  padding: `${SPACING.sm}px ${SPACING.md}px`,
                  borderRadius: RADIUS.md, marginBottom: 2,
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, flex: 1 }}>
                    {inq.vehicle_year} {inq.vehicle_make} {inq.vehicle_model}
                  </span>
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>{inq.customer_name}</span>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {new Date(inq.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        {/* New Messages / Missed Calls — placeholder until Communication module */}
        <DashboardCard
          title="New Messages / Missed Calls"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
        >
          <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
            Connects to Communication module — coming soon.
          </div>
        </DashboardCard>

        {/* Today's Schedule - Flat Glass — placeholder */}
        <DashboardCard
          title="Today's Schedule (Flat Glass Appointments)"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 12h18M12 3v18" />
            </svg>
          }
        >
          <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
            Flat glass scheduling — coming soon.
          </div>
        </DashboardCard>

        {/* Auto MTD Metrics */}
        <DashboardCard
          title="Auto MTD Metrics"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
        >
          {data ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: SPACING.lg }}>
              <StatCard
                label="Total Sales"
                value={data.mtd.totalSales.toLocaleString()}
                prefix="$"
                color={COLORS.red}
                subtitle={`${data.mtd.bookedCount} bookings`}
              />
              <StatCard
                label="Projected Sales"
                value={data.mtd.projectedSales.toLocaleString()}
                prefix="$"
                color="#f59e0b"
                subtitle={`$${data.mtd.dailyAvg}/day avg`}
              />
              <StatCard
                label="Completed"
                value={data.mtd.completedCount}
                color="#22c55e"
                subtitle={`of ${data.mtd.bookedCount} booked`}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: SPACING.lg }}>
              <StatCard label="Total Sales" value="--" color={COLORS.red} />
              <StatCard label="Projected Sales" value="--" color="#f59e0b" />
              <StatCard label="Completed" value="--" color="#22c55e" />
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}

function QuickStat({ label, value, color, compact }: { label: string; value: string | number; color: string; compact?: boolean }) {
  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.borderAccent}`,
      borderRadius: RADIUS.xl,
      padding: compact ? `${SPACING.sm}px ${SPACING.md}px` : `${SPACING.lg}px ${SPACING.xl}px`,
      display: 'flex',
      flexDirection: compact ? 'column' : 'row',
      alignItems: compact ? 'flex-start' : 'center',
      gap: compact ? SPACING.xs : SPACING.md,
    }}>
      <div style={{ fontSize: compact ? FONT.sizeLg : FONT.sizePageTitle, fontWeight: FONT.weightBold, color }}>{value}</div>
      <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}
