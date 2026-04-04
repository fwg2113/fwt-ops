'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';
import type { Appointment } from './AppointmentCard';
import { MODULE_LABELS } from './AppointmentCard';
import EditAppointmentModal from './EditAppointmentModal';
import EditConsultationModal from './EditConsultationModal';
import TimelineView from './TimelineView';
import MessageModal from './MessageModal';
import InvoiceChoiceModal from './InvoiceChoiceModal';
import { type ActionButtonConfig, DEFAULT_BUTTONS_CONFIG } from './ConfigurableActions';
import CreateAppointmentModal from './CreateAppointmentModal';

interface DaySummary {
  total: number;
  dropoffs: number;
  waiting: number;
  headsups: number;
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
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; phone: string | null; module_permissions: string[] }>>([]);

  // Shop config for action buttons
  const [shopConfig, setShopConfig] = useState<ShopConfigSlice | null>(null);

  // Modal state
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ apt: Appointment; templateKey: string | null } | null>(null);
  const [invoiceChoiceTarget, setInvoiceChoiceTarget] = useState<Appointment | null>(null);
  const [invoiceAnchorRect, setInvoiceAnchorRect] = useState<DOMRect | null>(null);

  // Create appointment modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalLinkedGroupId, setCreateModalLinkedGroupId] = useState<string | null>(null);
  const [createModalPrefill, setCreateModalPrefill] = useState<{ customer: { name: string; phone: string; email: string }; vehicle: { year: number | null; make: string | null; model: string | null }; date: string } | null>(null);
  const [shopModules, setShopModules] = useState<Array<{ service_modules: { module_key: string; label: string; color: string } }>>([]);
  const [moduleColorMap, setModuleColorMap] = useState<Record<string, string>>({});
  const [moduleLabelMap, setModuleLabelMap] = useState<Record<string, string>>({});

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto/appointments?date=${selectedDate}`);
      const data = await res.json();
      setAppointments(data.appointments || []);
      setSummary(data.summary || null);
      if (data.teamMembers) setTeamMembers(data.teamMembers);
      if (data.moduleColorMap) setModuleColorMap(data.moduleColorMap);
      if (data.moduleLabelMap) setModuleLabelMap(data.moduleLabelMap);
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

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

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
          handleStatusChange(apt.id, btn.statusTarget);
          // If this button also has a message template, open message modal after status change
          if (btn.messageTemplate) {
            setMessageTarget({ apt, templateKey: btn.messageTemplate });
          }
        }
        break;

      case 'message_modal':
        setMessageTarget({ apt, templateKey: btn.messageTemplate || null });
        break;

      case 'invoice_modal':
        setInvoiceChoiceTarget(apt);
        setInvoiceAnchorRect(anchorRect || null);
        break;

      case 'headsup_send':
        // TODO: Wire to heads-up communication — sends SMS with tokenized time slot link
        console.log('Send heads-up to:', apt.customer_name, apt.customer_phone);
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
    .filter(a => moduleFilter === 'all' || (a.module || 'auto_tint') === moduleFilter)
    .filter(a => {
      if (teamFilter === 'all') return true;
      if (teamFilter === 'unassigned') return !a.assigned_team_member_id;
      return a.assigned_team_member_id === teamFilter;
    });

  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const buttonsConfig = shopConfig?.action_buttons_config?.buttons || DEFAULT_BUTTONS_CONFIG;

  return (
    <div>
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
        </div>

        {/* Row 2 (mobile): Filters side by side */}
        {isMobile ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {(() => {
              const modulesInDay = [...new Set(appointments.map(a => a.module || 'auto_tint'))];
              const showFilter = modulesInDay.length > 1;
              if (!showFilter) return null;
              return (
                <select
                  value={moduleFilter}
                  onChange={e => setModuleFilter(e.target.value)}
                  style={{
                    background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                    padding: '12px 12px', fontSize: '0.95rem', cursor: 'pointer', outline: 'none',
                    appearance: 'auto' as const, flex: 1,
                  }}
                >
                  <option value="all">All Modules</option>
                  {modulesInDay.map(mod => (
                    <option key={mod} value={mod}>
                      {MODULE_LABELS[mod] || mod}
                    </option>
                  ))}
                </select>
              );
            })()}

            {teamMembers.length >= 2 && (
              <select
                value={teamFilter}
                onChange={e => setTeamFilter(e.target.value)}
                style={{
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                  padding: '12px 12px', fontSize: '0.95rem', cursor: 'pointer', outline: 'none',
                  appearance: 'auto' as const, flex: 1,
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
          </div>
        ) : (
          <>
            {/* Desktop: filters inline */}
            {(() => {
              const modulesInDay = [...new Set(appointments.map(a => a.module || 'auto_tint'))];
              const showFilter = modulesInDay.length > 1;
              if (!showFilter) return null;
              return (
                <select
                  value={moduleFilter}
                  onChange={e => setModuleFilter(e.target.value)}
                  style={{
                    background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                    padding: '8px 16px', fontSize: FONT.sizeBase, cursor: 'pointer', outline: 'none',
                    appearance: 'auto' as const,
                  }}
                >
                  <option value="all">All Modules</option>
                  {modulesInDay.map(mod => (
                    <option key={mod} value={mod}>
                      {MODULE_LABELS[mod] || mod}
                    </option>
                  ))}
                </select>
              );
            })()}

            {teamMembers.length >= 2 && (
              <select
                value={teamFilter}
                onChange={e => setTeamFilter(e.target.value)}
                style={{
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                  padding: '8px 16px', fontSize: FONT.sizeBase, cursor: 'pointer', outline: 'none',
                  appearance: 'auto' as const,
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

            <div style={{ flex: 1 }} />

            <div style={{ fontSize: FONT.sizeBase, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
              {displayDate}
            </div>
          </>
        )}
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
