'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';
import EditAppointmentModal from './EditAppointmentModal';
import TimelineView from './TimelineView';

interface DaySummary {
  total: number;
  dropoffs: number;
  waiting: number;
  headsups: number;
  cancelled: number;
  totalRevenue: number;
  totalBalance: number;
}

export default function AppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto/appointments?date=${selectedDate}`);
      const data = await res.json();
      setAppointments(data.appointments || []);
      setSummary(data.summary || null);
    } catch {
      setAppointments([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Optimistic update — modify local state immediately, persist in background
  function updateLocalAppointment(id: string, updates: Record<string, unknown>) {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } as Appointment : a));
  }

  async function handleStatusChange(id: string, status: string) {
    updateLocalAppointment(id, { status });
    try {
      await fetch('/api/auto/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
    } catch { /* silent — local state already updated */ }
  }

  async function handleDurationChange(id: string, newDuration: number) {
    updateLocalAppointment(id, { duration_minutes: newDuration });
    try {
      await fetch('/api/auto/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, duration_minutes: newDuration }),
      });
    } catch { /* silent */ }
  }

  async function handleEditSave(id: string, updates: Record<string, unknown>) {
    // If rescheduled to a different date, remove from current view
    if (updates.appointment_date && updates.appointment_date !== selectedDate) {
      setAppointments(prev => prev.filter(a => a.id !== id));
    } else {
      updateLocalAppointment(id, updates);
    }
    setEditingAppointment(null);
    try {
      await fetch('/api/auto/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
    } catch { /* silent */ }
  }

  function navigateDate(offset: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const activeAppointments = appointments.filter(a => a.status !== 'cancelled');

  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Automotive"
        actions={
          <Button variant="primary" size="sm">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 1v12M1 7h12"/>
            </svg>
            New Appointment
          </Button>
        }
      />

      {/* Date Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        marginBottom: SPACING.xl, flexWrap: 'wrap',
      }}>
        <button onClick={() => navigateDate(-1)} style={{
          background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
          color: COLORS.textTertiary, borderRadius: RADIUS.md,
          padding: '8px 12px', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 2L4 7l5 5"/>
          </svg>
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            background: COLORS.inputBg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
            padding: '8px 16px', fontSize: FONT.sizeBase, cursor: 'pointer', outline: 'none',
          }}
        />

        <button onClick={() => navigateDate(1)} style={{
          background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
          color: COLORS.textTertiary, borderRadius: RADIUS.md,
          padding: '8px 12px', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 2l5 5-5 5"/>
          </svg>
        </button>

        {!isToday && (
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{
            background: COLORS.activeBg, color: COLORS.red,
            border: '1px solid transparent', borderRadius: RADIUS.md,
            padding: '8px 16px', cursor: 'pointer', fontSize: FONT.sizeSm,
            fontWeight: FONT.weightSemibold,
          }}>
            Today
          </button>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: FONT.sizeBase, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
          {displayDate}
        </div>
      </div>

      {/* Day Summary */}
      {summary && (
        <div style={{
          display: 'flex', gap: SPACING.lg, marginBottom: SPACING.xl, flexWrap: 'wrap',
        }}>
          <SummaryPill label="Total" value={summary.total} />
          <SummaryPill label="Drop-Off" value={summary.dropoffs} color="#3b82f6" />
          <SummaryPill label="Waiting" value={summary.waiting} color="#ef4444" />
          <SummaryPill label="Flex-Wait" value={summary.headsups} color="#f59e0b" />
          {summary.cancelled > 0 && (
            <SummaryPill label="Cancelled" value={summary.cancelled} color={COLORS.textMuted} />
          )}
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: FONT.sizeBase, color: COLORS.textTertiary,
            display: 'flex', alignItems: 'center',
          }}>
            Est. <strong style={{ color: COLORS.textPrimary, marginLeft: 4 }}>${summary.totalRevenue.toLocaleString()}</strong>
          </div>
        </div>
      )}

      {/* Timeline View */}
      {loading ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
            Loading appointments...
          </div>
        </DashboardCard>
      ) : activeAppointments.length === 0 ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
            No appointments scheduled for this date.
          </div>
        </DashboardCard>
      ) : (
        <TimelineView
          appointments={activeAppointments}
          onEdit={setEditingAppointment}
          onStatusChange={handleStatusChange}
          onOrderChange={async (positions) => {
            try {
              await fetch('/api/auto/appointments/save-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions }),
              });
            } catch { /* silent */ }
          }}
          onDurationChange={handleDurationChange}
          onReady={(apt) => {
            // TODO: Wire to communication module — sends templated "vehicle ready" SMS
            console.log('Ready notification for:', apt.customer_name, apt.customer_phone);
            handleStatusChange(apt.id, 'completed');
          }}
          onMessage={(apt) => {
            // TODO: Wire to communication module — opens custom message dialog
            console.log('Custom message for:', apt.customer_name, apt.customer_phone);
          }}
        />
      )}

      {/* Edit Modal */}
      {editingAppointment && (
        <EditAppointmentModal
          appointment={editingAppointment}
          onSave={handleEditSave}
          onClose={() => setEditingAppointment(null)}
        />
      )}
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: RADIUS.lg,
      background: color ? `${color}15` : COLORS.hoverBg,
      border: `1px solid ${color ? `${color}30` : COLORS.border}`,
    }}>
      <span style={{
        fontSize: FONT.sizePageTitle, fontWeight: FONT.weightBold,
        color: color || COLORS.textPrimary,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
        color: COLORS.textMuted, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}
