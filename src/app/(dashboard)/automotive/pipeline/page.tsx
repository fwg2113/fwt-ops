'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Lead {
  id: number;
  token: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  services: Array<{ label?: string; film_name?: string; price?: number }>;
  total_price: number;
  charge_deposit: boolean;
  deposit_amount: number;
  send_method: string;
  status: string;
  link_opened_at: string | null;
  booked_at: string | null;
  created_at: string;
}

const STATUS_VARIANTS: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  sent: 'info',
  opened: 'warning',
  booked: 'success',
  expired: 'neutral',
};

export default function LeadPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchLeads = useCallback(() => {
    setLoading(true);
    fetch('/api/auto/leads')
      .then(r => r.json())
      .then(data => setLeads(data.leads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function formatPhone(phone: string | null): string {
    if (!phone) return '--';
    const d = phone.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
  }

  function formatDate(date: string | null): string {
    if (!date) return '--';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function handleCopyLink(token: string) {
    const url = `${window.location.origin}/book/lead/${token}`;
    await navigator.clipboard.writeText(url);
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter);

  // Stats
  const totalSent = leads.length;
  const totalOpened = leads.filter(l => l.link_opened_at).length;
  const totalBooked = leads.filter(l => l.status === 'booked').length;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const conversionRate = totalSent > 0 ? Math.round((totalBooked / totalSent) * 100) : 0;
  const pendingValue = leads
    .filter(l => l.status === 'sent' || l.status === 'opened')
    .reduce((s, l) => s + Number(l.total_price), 0);

  return (
    <div>
      <PageHeader
        title="Lead"
        titleAccent="Pipeline"
        subtitle="Automotive -- Track sent booking links and conversions"
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: 'wrap' }}>
        <StatBox label="Total Sent" value={String(totalSent)} />
        <StatBox label="Opened" value={`${totalOpened} (${openRate}%)`} color="#f59e0b" />
        <StatBox label="Booked" value={`${totalBooked} (${conversionRate}%)`} color={COLORS.success} />
        <StatBox label="Pending Value" value={`$${pendingValue.toLocaleString()}`} color={COLORS.red} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg }}>
        {['all', 'sent', 'opened', 'booked', 'expired'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: `${SPACING.xs}px ${SPACING.md}px`,
              borderRadius: RADIUS.md,
              border: `1px solid ${filter === f ? COLORS.red : COLORS.borderInput}`,
              background: filter === f ? COLORS.activeBg : 'transparent',
              color: filter === f ? COLORS.red : COLORS.textMuted,
              cursor: 'pointer',
              fontSize: FONT.sizeSm,
              fontWeight: FONT.weightSemibold,
              textTransform: 'capitalize',
            }}
          >
            {f} {f !== 'all' ? `(${leads.filter(l => l.status === f).length})` : `(${leads.length})`}
          </button>
        ))}
      </div>

      {/* Leads list */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>Loading leads...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>
            {filter === 'all' ? 'No leads yet. Send a booking link from Quick Tint Quote.' : `No ${filter} leads.`}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Vehicle</th>
                <th style={thStyle}>Services</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle}>Opened</th>
                <th style={thStyle}>Booked</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id}>
                  <td style={tdStyle}>
                    <StatusBadge label={lead.status} variant={STATUS_VARIANTS[lead.status] || 'neutral'} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: FONT.weightMedium, color: COLORS.textPrimary }}>
                      {lead.customer_name || 'Anonymous'}
                    </div>
                    {lead.customer_phone && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatPhone(lead.customer_phone)}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: FONT.weightMedium, color: COLORS.textPrimary }}>
                    {lead.vehicle_year} {lead.vehicle_make} {lead.vehicle_model}
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: FONT.sizeXs, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Array.isArray(lead.services) ? lead.services.map(s => s.label || '').join(', ') : '--'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                    ${Number(lead.total_price).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {timeAgo(lead.created_at)}
                  </td>
                  <td style={{ ...tdStyle, fontSize: FONT.sizeXs, color: lead.link_opened_at ? '#f59e0b' : COLORS.textMuted }}>
                    {lead.link_opened_at ? formatDate(lead.link_opened_at) : '--'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: FONT.sizeXs, color: lead.booked_at ? COLORS.success : COLORS.textMuted }}>
                    {lead.booked_at ? formatDate(lead.booked_at) : '--'}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleCopyLink(lead.token)}
                      title="Copy booking link"
                      style={{
                        background: 'none', border: `1px solid ${COLORS.borderInput}`,
                        borderRadius: RADIUS.sm, padding: '3px 8px', cursor: 'pointer',
                        color: COLORS.textMuted, fontSize: FONT.sizeXs,
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardCard>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 130, padding: SPACING.md,
      background: COLORS.cardBg, borderRadius: RADIUS.sm,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
  color: COLORS.textMuted, textTransform: 'uppercase',
  letterSpacing: '0.5px', textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
};

const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm, color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
};
