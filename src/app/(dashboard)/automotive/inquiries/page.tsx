'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DashboardCard, DataTable, StatusBadge, Button, Modal } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

interface Inquiry {
  id: string;
  booking_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export default function InquiriesPage() {
  const isMobile = useIsMobile();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  useEffect(() => {
    fetch('/api/auto/inquiries')
      .then(r => r.json())
      .then(d => { setInquiries(d.inquiries || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string) {
    try {
      await fetch('/api/auto/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, status } : inq));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    } catch { /* silent */ }
  }

  function formatPhone(phone: string | null): string {
    if (!phone) return '—';
    const d = phone.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
  }

  const pending = inquiries.filter(i => i.status === 'booked');
  const resolved = inquiries.filter(i => i.status !== 'booked');

  const columns = [
    {
      key: 'date', label: 'Date', width: 100,
      render: (inq: Inquiry) => (
        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
          {new Date(inq.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'vehicle', label: 'Vehicle',
      render: (inq: Inquiry) => (
        <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
          {inq.vehicle_year} {inq.vehicle_make} {inq.vehicle_model}
        </span>
      ),
    },
    {
      key: 'customer', label: 'Customer', width: 160,
      render: (inq: Inquiry) => (
        <div>
          <div style={{ color: COLORS.textSecondary, fontSize: FONT.sizeSm }}>{inq.customer_name}</div>
          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>{formatPhone(inq.customer_phone)}</div>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status', width: 100,
      render: (inq: Inquiry) => {
        const v = inq.status === 'booked' ? 'warning' as const
          : inq.status === 'completed' ? 'success' as const
          : inq.status === 'cancelled' ? 'danger' as const
          : 'neutral' as const;
        const label = inq.status === 'booked' ? 'Pending'
          : inq.status === 'completed' ? 'Resolved'
          : inq.status;
        return <StatusBadge label={label} variant={v} />;
      },
    },
    {
      key: 'actions', label: '', width: 80, align: 'right' as const,
      render: (inq: Inquiry) => (
        <button onClick={e => { e.stopPropagation(); setSelected(inq); }} style={{
          background: 'rgba(255,255,255,0.06)', color: COLORS.textMuted,
          border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
        }}>
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Inquiries" subtitle="Automotive - Vehicle Inquiries" />

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: SPACING.md,
        marginBottom: SPACING.xl,
      }}>
        <QuickStat label="Total" value={inquiries.length} color={COLORS.textPrimary} />
        <QuickStat label="Pending" value={pending.length} color="#f59e0b" />
        <QuickStat label="Resolved" value={resolved.length} color="#22c55e" />
      </div>

      {/* Pending Inquiries */}
      {pending.length > 0 && (
        <div style={{ marginBottom: SPACING.xl }}>
          <DashboardCard title={`Pending (${pending.length})`} noPadding
            icon={<svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
          >
            {isMobile ? (
              <MobileInquiryList items={pending} onSelect={setSelected} formatPhone={formatPhone} />
            ) : (
              <DataTable columns={columns} data={pending} rowKey={inq => inq.id} onRowClick={setSelected} compact />
            )}
          </DashboardCard>
        </div>
      )}

      {/* All Inquiries */}
      <DashboardCard title="All Inquiries" noPadding
        icon={<svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>}
      >
        {loading ? (
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        ) : isMobile ? (
          inquiries.length === 0 ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>No vehicle inquiries yet.</div>
          ) : (
            <MobileInquiryList items={inquiries} onSelect={setSelected} formatPhone={formatPhone} />
          )
        ) : (
          <DataTable columns={columns} data={inquiries} rowKey={inq => inq.id} onRowClick={setSelected}
            emptyMessage="No vehicle inquiries yet." compact />
        )}
      </DashboardCard>

      {/* Detail Modal */}
      {selected && (
        <Modal title="Vehicle Inquiry" onClose={() => setSelected(null)} width={460}
          footer={
            <div style={{ display: 'flex', gap: SPACING.sm, width: '100%' }}>
              {selected.status === 'booked' && (
                <>
                  <Button variant="primary" size="sm" onClick={() => updateStatus(selected.id, 'completed')}>
                    Mark Resolved
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => updateStatus(selected.id, 'cancelled')}>
                    Dismiss
                  </Button>
                </>
              )}
              {selected.status !== 'booked' && (
                <Button variant="secondary" size="sm" onClick={() => updateStatus(selected.id, 'booked')}>
                  Reopen
                </Button>
              )}
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          }
        >
          <div style={{ display: 'grid', gap: SPACING.md }}>
            <InfoBlock label="Vehicle" value={`${selected.vehicle_year} ${selected.vehicle_make} ${selected.vehicle_model}`} />
            <InfoBlock label="Customer" value={selected.customer_name} />
            <InfoBlock label="Phone" value={formatPhone(selected.customer_phone)} />
            {selected.customer_email && <InfoBlock label="Email" value={selected.customer_email} />}
            <InfoBlock label="Submitted" value={new Date(selected.created_at).toLocaleString()} />
            <InfoBlock label="Booking ID" value={selected.booking_id} />
            {selected.notes && (
              <div>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
                <div style={{
                  fontSize: FONT.sizeSm, color: COLORS.textSecondary, lineHeight: 1.5,
                  padding: SPACING.md, background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`, whiteSpace: 'pre-wrap',
                }}>
                  {selected.notes}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: FONT.sizeBase, color: COLORS.textPrimary }}>{value}</div>
    </div>
  );
}

function MobileInquiryList({ items, onSelect, formatPhone }: { items: Inquiry[]; onSelect: (inq: Inquiry) => void; formatPhone: (p: string | null) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((inq, idx) => {
        const v = inq.status === 'booked' ? 'warning' as const
          : inq.status === 'completed' ? 'success' as const
          : inq.status === 'cancelled' ? 'danger' as const
          : 'neutral' as const;
        const statusLabel = inq.status === 'booked' ? 'Pending'
          : inq.status === 'completed' ? 'Resolved'
          : inq.status;
        return (
          <div key={inq.id} onClick={() => onSelect(inq)} style={{
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            borderBottom: idx < items.length - 1 ? `1px solid ${COLORS.border}` : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <StatusBadge label={statusLabel} variant={v} />
                <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                  {inq.vehicle_year} {inq.vehicle_make} {inq.vehicle_model}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>{inq.customer_name}</span>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatPhone(inq.customer_phone)}</span>
            </div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
              {new Date(inq.created_at).toLocaleDateString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: COLORS.cardBg, border: `1px solid ${COLORS.borderAccent}`,
      borderRadius: RADIUS.xl, padding: `${SPACING.md}px ${SPACING.lg}px`,
      display: 'flex', alignItems: 'center', gap: SPACING.sm,
    }}>
      <span style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color }}>{value}</span>
      <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}
