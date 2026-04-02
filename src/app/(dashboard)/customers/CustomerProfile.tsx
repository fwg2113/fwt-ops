'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DashboardCard, Button, FormField, TextInput, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface CustomerData {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  company_name: string | null;
  notes: string | null;
  lifetime_spend: number;
  visit_count: number;
  first_visit_date: string | null;
  last_visit_date: string | null;
}

interface Vehicle {
  id: number;
  vehicle_year: number | null;
  vehicle_make: string;
  vehicle_model: string;
  first_seen: string | null;
  last_seen: string | null;
  job_count: number;
}

interface Job {
  id: number;
  job_date: string;
  vehicle_desc: string | null;
  services_summary: string | null;
  film_type: string | null;
  shade_front: string | null;
  shade_rear: string | null;
  appointment_type: string | null;
  full_service: string | null;
  two_fd: string | null;
  windshield: string | null;
  sun_strip: string | null;
  sun_roof: string | null;
  removal: string | null;
  total: number;
  payment_method: string | null;
  invoice_num: string | null;
  discount: number;
  discount_note: string | null;
  tip: number;
  nfw_amount: number;
  source: string | null;
}

interface Booking {
  id: string;
  booking_id: string;
  appointment_date: string;
  appointment_time: string | null;
  appointment_type: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  services_json: unknown;
  subtotal: number;
  balance_due: number;
  status: string;
}

interface DocRecord {
  id: string;
  doc_number: string;
  doc_type: string;
  status: string;
  subtotal: number;
  balance_due: number;
  created_at: string;
}

interface Props {
  customerId: string;
  onBack: () => void;
}

export default function CustomerProfile({ customerId, onBack }: Props) {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    fetch(`/api/customers/${customerId}`)
      .then(r => r.json())
      .then(data => {
        setCustomer(data.customer);
        setVehicles(data.vehicles || []);
        setJobs(data.jobs || []);
        setBookings(data.bookings || []);
        setDocuments(data.documents || []);

        // Init edit fields
        if (data.customer) {
          setEditFirst(data.customer.first_name || '');
          setEditLast(data.customer.last_name || '');
          setEditPhone(data.customer.phone || '');
          setEditEmail(data.customer.email || '');
          setEditCompany(data.customer.company_name || '');
          setEditNotes(data.customer.notes || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customerId,
          first_name: editFirst,
          last_name: editLast,
          phone: editPhone,
          email: editEmail,
          company_name: editCompany,
          notes: editNotes,
        }),
      });
      setCustomer(prev => prev ? {
        ...prev,
        first_name: editFirst, last_name: editLast,
        phone: editPhone.replace(/\D/g, ''), email: editEmail,
        company_name: editCompany, notes: editNotes,
      } : null);
      setEditing(false);
    } catch { /* silent */ }
    setSaving(false);
  }

  function formatPhone(phone: string | null): string {
    if (!phone) return '--';
    const d = phone.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
  }

  function formatDate(date: string | null): string {
    if (!date) return '--';
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildServicesList(job: Job): string[] {
    const parts: string[] = [];
    // If we have film_type + shade fields (granular import), show those
    if (job.film_type) {
      let filmStr = job.film_type;
      if (job.shade_front) filmStr += ` ${job.shade_front}`;
      if (job.shade_rear) filmStr += `/${job.shade_rear}`;
      parts.push(filmStr);
    }
    // Service-specific fields (legacy FWT import format)
    if (job.full_service) parts.push(`Full: ${job.full_service}`);
    if (job.two_fd) parts.push(`2FD: ${job.two_fd}`);
    if (job.windshield) parts.push(`WS: ${job.windshield}`);
    if (job.sun_strip) parts.push(`TS: ${job.sun_strip}`);
    if (job.sun_roof) parts.push(`SR: ${job.sun_roof}`);
    if (job.removal) parts.push(`Removal: ${job.removal}`);
    return parts;
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Customer" titleAccent="Profile" subtitle="Loading..." />
        <div style={{ padding: SPACING.xxl, color: COLORS.textMuted, textAlign: 'center' }}>Loading customer data...</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div>
        <PageHeader title="Customer" titleAccent="Profile" subtitle="Not found" />
        <Button variant="secondary" onClick={onBack}>Back to Customers</Button>
      </div>
    );
  }

  const totalJobHistory = jobs.length + bookings.length;

  return (
    <div>
      <PageHeader
        title={`${customer.first_name} ${customer.last_name}`}
        subtitle="Customer Profile"
        actions={
          <div style={{ display: 'flex', gap: SPACING.sm }}>
            <Button variant="danger" onClick={async () => {
              if (!confirm(`Delete ${customer.first_name} ${customer.last_name}? This removes all their vehicles and job history.`)) return;
              await fetch(`/api/customers?id=${customerId}`, { method: 'DELETE' });
              onBack();
            }}>
              Delete
            </Button>
            <Button variant="secondary" onClick={onBack}>
              Back to Customers
            </Button>
          </div>
        }
      />

      {/* Top stats row */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: 'wrap' }}>
        <StatBox label="Lifetime Spend" value={`$${Number(customer.lifetime_spend || 0).toLocaleString()}`} color={COLORS.success} />
        <StatBox label="Total Visits" value={String(customer.visit_count || 0)} />
        <StatBox label="Avg Ticket" value={customer.visit_count > 0 ? `$${Math.round(Number(customer.lifetime_spend || 0) / customer.visit_count)}` : '--'} />
        <StatBox label="First Visit" value={formatDate(customer.first_visit_date)} />
        <StatBox label="Last Visit" value={formatDate(customer.last_visit_date)} />
        <StatBox label="Vehicles" value={String(vehicles.length)} />
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: SPACING.lg }}>

        {/* Left column: contact info + vehicles */}
        <div>
          {/* Contact Info */}
          <DashboardCard
            title="Contact Info"
            actions={
              <button onClick={() => setEditing(!editing)} style={{
                background: editing ? COLORS.activeBg : 'transparent',
                color: editing ? COLORS.red : COLORS.textMuted,
                border: `1px solid ${editing ? COLORS.red : COLORS.borderInput}`,
                borderRadius: RADIUS.sm, padding: '3px 10px', cursor: 'pointer',
                fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
              }}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
            }
          >
            {editing ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm }}>
                  <FormField label="First Name">
                    <TextInput value={editFirst} onChange={e => setEditFirst(e.target.value)} />
                  </FormField>
                  <FormField label="Last Name">
                    <TextInput value={editLast} onChange={e => setEditLast(e.target.value)} />
                  </FormField>
                </div>
                <FormField label="Phone">
                  <TextInput value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                </FormField>
                <FormField label="Email">
                  <TextInput value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </FormField>
                <FormField label="Company">
                  <TextInput value={editCompany} onChange={e => setEditCompany(e.target.value)} />
                </FormField>
                <FormField label="Notes">
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                      color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                      borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                      resize: 'vertical', outline: 'none',
                    }}
                  />
                </FormField>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                <InfoRow label="Phone" value={formatPhone(customer.phone)} />
                <InfoRow label="Email" value={customer.email || '--'} />
                {customer.company_name && <InfoRow label="Company" value={customer.company_name} />}
                {customer.notes && (
                  <div style={{ marginTop: SPACING.sm, padding: SPACING.sm, background: COLORS.inputBg, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                    {customer.notes}
                  </div>
                )}
              </div>
            )}
          </DashboardCard>

          {/* Vehicles */}
          <div style={{ marginTop: SPACING.lg }}>
            <DashboardCard title={`Vehicles (${vehicles.length})`}>
              {vehicles.length === 0 ? (
                <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>No vehicles on record</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                  {vehicles.map(v => (
                    <div key={v.id} style={{
                      padding: SPACING.md, background: COLORS.inputBg,
                      borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                        {v.vehicle_year} {v.vehicle_make} {v.vehicle_model}
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                        {v.job_count} job{v.job_count !== 1 ? 's' : ''}
                        {v.last_seen ? ` -- last seen ${formatDate(v.last_seen)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>
        </div>

        {/* Right column: job history timeline */}
        <div>
          <DashboardCard title={`Job History (${totalJobHistory})`} noPadding>
            {totalJobHistory === 0 ? (
              <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>
                No job history yet
              </div>
            ) : (
              <div>
                {/* Live bookings from the system */}
                {bookings.map(b => {
                  const services = Array.isArray(b.services_json)
                    ? (b.services_json as Array<{ label?: string; filmName?: string; shade?: string }>)
                      .map(s => [s.label, s.filmName, s.shade].filter(Boolean).join(' '))
                      .join(' | ')
                    : '';
                  return (
                    <div key={`b-${b.id}`} style={{
                      padding: `${SPACING.md}px ${SPACING.lg}px`,
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                              {formatDate(b.appointment_date)}
                            </span>
                            <StatusBadge label={b.status} variant={b.status === 'booked' ? 'info' : b.status === 'completed' || b.status === 'invoiced' ? 'success' : 'neutral'} />
                            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {b.booking_id}
                            </span>
                          </div>
                          <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginTop: 2 }}>
                            {b.vehicle_year} {b.vehicle_make} {b.vehicle_model}
                          </div>
                          {services && (
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                              {services}
                            </div>
                          )}
                        </div>
                        <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontSize: FONT.sizeBase }}>
                          ${Number(b.subtotal || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Imported job history */}
                {jobs.map(j => {
                  const svcParts = buildServicesList(j);
                  return (
                    <div key={`j-${j.id}`} style={{
                      padding: `${SPACING.md}px ${SPACING.lg}px`,
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                              {formatDate(j.job_date)}
                            </span>
                            {j.invoice_num && (
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                                {j.invoice_num}
                              </span>
                            )}
                            {j.source && (
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textTertiary }}>
                                {j.source}
                              </span>
                            )}
                          </div>
                          {j.vehicle_desc && (
                            <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginTop: 2 }}>
                              {j.vehicle_desc}
                            </div>
                          )}
                          {svcParts.length > 0 && (
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                              {svcParts.join(' | ')}
                            </div>
                          )}
                          {j.discount_note && (
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow, marginTop: 2 }}>
                              {j.discount_note}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontSize: FONT.sizeBase }}>
                            ${Number(j.total || 0).toLocaleString()}
                          </div>
                          {j.payment_method && (
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {j.payment_method}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: SPACING.md,
      background: COLORS.cardBg, borderRadius: RADIUS.sm,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightMedium }}>{value}</span>
    </div>
  );
}
