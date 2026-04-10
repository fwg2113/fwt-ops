'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';
import { useAuth } from '@/app/components/AuthProvider';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { playSound } from '@/app/lib/notificationSounds';
import type { Appointment } from './AppointmentCard';
import { MODULE_LABELS } from './AppointmentCard';
import EditAppointmentModal from './EditAppointmentModal';
import EditConsultationModal from './EditConsultationModal';
import TimelineView from './TimelineView';
import MessageModal from './MessageModal';
import InvoiceChoiceModal from './InvoiceChoiceModal';
import { type ActionButtonConfig, DEFAULT_BUTTONS_CONFIG } from './ConfigurableActions';
import CreateAppointmentModal from './CreateAppointmentModal';
import HeadsUpModal from './HeadsUpModal';
import NewBookingToastStack, { type NewBookingToastData } from './NewBookingToast';

interface DaySummary {
  total: number;
  dropoffs: number;
  waiting: number;
  headsups: number;
  paid: number;
  cancelled: number;
  totalRevenue: number;
  totalBalance: number;
}

interface ShopConfigSlice {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  action_buttons_config: { buttons: ActionButtonConfig[] };
  message_templates: Record<string, string>;
  checkout_flow_config: Record<string, unknown>;
  appointment_type_colors?: Record<string, string>;
}

export default function AppointmentsPage() {
  return <Suspense><AppointmentsPageInner /></Suspense>;
}

function AppointmentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const { user, updateViewPreferences } = useAuth();
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModules, setActiveModules] = useState<string[]>([]); // empty = all
  const [prefsInitialized, setPrefsInitialized] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; phone: string | null; module_permissions: string[] }>>([]);

  // Shop config for action buttons
  const [shopConfig, setShopConfig] = useState<ShopConfigSlice | null>(null);
  const [teamAssignmentConfig, setTeamAssignmentConfig] = useState({ enabled: true, requiredBeforeCheckin: false });

  // Modal state
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ apt: Appointment; templateKey: string | null } | null>(null);
  const [invoiceChoiceTarget, setInvoiceChoiceTarget] = useState<Appointment | null>(null);
  const [invoiceAnchorRect, setInvoiceAnchorRect] = useState<DOMRect | null>(null);

  // Heads-up command center
  const [showHeadsUp, setShowHeadsUp] = useState(false);

  // Assignment gate modals
  const [assignGateTarget, setAssignGateTarget] = useState<Appointment | null>(null); // "assign before check-in" prompt
  const [invoiceConfirmTarget, setInvoiceConfirmTarget] = useState<{ apt: Appointment; anchorRect: DOMRect | null } | null>(null);

  // Create appointment modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalLinkedGroupId, setCreateModalLinkedGroupId] = useState<string | null>(null);
  const [createModalPrefill, setCreateModalPrefill] = useState<{ customer: { name: string; phone: string; email: string }; vehicle: { year: number | null; make: string | null; model: string | null }; date: string } | null>(null);
  const [shopModules, setShopModules] = useState<Array<{ enabled: boolean; service_modules: { module_key: string; label: string; color: string } }>>([]);
  const [moduleColorMap, setModuleColorMap] = useState<Record<string, string>>({});
  const [moduleLabelMap, setModuleLabelMap] = useState<Record<string, string>>({});

  // New-booking toast state. Each toast is persistent until the user clicks
  // Acknowledge or X. The team needs to actually see and confirm new bookings,
  // so auto-dismiss is intentionally NOT implemented.
  const [newBookingToasts, setNewBookingToasts] = useState<NewBookingToastData[]>([]);
  // Ref-mirror so the realtime callback always sees the latest selectedDate
  // without having to re-subscribe whenever the date changes.
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  // Ref to fetchAppointments so the realtime callback can re-fetch without
  // creating a subscription dependency loop.
  const fetchAppointmentsRef = useRef<() => void>(() => {});
  // Notification sound settings — fetched once on mount, refreshed on the
  // sound key + custom URL when the user changes them in Settings.
  const bookingSoundRef = useRef<{ key: string; customUrl: string | null; soundEnabled: boolean }>({
    key: 'xylophone',
    customUrl: null,
    soundEnabled: true,
  });
  // Set of booking IDs we've already acknowledged as "booked" on this page
  // session. Used to prevent the new-booking toast from firing on ordinary
  // UPDATE events (drag reorder, status changes, edits) — Supabase Realtime
  // doesn't send the old row's fields by default (REPLICA IDENTITY DEFAULT
  // only ships the primary key), so we can't compare old→new status at the
  // payload level. Client-side dedup by id is the reliable fix.
  const seenBookedIdsRef = useRef<Set<string>>(new Set());

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto/appointments?date=${selectedDate}`);
      const data = await res.json();
      const apts: Appointment[] = data.appointments || [];
      setAppointments(apts);
      setSummary(data.summary || null);
      if (data.teamMembers) setTeamMembers(data.teamMembers);
      if (data.moduleColorMap) setModuleColorMap(data.moduleColorMap);
      if (data.moduleLabelMap) setModuleLabelMap(data.moduleLabelMap);
      if (data.teamAssignmentConfig) setTeamAssignmentConfig(data.teamAssignmentConfig);
      // Seed the toast dedup set with the IDs of every appointment already on
      // the page. Future realtime UPDATEs for these rows (drag reorder, status
      // changes, edits) will be recognized as "already seen" and skip the toast.
      for (const a of apts) {
        if (a.id) seenBookedIdsRef.current.add(String(a.id));
      }
    } catch {
      setAppointments([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Fetch shop config (once)
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/auto/settings');
        const data = await res.json();
        if (data.shopConfig) {
          setShopConfig({
            shop_name: data.shopConfig.shop_name || '',
            shop_phone: data.shopConfig.shop_phone || '',
            shop_address: data.shopConfig.shop_address || '',
            action_buttons_config: data.shopConfig.action_buttons_config || { buttons: DEFAULT_BUTTONS_CONFIG },
            message_templates: data.shopConfig.message_templates || {},
            checkout_flow_config: data.shopConfig.checkout_flow_config || {},
            appointment_type_colors: data.shopConfig.appointment_type_colors || null,
          });
        }
        if (data.shopModules) {
          setShopModules(data.shopModules);
        }
      } catch { /* use defaults */ }
    }
    fetchConfig();
  }, []);

  // Initialize module filter from saved preferences (once)
  useEffect(() => {
    if (prefsInitialized) return;
    if (!user || shopModules.filter(sm => sm.enabled !== false).length === 0) return;
    const saved = user.viewPreferences?.appointments;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      setActiveModules(saved);
    }
    // else leave empty = show all
    setPrefsInitialized(true);
  }, [user, shopModules, prefsInitialized]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Keep the realtime callback's view of fetchAppointments fresh so it always
  // re-fetches against the currently-selected date.
  useEffect(() => {
    fetchAppointmentsRef.current = fetchAppointments;
  }, [fetchAppointments]);

  // Load the booking-alert sound setting once on mount. We don't poll —
  // changes from the Settings tab are picked up the next time the page mounts,
  // which is fine for the alert tier.
  useEffect(() => {
    let cancelled = false;
    async function loadBookingSound() {
      try {
        const [notifRes, soundsRes] = await Promise.all([
          fetch('/api/settings/notifications').then(r => r.json()),
          fetch('/api/settings/notification-sounds').then(r => r.json()),
        ]);
        if (cancelled) return;
        const key = notifRes?.booking_sound_key || 'xylophone';
        const soundEnabled = notifRes?.sound_enabled !== false;
        let customUrl: string | null = null;
        if (key.startsWith('custom:')) {
          const id = key.slice('custom:'.length);
          const found = (soundsRes?.sounds || []).find((s: { id: string; dataUrl: string }) => s.id === id);
          customUrl = found?.dataUrl || null;
        }
        bookingSoundRef.current = { key, customUrl, soundEnabled };
      } catch {
        // Silent — fall back to default
      }
    }
    loadBookingSound();
    return () => { cancelled = true; };
  }, []);

  // ============================================================================
  // REALTIME — listen for new bookings (insert OR pending→booked update from
  // the Square confirmation flow) and refresh the timeline + show a toast.
  // The team needs the appointment to land WITHOUT manual refresh.
  //
  // DEDUP: Supabase Realtime's default REPLICA IDENTITY only ships the primary
  // key in payload.old, so we can't compare old→new status at the payload
  // level. Instead, we track seenBookedIdsRef — a client-side set of booking
  // IDs that have already been acknowledged as "booked" on this page session.
  // - Initial fetch seeds the set with every visible booking's id.
  // - INSERTs/UPDATEs only fire the toast if the id is NOT already in the set.
  // - When a row transitions AWAY from 'booked' (cancelled, etc.) we remove it
  //   so a future re-book fires correctly.
  // This prevents drag-reorder, status changes, or edit-save from spuriously
  // re-triggering the toast while still firing correctly for genuinely new
  // bookings and pending→booked Square confirmations.
  // ============================================================================
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel('auto-bookings-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auto_bookings' },
        (payload) => {
          handleRealtimeBooking(payload.new as Record<string, unknown>);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auto_bookings' },
        (payload) => {
          handleRealtimeBooking(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    function handleRealtimeBooking(row: Record<string, unknown>) {
      const id = row.id ? String(row.id) : null;
      if (!id) return;
      const status = String(row.status || '');

      // If the row is NOT in booked status, make sure it's not in the seen set
      // so that a future re-transition to booked will fire. (Cancel → rebook
      // scenario, or the initial pending_payment INSERT that should be ignored.)
      if (status !== 'booked') {
        seenBookedIdsRef.current.delete(id);
        return;
      }

      // Only react to bookings on the currently-displayed date.
      const apptDate = String(row.appointment_date || '');
      if (apptDate !== selectedDateRef.current) {
        // Even off-date bookings should be marked seen so drag reorders on the
        // same row don't trigger later if the user navigates to that date.
        seenBookedIdsRef.current.add(id);
        return;
      }

      // Already acknowledged on this session → bail for most updates.
      // Exception: heads-up claim (appointment_time just got set) needs
      // a refetch to move the card from the queue to the timeline.
      if (seenBookedIdsRef.current.has(id)) {
        const aptType = String(row.appointment_type || '');
        const aptTime = row.appointment_time;
        if ((aptType === 'headsup_30' || aptType === 'headsup_60') && aptTime) {
          // Customer claimed a slot -- refetch to move card from queue to timeline
          fetchAppointmentsRef.current();
        }
        return;
      }

      // Genuinely new booking — mark it seen, refetch, show toast, play sound.
      seenBookedIdsRef.current.add(id);
      fetchAppointmentsRef.current();

      const toast: NewBookingToastData = {
        id,
        customerName: String(row.customer_name || ''),
        vehicleYear: (row.vehicle_year as number) || null,
        vehicleMake: (row.vehicle_make as string) || null,
        vehicleModel: (row.vehicle_model as string) || null,
        appointmentDate: apptDate,
        appointmentTime: (row.appointment_time as string) || null,
        appointmentType: (row.appointment_type as string) || null,
        servicesJson: Array.isArray(row.services_json) ? (row.services_json as NewBookingToastData['servicesJson']) : [],
        subtotal: Number(row.subtotal) || 0,
        depositPaid: Number(row.deposit_paid) || 0,
        balanceDue: Number(row.balance_due) || 0,
        bookingSource: (row.booking_source as string) || null,
      };

      setNewBookingToasts((prev) => {
        // Defense-in-depth: dedupe by id in the toast list too
        if (prev.some((t) => t.id === toast.id)) return prev;
        const cfg = bookingSoundRef.current;
        if (cfg.soundEnabled) {
          try { playSound(cfg.key, cfg.customUrl || undefined); } catch { /* ignore */ }
        }
        return [toast, ...prev];
      });
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // subscribe once on mount; selectedDate is read via ref

  function dismissToast(id: string) {
    setNewBookingToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Optimistic update
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
    } catch { /* silent */ }
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
    const apt = appointments.find(a => a.id === id);
    const dateChanged = updates.appointment_date && updates.appointment_date !== apt?.appointment_date;
    const timeChanged = updates.appointment_time && updates.appointment_time !== apt?.appointment_time;
    const hasLinkedSiblings = apt?.linked_group_id && apt.linked_slots && apt.linked_slots.length > 0;

    // Update the primary appointment
    if (dateChanged && updates.appointment_date !== selectedDate) {
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

      // Move linked siblings when date or time changes
      if (hasLinkedSiblings && (dateChanged || timeChanged)) {
        const siblingUpdates: Record<string, unknown> = {};
        if (dateChanged) siblingUpdates.appointment_date = updates.appointment_date;
        if (timeChanged) siblingUpdates.appointment_time = updates.appointment_time;

        for (const sib of apt.linked_slots!) {
          // Update locally
          if (dateChanged && updates.appointment_date !== selectedDate) {
            setAppointments(prev => prev.filter(a => a.id !== sib.id));
          } else {
            updateLocalAppointment(sib.id, siblingUpdates);
          }
          // Update in DB
          await fetch('/api/auto/appointments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: sib.id, ...siblingUpdates }),
          });
        }
      }
    } catch { /* silent */ }
  }

  async function handleAssign(aptId: string, teamMemberId: string | null) {
    const member = teamMemberId ? teamMembers.find(tm => tm.id === teamMemberId) : null;
    updateLocalAppointment(aptId, {
      assigned_team_member_id: teamMemberId,
      assigned_team_member_name: member?.name || null,
    });
    try {
      await fetch('/api/auto/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aptId, assigned_team_member_id: teamMemberId }),
      });
    } catch { /* silent */ }
  }

  async function handleAssignMulti(aptId: string, teamMemberIds: string[]) {
    const names = teamMemberIds.map(id => teamMembers.find(tm => tm.id === id)?.name).filter(Boolean) as string[];
    updateLocalAppointment(aptId, {
      assigned_team_member_ids: teamMemberIds,
      assigned_team_member_names: names,
      assigned_team_member_id: teamMemberIds[0] || null,
      assigned_team_member_name: names[0] || null,
    });
    try {
      await fetch('/api/auto/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: aptId,
          assigned_team_member_ids: teamMemberIds,
          assigned_team_member_id: teamMemberIds[0] || null,
        }),
      });
    } catch { /* silent */ }
  }

  // ================================================================
  // UNIFIED ACTION HANDLER — dispatches based on button behavior
  // ================================================================
  function handleAction(buttonKey: string, apt: Appointment, anchorRect?: DOMRect) {
    const buttons = shopConfig?.action_buttons_config?.buttons || DEFAULT_BUTTONS_CONFIG;
    const btn = buttons.find(b => b.key === buttonKey);
    if (!btn) return;

    switch (btn.behavior) {
      case 'edit_modal':
        setEditingAppointment(apt);
        break;

      case 'status_change':
        if (btn.statusTarget) {
          // Check-in gate: require team assignment before checking in
          if (btn.statusTarget === 'in_progress' && teamAssignmentConfig.enabled && teamAssignmentConfig.requiredBeforeCheckin) {
            const hasAssignment = (apt.assigned_team_member_ids?.length > 0) || apt.assigned_team_member_id;
            if (!hasAssignment) {
              setAssignGateTarget(apt);
              return;
            }
          }
          handleStatusChange(apt.id, btn.statusTarget);
          if (btn.messageTemplate) {
            setMessageTarget({ apt, templateKey: btn.messageTemplate });
          }
        }
        break;

      case 'message_modal':
        setMessageTarget({ apt, templateKey: btn.messageTemplate || null });
        break;

      case 'invoice_modal':
        // Assignment confirmation before invoicing (if team assignment is enabled and someone is assigned)
        if (teamAssignmentConfig.enabled && (apt.assigned_team_member_ids?.length > 0 || apt.assigned_team_member_id)) {
          setInvoiceConfirmTarget({ apt, anchorRect: anchorRect || null });
          return;
        }
        setInvoiceChoiceTarget(apt);
        setInvoiceAnchorRect(anchorRect || null);
        break;

      case 'headsup_send':
        setShowHeadsUp(true);
        break;
    }
  }

  function navigateDate(offset: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const activeAppointments = appointments
    .filter(a => a.status !== 'cancelled')
    .filter(a => activeModules.length === 0 || activeModules.includes(a.module || 'auto_tint'))
    .filter(a => {
      if (teamFilter === 'all') return true;
      if (teamFilter === 'unassigned') return !(a.assigned_team_member_ids?.length > 0) && !a.assigned_team_member_id;
      return (a.assigned_team_member_ids || []).includes(teamFilter) || a.assigned_team_member_id === teamFilter;
    });

  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const buttonsConfig = shopConfig?.action_buttons_config?.buttons || DEFAULT_BUTTONS_CONFIG;

  // Split: heads-up appointments without a time go in the queue, everything else on the timeline
  const headsupQueue = activeAppointments
    .filter(a => (a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60') && !a.appointment_time)
    .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()); // oldest first (left)
  const timelineAppointments = activeAppointments
    .filter(a => !((a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60') && !a.appointment_time));

  return (
    <div>
      {/* Real-time new-booking toast stack — fixed-position top-right overlay */}
      <NewBookingToastStack toasts={newBookingToasts} onDismiss={dismissToast} />

      {/* Sticky header on mobile so user can always access nav/filters */}
      <div style={isMobile ? {
        position: 'sticky', top: 0, zIndex: 20,
        background: COLORS.pageBg, paddingTop: 4, paddingBottom: 4,
      } : undefined}>
      <PageHeader
        title="Appointments"
        subtitle="Daily Schedule"
      />

      {/* Date Navigation */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : SPACING.md,
        marginBottom: isMobile ? 12 : SPACING.xl, flexWrap: isMobile ? undefined : 'wrap',
      }}>
        {/* Row 1: Date picker with arrows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigateDate(-1)} style={{
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textTertiary, borderRadius: RADIUS.md,
            padding: isMobile ? '12px 14px' : '8px 12px', cursor: 'pointer',
            flexShrink: 0,
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
              padding: isMobile ? '12px 16px' : '8px 16px',
              fontSize: isMobile ? '1rem' : FONT.sizeBase,
              cursor: 'pointer', outline: 'none', flex: isMobile ? 1 : undefined,
            }}
          />

          <button onClick={() => navigateDate(1)} style={{
            background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
            color: COLORS.textTertiary, borderRadius: RADIUS.md,
            padding: isMobile ? '12px 14px' : '8px 12px', cursor: 'pointer',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 2l5 5-5 5"/>
            </svg>
          </button>

          {!isToday && (
            <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{
              background: COLORS.activeBg, color: COLORS.red,
              border: '1px solid transparent', borderRadius: RADIUS.md,
              padding: isMobile ? '12px 16px' : '8px 16px', cursor: 'pointer',
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, flexShrink: 0,
            }}>
              Today
            </button>
          )}

          {/* Heads Up button -- visible when there are headsup appointments */}
          {appointments.some(a => a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60') && (
            <button onClick={() => setShowHeadsUp(true)} style={{
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)', borderRadius: RADIUS.md,
              padding: isMobile ? '12px 16px' : '8px 16px', cursor: 'pointer',
              fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.11 2 2 0 0 1 4.11 2h3"/>
                <polyline points="16 2 22 2 22 8"/><line x1="22" y1="2" x2="16" y2="8"/>
              </svg>
              Heads Up ({appointments.filter(a => a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60').length})
            </button>
          )}
        </div>

        {/* Row 2: Service module toggle buttons + team filter */}
        {shopModules.filter(sm => sm.enabled !== false).length > 1 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            alignItems: 'center',
          }}>
            {/* All button */}
            <button
              onClick={() => setActiveModules([])}
              style={{
                padding: isMobile ? '8px 14px' : '6px 14px',
                borderRadius: 20,
                border: `1.5px solid ${activeModules.length === 0 ? COLORS.textPrimary : COLORS.borderInput}`,
                background: activeModules.length === 0 ? COLORS.textPrimary : 'transparent',
                color: activeModules.length === 0 ? COLORS.pageBg : COLORS.textSecondary,
                fontSize: isMobile ? '0.85rem' : FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              All
            </button>

            {/* Module toggle buttons */}
            {shopModules.filter(sm => sm.enabled !== false).map(sm => {
              const key = sm.service_modules.module_key;
              const color = sm.service_modules.color || COLORS.textPrimary;
              const isActive = activeModules.includes(key);
              const label = isMobile
                ? (MODULE_LABELS[key]?.replace('Window Tint', 'Tint').replace('Flat Glass', 'Flat').replace('Vehicle Wraps', 'Wraps').replace('Ceramic Coating', 'Ceramic') || key)
                : (MODULE_LABELS[key] || sm.service_modules.label || key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (isActive) {
                      const next = activeModules.filter(m => m !== key);
                      setActiveModules(next);
                    } else {
                      setActiveModules([...activeModules, key]);
                    }
                  }}
                  style={{
                    padding: isMobile ? '8px 14px' : '6px 14px',
                    borderRadius: 20,
                    border: `1.5px solid ${isActive ? color : COLORS.borderInput}`,
                    background: isActive ? color : 'transparent',
                    color: isActive ? '#fff' : COLORS.textSecondary,
                    fontSize: isMobile ? '0.85rem' : FONT.sizeSm,
                    fontWeight: FONT.weightSemibold,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              );
            })}

            {/* Save as Default button */}
            <button
              onClick={() => updateViewPreferences('appointments', activeModules)}
              title="Save current filter as default for this page"
              style={{
                padding: isMobile ? '8px 14px' : '6px 14px',
                borderRadius: 20,
                border: `1.5px solid ${COLORS.red}`,
                background: COLORS.red,
                color: '#fff',
                fontSize: isMobile ? '0.85rem' : FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12.667 2H3.333C2.597 2 2 2.597 2 3.333v9.334C2 13.403 2.597 14 3.333 14h9.334c.736 0 1.333-.597 1.333-1.333V3.333C14 2.597 13.403 2 12.667 2z"/>
                <path d="M11.333 14V8.667H4.667V14"/>
                <path d="M4.667 2v3.333h5.333"/>
              </svg>
              Save Default View
            </button>
          </div>
        )}

        {/* Team filter + date display */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          flexWrap: isMobile ? undefined : 'nowrap',
        }}>
          {teamMembers.length >= 2 && (
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              style={{
                background: COLORS.inputBg, color: COLORS.textPrimary,
                border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                padding: isMobile ? '12px 12px' : '8px 16px',
                fontSize: isMobile ? '0.95rem' : FONT.sizeBase,
                cursor: 'pointer', outline: 'none',
                appearance: 'auto' as const,
                flex: isMobile ? 1 : undefined,
              }}
            >
              <option value="all">All Team</option>
              <option value="unassigned">Unassigned</option>
              {teamMembers.map(tm => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          )}

          {!isMobile && (
            <>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: FONT.sizeBase, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
                {displayDate}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Display date on mobile (compact) */}
      {isMobile && (
        <div style={{
          fontSize: '0.9rem', color: COLORS.textTertiary,
          fontWeight: FONT.weightSemibold, marginBottom: 12,
        }}>
          {displayDate}
        </div>
      )}

      {/* Day Summary */}
      {summary && (
        <div style={{
          display: isMobile ? 'grid' : 'flex',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : undefined,
          gap: isMobile ? 8 : SPACING.lg,
          marginBottom: isMobile ? 12 : SPACING.xl,
          flexWrap: isMobile ? undefined : 'wrap',
        }}>
          <SummaryPill label="Total" value={summary.total} isMobile={isMobile} />
          <SummaryPill label="Drop-Off" value={summary.dropoffs} color="#3b82f6" isMobile={isMobile} />
          <SummaryPill label="Waiting" value={summary.waiting} color="#ef4444" isMobile={isMobile} />
          <SummaryPill label="Heads-Up" value={summary.headsups} color="#f59e0b" isMobile={isMobile} />
          <SummaryPill label="Paid" value={summary.paid} color="#22c55e" isMobile={isMobile} />
          {summary.cancelled > 0 && (
            <SummaryPill label="Cancelled" value={summary.cancelled} color={COLORS.textMuted} isMobile={isMobile} />
          )}
          {isMobile ? (
            <div style={{
              gridColumn: '1 / -1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 14px', borderRadius: RADIUS.lg,
              background: COLORS.hoverBg, border: `1px solid ${COLORS.border}`,
            }}>
              <span style={{ fontSize: '0.9rem', color: COLORS.textTertiary }}>
                Est. <strong style={{ color: COLORS.textPrimary }}>${summary.totalRevenue.toLocaleString()}</strong>
              </span>
            </div>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <div style={{
                fontSize: FONT.sizeBase, color: COLORS.textTertiary,
                display: 'flex', alignItems: 'center',
              }}>
                Est. <strong style={{ color: COLORS.textPrimary, marginLeft: 4 }}>${summary.totalRevenue.toLocaleString()}</strong>
              </div>
            </>
          )}
        </div>
      )}
      </div>{/* end sticky header wrapper */}

      {/* Heads-Up Queue (above timeline) */}
      {headsupQueue.length > 0 && (
        <div style={{ marginBottom: SPACING.lg }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Heads-Up Queue ({headsupQueue.length})
            </span>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              Waiting for time assignment -- ordered by booking date
            </span>
          </div>
          <div style={{
            display: 'flex', gap: SPACING.md, overflowX: 'auto',
            paddingTop: 10, paddingBottom: SPACING.md,
          }}>
            {headsupQueue.map((apt, idx) => {
              const typeLabel = apt.appointment_type === 'headsup_60' ? '60-min' : '30-min';
              const modColor = moduleColorMap?.[apt.module || 'auto_tint'] || '#3b82f6';
              const services = (() => {
                if (!apt.services_json || !Array.isArray(apt.services_json)) return '';
                return (apt.services_json as Array<{ label?: string; filmAbbrev?: string; shade?: string; shadeFront?: string; shadeRear?: string }>)
                  .map(s => {
                    const parts = [s.label || ''];
                    if (s.filmAbbrev) parts.push(s.filmAbbrev);
                    if (s.shadeFront && s.shadeRear) parts.push(`${s.shadeFront}/${s.shadeRear}`);
                    else if (s.shade) parts.push(s.shade);
                    return parts.join(' ');
                  }).join(' | ');
              })();
              const notified = !!apt.headsup_notified_at;
              return (
                <div
                  key={apt.id}
                  onClick={() => setEditingAppointment(apt)}
                  style={{
                    minWidth: isMobile ? 260 : 280, maxWidth: 340, flex: '0 0 auto',
                    background: `linear-gradient(135deg, ${modColor}18, ${modColor}08)`,
                    border: `2px solid ${notified ? '#f59e0b' : modColor}40`,
                    borderRadius: RADIUS.lg, padding: `${SPACING.md}px ${SPACING.md}px ${SPACING.lg}px`,
                    cursor: 'pointer', position: 'relative',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  {/* Order badge */}
                  <div style={{
                    position: 'absolute', top: -8, left: 12,
                    background: '#f59e0b', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                    padding: '2px 8px', borderRadius: 10, textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}>
                    #{idx + 1} {typeLabel}
                  </div>

                  {/* Notified badge */}
                  {notified && (
                    <div style={{
                      position: 'absolute', top: -8, right: 12,
                      background: '#22c55e', color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10,
                    }}>
                      Sent
                    </div>
                  )}

                  {/* Customer + Vehicle */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                      {apt.customer_name}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textSecondary, marginTop: 2 }}>
                      {apt.vehicle_year} {apt.vehicle_make} {apt.vehicle_model}
                    </div>
                  </div>

                  {/* Services */}
                  <div style={{
                    fontSize: FONT.sizeXs, color: COLORS.textTertiary, marginTop: 6,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {services}
                  </div>

                  {/* Price + booking ID */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                    <span style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                      ${Number(apt.subtotal || 0).toFixed(0)}
                    </span>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      #{apt.booking_id}
                    </span>
                  </div>
                </div>
              );
            })}
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
      ) : timelineAppointments.length === 0 && headsupQueue.length === 0 ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
            No appointments scheduled for this date.
          </div>
        </DashboardCard>
      ) : (
        <TimelineView
          appointments={timelineAppointments}
          isMobile={isMobile}
          isTablet={isTablet}
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
          onAction={handleAction}
          buttonsConfig={buttonsConfig}
          teamMembers={teamMembers}
          onAssign={handleAssign}
          onAssignMulti={handleAssignMulti}
          teamAssignmentConfig={teamAssignmentConfig}
          moduleColorMap={moduleColorMap}
          moduleLabelMap={moduleLabelMap}
          typeColorMap={shopConfig?.appointment_type_colors}
          onAddLinkedSlot={(apt) => {
            const groupId = apt.linked_group_id || apt.id; // Use existing group or create new group from this appointment
            setCreateModalLinkedGroupId(groupId);
            setCreateModalPrefill({
              customer: { name: apt.customer_name, phone: apt.customer_phone || '', email: apt.customer_email || '' },
              vehicle: { year: apt.vehicle_year, make: apt.vehicle_make, model: apt.vehicle_model },
              date: apt.appointment_date,
            });
            setShowCreateModal(true);
          }}
        />
      )}

      {/* Edit Modal -- consultation vs regular */}
      {editingAppointment && editingAppointment.appointment_type === 'consultation' && (
        <EditConsultationModal
          appointment={editingAppointment}
          teamMembers={teamMembers}
          onSave={handleEditSave}
          onClose={() => setEditingAppointment(null)}
        />
      )}
      {editingAppointment && editingAppointment.appointment_type !== 'consultation' && (
        <EditAppointmentModal
          appointment={editingAppointment}
          onSave={handleEditSave}
          onClose={() => setEditingAppointment(null)}
        />
      )}

      {/* Heads-Up Command Center */}
      {showHeadsUp && (
        <HeadsUpModal
          appointments={appointments.filter(a => a.appointment_type === 'headsup_30' || a.appointment_type === 'headsup_60')}
          selectedDate={selectedDate}
          onClose={() => setShowHeadsUp(false)}
          onRefresh={fetchAppointments}
        />
      )}

      {/* Message Modal */}
      {messageTarget && shopConfig && (
        <MessageModal
          appointment={messageTarget.apt}
          shopConfig={shopConfig}
          defaultTemplateKey={messageTarget.templateKey}
          templates={messageTarget.apt.appointment_type === 'consultation'
            ? {
                consultation_onway: 'Hi {customer_first_name}, we are on our way! We will see you soon.',
                consultation_reminder: 'Hi {customer_first_name}, just a reminder about your consultation today. Looking forward to meeting with you!',
                consultation_followup: 'Hi {customer_first_name}, thank you for meeting with us today! If you have any questions about what we discussed, don\'t hesitate to reach out.',
                ...(shopConfig.message_templates || {}),
              }
            : shopConfig.message_templates
          }
          onClose={() => setMessageTarget(null)}
        />
      )}

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <CreateAppointmentModal
          isOpen={showCreateModal}
          onClose={() => { setShowCreateModal(false); setCreateModalLinkedGroupId(null); setCreateModalPrefill(null); }}
          onCreated={() => { setShowCreateModal(false); setCreateModalLinkedGroupId(null); setCreateModalPrefill(null); fetchAppointments(); }}
          linkedGroupId={createModalLinkedGroupId}
          prefillCustomer={createModalPrefill?.customer || null}
          prefillVehicle={createModalPrefill?.vehicle || null}
          prefillDate={createModalPrefill?.date || selectedDate}
          shopModules={shopModules}
          teamMembers={teamMembers}
        />
      )}

      {/* Assignment Gate: must assign before check-in */}
      {assignGateTarget && (
        <>
          <div onClick={() => setAssignGateTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999, background: COLORS.cardBg, borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`, padding: SPACING.xl,
            maxWidth: 360, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
              Assign Team Member
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              At least one team member must be assigned before checking in.
            </div>
            {/* Quick multi-select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: SPACING.lg, maxHeight: 200, overflowY: 'auto' }}>
              {[...teamMembers]
                .sort((a, b) => {
                  const aMatch = a.module_permissions.includes(assignGateTarget.module || 'auto_tint') ? 0 : 1;
                  const bMatch = b.module_permissions.includes(assignGateTarget.module || 'auto_tint') ? 0 : 1;
                  return aMatch - bMatch || a.name.localeCompare(b.name);
                })
                .map(tm => {
                  const isAssigned = (assignGateTarget.assigned_team_member_ids || []).includes(tm.id);
                  return (
                    <button
                      key={tm.id}
                      onClick={() => {
                        const current = assignGateTarget.assigned_team_member_ids || [];
                        const updated = isAssigned ? current.filter(id => id !== tm.id) : [...current, tm.id];
                        handleAssignMulti(assignGateTarget.id, updated);
                        setAssignGateTarget({ ...assignGateTarget, assigned_team_member_ids: updated, assigned_team_member_names: updated.map(id => teamMembers.find(t => t.id === id)?.name).filter(Boolean) as string[] });
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: SPACING.sm,
                        padding: `${SPACING.sm}px ${SPACING.md}px`, background: 'none', border: 'none',
                        cursor: 'pointer', color: COLORS.textPrimary, fontSize: FONT.sizeSm, textAlign: 'left',
                        borderRadius: RADIUS.sm,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${isAssigned ? '#22c55e' : COLORS.borderInput}`,
                        background: isAssigned ? '#22c55e' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isAssigned && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M2 5l2 2 4-4"/></svg>}
                      </div>
                      {tm.name}
                    </button>
                  );
                })}
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button onClick={() => setAssignGateTarget(null)} style={{
                flex: 1, padding: SPACING.md, background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.md, color: COLORS.textMuted, fontSize: FONT.sizeSm, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if ((assignGateTarget.assigned_team_member_ids || []).length > 0) {
                    handleStatusChange(assignGateTarget.id, 'in_progress');
                    setAssignGateTarget(null);
                  }
                }}
                disabled={(assignGateTarget.assigned_team_member_ids || []).length === 0}
                style={{
                  flex: 2, padding: SPACING.md, background: (assignGateTarget.assigned_team_member_ids || []).length > 0 ? '#22c55e' : COLORS.borderInput,
                  border: 'none', borderRadius: RADIUS.md, color: '#fff', fontSize: FONT.sizeSm, fontWeight: 700,
                  cursor: (assignGateTarget.assigned_team_member_ids || []).length > 0 ? 'pointer' : 'not-allowed',
                  opacity: (assignGateTarget.assigned_team_member_ids || []).length === 0 ? 0.5 : 1,
                }}
              >
                Assign & Check In
              </button>
            </div>
          </div>
        </>
      )}

      {/* Invoice Assignment Confirmation */}
      {invoiceConfirmTarget && (
        <>
          <div onClick={() => setInvoiceConfirmTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999, background: COLORS.cardBg, borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`, padding: SPACING.xl,
            maxWidth: 340, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
              Confirm Team Assignment
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Assigned to this job:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              {(invoiceConfirmTarget.apt.assigned_team_member_names?.length > 0
                ? invoiceConfirmTarget.apt.assigned_team_member_names
                : invoiceConfirmTarget.apt.assigned_team_member_name ? [invoiceConfirmTarget.apt.assigned_team_member_name] : []
              ).map((name, i) => (
                <span key={i} style={{
                  padding: '4px 12px', borderRadius: RADIUS.lg, fontSize: FONT.sizeSm, fontWeight: 600,
                  background: `${COLORS.info}20`, color: COLORS.info,
                }}>
                  {name}
                </span>
              ))}
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              Is this correct?
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button onClick={() => {
                // Open assignment editor instead
                setInvoiceConfirmTarget(null);
                // TODO: could open the assignment popover, but for now just proceed
                setAssignGateTarget(invoiceConfirmTarget.apt);
              }} style={{
                flex: 1, padding: SPACING.md, background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.md, color: COLORS.textMuted, fontSize: FONT.sizeSm, cursor: 'pointer',
              }}>
                Edit
              </button>
              <button onClick={() => {
                const { apt, anchorRect } = invoiceConfirmTarget;
                setInvoiceConfirmTarget(null);
                setInvoiceChoiceTarget(apt);
                setInvoiceAnchorRect(anchorRect);
              }} style={{
                flex: 2, padding: SPACING.md, background: '#22c55e', border: 'none',
                borderRadius: RADIUS.md, color: '#fff', fontSize: FONT.sizeSm, fontWeight: 700, cursor: 'pointer',
              }}>
                Correct, Proceed
              </button>
            </div>
          </div>
        </>
      )}

      {/* Invoice Choice Popover */}
      {invoiceChoiceTarget && (
        <InvoiceChoiceModal
          appointment={invoiceChoiceTarget}
          anchorRect={invoiceAnchorRect}
          onCounterCheckout={(invoice) => {
            updateLocalAppointment(invoiceChoiceTarget.id, { status: 'invoiced' });
            setInvoiceChoiceTarget(null);
            // Navigate to the two-panel counter checkout page
            router.push(`/invoicing/checkout/${invoice.id}`);
          }}
          onSendToCustomer={(invoice) => {
            const apt = invoiceChoiceTarget;
            updateLocalAppointment(apt.id, { status: 'invoiced' });
            setInvoiceChoiceTarget(null);
            // Open message modal with invoice link
            setMessageTarget({
              apt,
              templateKey: 'invoice_sent',
            });
          }}
          onClose={() => { setInvoiceChoiceTarget(null); setInvoiceAnchorRect(null); }}
        />
      )}

    </div>
  );
}

function SummaryPill({ label, value, color, isMobile }: { label: string; value: number; color?: string; isMobile?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 6,
      padding: isMobile ? '10px 14px' : '6px 14px', borderRadius: RADIUS.lg,
      background: color ? `${color}15` : COLORS.hoverBg,
      border: `1px solid ${color ? `${color}30` : COLORS.border}`,
      justifyContent: isMobile ? 'center' : undefined,
    }}>
      <span style={{
        fontSize: isMobile ? '1.4rem' : FONT.sizePageTitle, fontWeight: FONT.weightBold,
        color: color || COLORS.textPrimary,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: isMobile ? '0.75rem' : FONT.sizeXs, fontWeight: FONT.weightSemibold,
        color: COLORS.textMuted, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}
