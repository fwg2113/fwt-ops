'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Vehicle {
  id: number;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  job_count: number;
  last_seen: string | null;
}

interface Job {
  id: number;
  job_date: string | null;
  vehicle_desc: string | null;
  services_summary: string | null;
  total: number | null;
  deposit: number | null;
  balance_due: number | null;
  payment_method: string | null;
  gc_code: string | null;
  notes: string | null;
  invoice_num: string | null;
}

interface BookingService {
  label?: string;
  filmName?: string;
  shade?: string;
  shadeFront?: string;
  shadeRear?: string;
  price?: number;
  serviceKey?: string;
  module?: string;
  [key: string]: unknown;
}

interface Booking {
  id: string;
  appointment_date: string | null;
  appointment_time: string | null;
  appointment_type: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  services_json: BookingService[];
  subtotal: number;
  deposit_paid: number;
  balance_due: number;
  discount_code: string | null;
  status: string;
  module: string;
}

const APPT_TYPE_LABELS: Record<string, string> = {
  dropoff: 'Drop-Off',
  waiting: 'Waiting',
  headsup_30: '30m Heads-Up',
  headsup_60: '60m Heads-Up',
};

interface CustomerResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  visit_count: number;
  lifetime_spend: number;
  last_visit_date: string | null;
  vehicles: Vehicle[];
  jobs: Job[];
  bookings: Booking[];
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function formatDate(date: string | null): string {
  if (!date) return '';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return date; }
}

export default function CustomerLookupPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    const digits = q.replace(/\D/g, '');
    if (digits.length < 3) { setResults([]); setSearched(false); return; }

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/customers/lookup?q=${digits}`);
      const data = await res.json();
      setResults(data.customers || []);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }

  return (
    <div>
      <PageHeader title="Customer" titleAccent="Lookup" subtitle="Search by phone number" />

      {/* Search Box */}
      <div style={{ marginBottom: SPACING.lg }}>
        <div style={{
          position: 'relative', maxWidth: isMobile ? '100%' : 400,
        }}>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder="Enter last 4 digits of phone number..."
            autoFocus
            style={{
              width: '100%', padding: '14px 16px 14px 44px',
              background: COLORS.inputBg, color: COLORS.textPrimary,
              border: `2px solid ${query.length >= 3 ? COLORS.red : COLORS.borderInput}`,
              borderRadius: RADIUS.lg, fontSize: '1.1rem',
              fontFamily: 'monospace', letterSpacing: '2px',
              outline: 'none', transition: 'border-color 0.15s',
            }}
          />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, padding: SPACING.lg }}>Searching...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <DashboardCard>
          <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted }}>
            No customers found matching "{query}"
          </div>
        </DashboardCard>
      )}

      {!loading && results.map(customer => (
        <div key={customer.id} style={{ marginBottom: SPACING.lg, cursor: 'pointer' }} onClick={() => setSelectedCustomer(customer)}>
          <DashboardCard>
            {/* Customer Header */}
            <div style={{
              display: 'flex', flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center',
              gap: SPACING.sm, marginBottom: SPACING.md,
              paddingBottom: SPACING.md, borderBottom: `1px solid ${COLORS.border}`,
            }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>
                  {customer.first_name} {customer.last_name}
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, display: 'flex', gap: SPACING.md, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ fontFamily: 'monospace' }}>{formatPhone(customer.phone)}</span>
                  {customer.email && <span>{customer.email}</span>}
                  {customer.company_name && <span>{customer.company_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: SPACING.lg, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                <span>{customer.visit_count || 0} visit{customer.visit_count !== 1 ? 's' : ''}</span>
                <span>${(customer.lifetime_spend || 0).toLocaleString()}</span>
                {customer.last_visit_date && <span>Last: {formatDate(customer.last_visit_date)}</span>}
              </div>
            </div>

            {/* Vehicles */}
            {customer.vehicles.length > 0 && (
              <div style={{ marginBottom: SPACING.md }}>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.xs }}>Vehicles</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {customer.vehicles.map(v => (
                    <span key={v.id} style={{
                      padding: '4px 10px', borderRadius: 16,
                      background: COLORS.hoverBg, border: `1px solid ${COLORS.border}`,
                      fontSize: FONT.sizeXs, color: COLORS.textPrimary, fontWeight: 600,
                    }}>
                      {[v.vehicle_year, v.vehicle_make, v.vehicle_model].filter(Boolean).join(' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Past Appointments (from bookings) */}
            {customer.bookings.length > 0 && (
              <div style={{ marginBottom: SPACING.md }}>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.xs }}>Appointments</div>
                {customer.bookings.map(b => {
                  const vehicle = [b.vehicle_year, b.vehicle_make, b.vehicle_model].filter(Boolean).join(' ');
                  const apptTypeLabel = APPT_TYPE_LABELS[b.appointment_type || ''] || b.appointment_type || '';
                  return (
                    <div key={b.id} style={{
                      padding: `${SPACING.md}px`, marginBottom: 6,
                      background: COLORS.inputBg, borderRadius: RADIUS.md,
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      {/* Row 1: Vehicle + Date + Status + Price */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>{vehicle}</span>
                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatDate(b.appointment_date)}</span>
                          {apptTypeLabel && (
                            <span style={{
                              fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                              background: '#f0f9ff', color: '#0369a1',
                            }}>
                              {apptTypeLabel}
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                            background: b.status === 'booked' ? '#dbeafe' : ['completed', 'paid', 'invoiced'].includes(b.status) ? '#dcfce7' : b.status === 'cancelled' ? '#fee2e2' : COLORS.hoverBg,
                            color: b.status === 'booked' ? '#1d4ed8' : ['completed', 'paid', 'invoiced'].includes(b.status) ? '#15803d' : b.status === 'cancelled' ? '#991b1b' : COLORS.textMuted,
                          }}>
                            {b.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.textPrimary }}>${Number(b.subtotal).toLocaleString()}</span>
                      </div>

                      {/* Row 2: Services with full detail */}
                      {Array.isArray(b.services_json) && b.services_json.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {b.services_json.map((svc, i) => {
                            const shadeDisplay = svc.shadeFront && svc.shadeRear
                              ? `Front: ${svc.shadeFront} / Rear: ${svc.shadeRear}`
                              : svc.shadeFront
                              ? svc.shadeFront
                              : svc.shadeRear
                              ? svc.shadeRear
                              : svc.shade || '';
                            return (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                                fontSize: FONT.sizeXs, padding: '2px 0',
                              }}>
                                <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>{svc.label || svc.serviceKey || 'Service'}</span>
                                {svc.filmName && (
                                  <span style={{ color: '#2563eb', fontWeight: 500 }}>{svc.filmName}</span>
                                )}
                                {shadeDisplay && (
                                  <span style={{ color: COLORS.textMuted }}>({shadeDisplay})</span>
                                )}
                                {svc.price != null && (
                                  <span style={{ color: COLORS.textMuted, marginLeft: 'auto' }}>${svc.price}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Row 3: GC code, deposit, balance if relevant */}
                      {(b.discount_code || b.deposit_paid > 0) && (
                        <div style={{ marginTop: 6, display: 'flex', gap: SPACING.md, fontSize: FONT.sizeXs, color: COLORS.textMuted, flexWrap: 'wrap' }}>
                          {b.discount_code && <span style={{ color: '#7c3aed', fontWeight: 600 }}>GC: {b.discount_code}</span>}
                          {b.deposit_paid > 0 && <span>Deposit: ${b.deposit_paid}</span>}
                          {b.balance_due > 0 && <span>Balance: ${b.balance_due}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past Jobs (imported history) */}
            {customer.jobs.length > 0 && (
              <div>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.xs }}>
                  Job History {customer.bookings.length > 0 ? '(Imported)' : ''}
                </div>
                {customer.jobs.map(j => (
                  <div key={j.id} style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, marginBottom: 4,
                    background: COLORS.inputBg, borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>{j.vehicle_desc || 'N/A'}</span>
                        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: 8 }}>{formatDate(j.job_date)}</span>
                      </div>
                      <span style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>
                        ${j.total || 0}
                      </span>
                    </div>
                    {j.services_summary && (
                      <div style={{ marginTop: 4, fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>
                        {j.services_summary}
                      </div>
                    )}
                    {(j.gc_code || j.payment_method || j.notes) && (
                      <div style={{ marginTop: 4, fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
                        {j.payment_method && <span>Paid: {j.payment_method}</span>}
                        {j.gc_code && <span>GC: {j.gc_code}</span>}
                        {j.invoice_num && <span>Inv: {j.invoice_num}</span>}
                        {j.notes && <span>{j.notes}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No history */}
            {customer.bookings.length === 0 && customer.jobs.length === 0 && (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontStyle: 'italic' }}>
                No appointment history found.
              </div>
            )}
          </DashboardCard>
        </div>
      ))}

      {/* Customer Profile Modal */}
      {selectedCustomer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: isMobile ? 12 : 24,
        }} onClick={() => setSelectedCustomer(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg,
            width: isMobile ? '100%' : 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: `${SPACING.lg}px ${SPACING.xl}px`, borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, background: COLORS.pageBg, borderRadius: `${RADIUS.lg}px ${RADIUS.lg}px 0 0`, zIndex: 1,
            }}>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: COLORS.textPrimary }}>
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontFamily: 'monospace' }}>
                  {formatPhone(selectedCustomer.phone)}
                  {selectedCustomer.email && ` | ${selectedCustomer.email}`}
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Action Buttons */}
            <div style={{
              padding: `${SPACING.md}px ${SPACING.xl}px`, borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', gap: SPACING.sm, flexWrap: 'wrap',
            }}>
              <Button variant="primary" size="sm" onClick={() => {
                const params = new URLSearchParams({
                  flqa: '1',
                  customer_name: `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim(),
                  customer_phone: selectedCustomer.phone || '',
                  customer_email: selectedCustomer.email || '',
                });
                router.push(`/quotes?${params}`);
                setSelectedCustomer(null);
              }}>
                FLQA
              </Button>
              <Button size="sm" onClick={() => {
                const params = new URLSearchParams({
                  new: '1',
                  customer_name: `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim(),
                  customer_phone: selectedCustomer.phone || '',
                  customer_email: selectedCustomer.email || '',
                });
                router.push(`/quotes?${params}`);
                setSelectedCustomer(null);
              }} style={{ background: '#2563eb', borderColor: '#2563eb', color: '#fff' }}>
                New Quote
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                router.push(`/customers?search=${selectedCustomer.phone?.slice(-4) || ''}`);
                setSelectedCustomer(null);
              }}>
                Full Profile
              </Button>
            </div>

            {/* Stats Bar */}
            <div style={{
              padding: `${SPACING.md}px ${SPACING.xl}px`, borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', gap: SPACING.xl, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Visits</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>{selectedCustomer.visit_count || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Lifetime Spend</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>${(selectedCustomer.lifetime_spend || 0).toLocaleString()}</div>
              </div>
              {selectedCustomer.last_visit_date && (
                <div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Last Visit</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>{formatDate(selectedCustomer.last_visit_date)}</div>
                </div>
              )}
              {selectedCustomer.company_name && (
                <div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Company</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COLORS.textPrimary }}>{selectedCustomer.company_name}</div>
                </div>
              )}
            </div>

            {/* Vehicles */}
            {selectedCustomer.vehicles.length > 0 && (
              <div style={{ padding: `${SPACING.md}px ${SPACING.xl}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.xs }}>Vehicles</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedCustomer.vehicles.map(v => (
                    <span key={v.id} style={{
                      padding: '5px 12px', borderRadius: 16,
                      background: COLORS.hoverBg, border: `1px solid ${COLORS.border}`,
                      fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: 600,
                    }}>
                      {[v.vehicle_year, v.vehicle_make, v.vehicle_model].filter(Boolean).join(' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Full Appointment History */}
            <div style={{ padding: `${SPACING.md}px ${SPACING.xl}px` }}>
              {selectedCustomer.bookings.length > 0 && (
                <div style={{ marginBottom: SPACING.md }}>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.xs }}>Appointments</div>
                  {selectedCustomer.bookings.map(b => {
                    const vehicle = [b.vehicle_year, b.vehicle_make, b.vehicle_model].filter(Boolean).join(' ');
                    const apptTypeLabel = APPT_TYPE_LABELS[b.appointment_type || ''] || b.appointment_type || '';
                    return (
                      <div key={b.id} style={{
                        padding: `${SPACING.md}px`, marginBottom: 6,
                        background: COLORS.inputBg, borderRadius: RADIUS.md,
                        border: `1px solid ${COLORS.border}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>{vehicle}</span>
                            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatDate(b.appointment_date)}</span>
                            {apptTypeLabel && (
                              <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#f0f9ff', color: '#0369a1' }}>{apptTypeLabel}</span>
                            )}
                          </div>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.textPrimary }}>${Number(b.subtotal).toLocaleString()}</span>
                        </div>
                        {Array.isArray(b.services_json) && b.services_json.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {b.services_json.map((svc: BookingService, i: number) => {
                              const shadeDisplay = svc.shadeFront && svc.shadeRear
                                ? `Front: ${svc.shadeFront} / Rear: ${svc.shadeRear}`
                                : svc.shadeFront || svc.shadeRear || svc.shade || '';
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: FONT.sizeXs, padding: '2px 0' }}>
                                  <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>{svc.label || svc.serviceKey || 'Service'}</span>
                                  {svc.filmName && <span style={{ color: '#2563eb', fontWeight: 500 }}>{svc.filmName}</span>}
                                  {shadeDisplay && <span style={{ color: COLORS.textMuted }}>({shadeDisplay})</span>}
                                  {svc.price != null && <span style={{ color: COLORS.textMuted, marginLeft: 'auto' }}>${svc.price}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(b.discount_code || b.deposit_paid > 0) && (
                          <div style={{ marginTop: 6, display: 'flex', gap: SPACING.md, fontSize: FONT.sizeXs, color: COLORS.textMuted, flexWrap: 'wrap' }}>
                            {b.discount_code && <span style={{ color: '#7c3aed', fontWeight: 600 }}>GC: {b.discount_code}</span>}
                            {b.deposit_paid > 0 && <span>Deposit: ${b.deposit_paid}</span>}
                            {b.balance_due > 0 && <span>Balance: ${b.balance_due}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedCustomer.jobs.length > 0 && (
                <div>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
                    Job History {selectedCustomer.bookings.length > 0 ? '(Imported)' : ''}
                  </div>
                  {selectedCustomer.jobs.map(j => (
                    <div key={j.id} style={{
                      padding: `${SPACING.sm}px ${SPACING.md}px`, marginBottom: 4,
                      background: COLORS.inputBg, borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>{j.vehicle_desc || 'N/A'}</span>
                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: 8 }}>{formatDate(j.job_date)}</span>
                        </div>
                        <span style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>${j.total || 0}</span>
                      </div>
                      {j.services_summary && (
                        <div style={{ marginTop: 4, fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>{j.services_summary}</div>
                      )}
                      {(j.gc_code || j.payment_method || j.notes) && (
                        <div style={{ marginTop: 4, fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
                          {j.payment_method && <span>Paid: {j.payment_method}</span>}
                          {j.gc_code && <span style={{ color: '#7c3aed' }}>GC: {j.gc_code}</span>}
                          {j.invoice_num && <span>Inv: {j.invoice_num}</span>}
                          {j.notes && <span>{j.notes}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedCustomer.bookings.length === 0 && selectedCustomer.jobs.length === 0 && (
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, fontStyle: 'italic', padding: SPACING.md }}>
                  No appointment history found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
