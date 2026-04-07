'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, StatusBadge, Modal, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Lead {
  id: number;
  token: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  services: Array<{ label?: string; film_name?: string; price?: number; shade_front?: string; shade_rear?: string }>;
  total_price: number;
  charge_deposit: boolean;
  deposit_amount: number;
  send_method: string;
  status: string;
  link_opened_at: string | null;
  booked_at: string | null;
  created_at: string;
  followup_count: number;
  last_followup_at: string | null;
  followup_discount_type: string | null;
  followup_discount_amount: number | null;
  expired_at: string | null;
  options_mode: boolean;
  pre_appointment_type: string | null;
  pre_appointment_date: string | null;
}

interface FollowupSettings {
  followup_enabled: boolean;
  followup_default_discount_type: string;
  followup_default_discount_amount: number;
  followup_auto_enabled: boolean;
  followup_auto_days: number;
  followup_expiry_days: number;
}

const STATUS_VARIANTS: Record<string, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  sent: 'info',
  opened: 'warning',
  booked: 'success',
  expired: 'neutral',
};

export default function LeadPipelinePage() {
  const isMobile = useIsMobile();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [followupSettings, setFollowupSettings] = useState<FollowupSettings | null>(null);

  // Follow-up modal
  const [followupTarget, setFollowupTarget] = useState<Lead | null>(null);
  const [fuDiscountEnabled, setFuDiscountEnabled] = useState(false);
  const [fuDiscountType, setFuDiscountType] = useState<'dollar' | 'percent'>('dollar');
  const [fuDiscountAmount, setFuDiscountAmount] = useState(0);
  const [fuSendSms, setFuSendSms] = useState(true);
  const [fuSendEmail, setFuSendEmail] = useState(true);
  const [fuSending, setFuSending] = useState(false);
  const [fuResult, setFuResult] = useState<{ sent: boolean; url: string } | null>(null);
  const [fuCopied, setFuCopied] = useState(false);

  // Detail modal
  const [detailTarget, setDetailTarget] = useState<Lead | null>(null);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    fetch('/api/auto/leads')
      .then(r => r.json())
      .then(data => {
        setLeads(data.leads || []);
        if (data.followupSettings) setFollowupSettings(data.followupSettings);
      })
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

  function ageDays(date: string): number {
    return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  }

  async function handleCopyLink(token: string) {
    const url = `${window.location.origin}/book/lead/${token}`;
    await navigator.clipboard.writeText(url);
  }

  function openFollowup(lead: Lead) {
    setFollowupTarget(lead);
    setFuResult(null);
    setFuCopied(false);
    // Pre-fill from global defaults
    const hasDefault = followupSettings && followupSettings.followup_default_discount_amount > 0;
    setFuDiscountEnabled(!!hasDefault);
    setFuDiscountType((followupSettings?.followup_default_discount_type as 'dollar' | 'percent') || 'dollar');
    setFuDiscountAmount(followupSettings?.followup_default_discount_amount || 0);
    setFuSendSms(!!lead.customer_phone);
    setFuSendEmail(!!lead.customer_email);
    setFuSending(false);
  }

  async function handleSendFollowup() {
    if (!followupTarget) return;
    setFuSending(true);

    const methods: string[] = [];
    if (fuSendSms && followupTarget.customer_phone) methods.push('sms');
    if (fuSendEmail && followupTarget.customer_email) methods.push('email');
    if (methods.length === 0) methods.push('copy');

    const res = await fetch('/api/auto/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: followupTarget.id,
        action: 'followup',
        send_method: methods,
        discount_type: fuDiscountEnabled ? fuDiscountType : null,
        discount_amount: fuDiscountEnabled ? fuDiscountAmount : null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setFuResult({ sent: data.sent, url: data.booking_url });
      fetchLeads(); // refresh the list
    }
    setFuSending(false);
  }

  async function handleCopyFollowupLink() {
    if (!fuResult?.url) return;
    await navigator.clipboard.writeText(fuResult.url);
    setFuCopied(true);
    setTimeout(() => setFuCopied(false), 2000);
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter);

  // Stats
  const totalSent = leads.length;
  const totalOpened = leads.filter(l => l.link_opened_at).length;
  const totalBooked = leads.filter(l => l.status === 'booked').length;
  const needsFollowup = leads.filter(l => (l.status === 'sent' || l.status === 'opened') && ageDays(l.created_at) >= 1).length;
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
        gap: SPACING.md,
        marginBottom: SPACING.lg,
      }}>
        <StatBox label="Total Sent" value={String(totalSent)} />
        <StatBox label="Opened" value={`${totalOpened} (${openRate}%)`} color="#f59e0b" />
        <StatBox label="Booked" value={`${totalBooked} (${conversionRate}%)`} color={COLORS.success} />
        <StatBox label="Needs Follow-Up" value={String(needsFollowup)} color={needsFollowup > 0 ? COLORS.red : COLORS.textMuted} />
        <StatBox label="Pending Value" value={`$${pendingValue.toLocaleString()}`} color={COLORS.red} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg, flexWrap: 'wrap' }}>
        {['all', 'sent', 'opened', 'booked', 'expired'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: isMobile ? `${SPACING.sm}px ${SPACING.md}px` : `${SPACING.xs}px ${SPACING.md}px`,
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((lead, idx) => {
              const age = ageDays(lead.created_at);
              const isPending = lead.status === 'sent' || lead.status === 'opened';
              const isStale = isPending && age >= 2;
              const vehicle = `${lead.vehicle_year} ${lead.vehicle_make} ${lead.vehicle_model}`;

              return (
                <div key={lead.id} style={{
                  padding: `${SPACING.md}px ${SPACING.lg}px`,
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  background: isStale ? 'rgba(234,179,8,0.03)' : 'transparent',
                }}>
                  {/* Row 1: Status + Customer + Vehicle + Total + Age */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                      <StatusBadge label={lead.status} variant={STATUS_VARIANTS[lead.status] || 'neutral'} />
                      <span style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                        {lead.customer_name || 'Anonymous'}
                      </span>
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatPhone(lead.customer_phone)}</span>
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary, fontWeight: 600 }}>{vehicle}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                      <span style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                        ${Number(lead.total_price).toLocaleString()}
                      </span>
                      <span style={{
                        fontSize: FONT.sizeXs, color: isStale ? '#f59e0b' : COLORS.textMuted,
                        fontWeight: isStale ? 700 : 400,
                      }}>
                        {timeAgo(lead.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Services summary */}
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Array.isArray(lead.services) ? lead.services.map(s => s.label || '').join(', ') : '--'}
                  </div>

                  {/* Row 3: Timeline + Follow-up info + Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: SPACING.md, fontSize: FONT.sizeXs, color: COLORS.textMuted, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>Sent {formatDate(lead.created_at)}</span>
                      {lead.link_opened_at && <span style={{ color: '#f59e0b' }}>Opened {formatDate(lead.link_opened_at)}</span>}
                      {lead.booked_at && <span style={{ color: COLORS.success }}>Booked {formatDate(lead.booked_at)}</span>}
                      {lead.followup_count > 0 && (
                        <span style={{
                          padding: '1px 8px', borderRadius: 10,
                          background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
                          color: '#7c3aed', fontWeight: 600, fontSize: '0.65rem',
                        }}>
                          {lead.followup_count} follow-up{lead.followup_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {lead.followup_discount_type && lead.followup_discount_amount && Number(lead.followup_discount_amount) > 0 && (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>
                          {lead.followup_discount_type === 'dollar' ? `$${lead.followup_discount_amount} off` : `${lead.followup_discount_amount}% off`}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isPending && (
                        <button
                          onClick={() => openFollowup(lead)}
                          style={{
                            padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                            background: COLORS.red, border: 'none',
                            color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                          }}
                        >
                          Follow Up
                        </button>
                      )}
                      <button
                        onClick={() => setDetailTarget(lead)}
                        style={{
                          padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                          background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                          color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600,
                        }}
                      >
                        Details
                      </button>
                      <button
                        onClick={() => handleCopyLink(lead.token)}
                        title="Copy booking link"
                        style={{
                          padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                          background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                          color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600,
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* ================================================================ */}
      {/* FOLLOW-UP MODAL */}
      {/* ================================================================ */}
      {followupTarget && (
        <Modal title="Send Follow-Up" onClose={() => { setFollowupTarget(null); setFuResult(null); }} footer={
          !fuResult ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
              <Button variant="secondary" onClick={() => setFollowupTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleSendFollowup} disabled={fuSending}>
                {fuSending ? 'Sending...' : 'Send Follow-Up'}
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
              <Button variant="primary" onClick={() => { setFollowupTarget(null); setFuResult(null); }}>Done</Button>
            </div>
          )
        }>
          {!fuResult ? (
            <>
              {/* Quote summary */}
              <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
                  {followupTarget.customer_name || 'Anonymous'} -- {followupTarget.vehicle_year} {followupTarget.vehicle_make} {followupTarget.vehicle_model}
                </div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>
                  {Array.isArray(followupTarget.services) ? followupTarget.services.map(s => s.label).join(', ') : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: FONT.sizeLg, color: COLORS.textPrimary }}>${Number(followupTarget.total_price).toLocaleString()}</span>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Sent {timeAgo(followupTarget.created_at)} -- {followupTarget.followup_count} previous follow-up{followupTarget.followup_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Incentive Discount */}
              <div style={{
                padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.lg,
                background: fuDiscountEnabled ? 'rgba(22,163,74,0.05)' : COLORS.inputBg,
                border: `1px solid ${fuDiscountEnabled ? '#86efac' : COLORS.borderInput}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: fuDiscountEnabled ? SPACING.sm : 0 }}>
                  <div>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary }}>Include Incentive</div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      {fuDiscountEnabled ? 'Customer sees a special discount on their booking page' : 'Add a discount to encourage booking'}
                    </div>
                  </div>
                  <button onClick={() => setFuDiscountEnabled(!fuDiscountEnabled)} style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: fuDiscountEnabled ? '#16a34a' : COLORS.border, position: 'relative', transition: 'background 0.2s',
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: fuDiscountEnabled ? 23 : 3, transition: 'left 0.2s' }} />
                  </button>
                </div>
                {fuDiscountEnabled && (
                  <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', marginTop: SPACING.sm }}>
                    <div>
                      <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Type</label>
                      <SelectInput value={fuDiscountType} onChange={e => setFuDiscountType(e.target.value as 'dollar' | 'percent')}>
                        <option value="dollar">$ Dollar Off</option>
                        <option value="percent">% Percent Off</option>
                      </SelectInput>
                    </div>
                    <div>
                      <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Amount</label>
                      <TextInput
                        type="number"
                        value={String(fuDiscountAmount)}
                        onChange={e => setFuDiscountAmount(Number(e.target.value) || 0)}
                        style={{ width: 100 }}
                      />
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: '#16a34a', paddingBottom: 8 }}>
                      {fuDiscountType === 'dollar'
                        ? `New price: $${Math.max(0, Number(followupTarget.total_price) - fuDiscountAmount).toLocaleString()}`
                        : `New price: $${Math.max(0, Math.round(Number(followupTarget.total_price) * (1 - fuDiscountAmount / 100))).toLocaleString()}`
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* Send method */}
              <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
                Send Via
              </div>
              <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.md }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: followupTarget.customer_phone ? 'pointer' : 'not-allowed', opacity: followupTarget.customer_phone ? 1 : 0.4 }}>
                  <input type="checkbox" checked={fuSendSms} onChange={e => setFuSendSms(e.target.checked)} disabled={!followupTarget.customer_phone} />
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>SMS</span>
                  {!followupTarget.customer_phone && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>(no phone)</span>}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: followupTarget.customer_email ? 'pointer' : 'not-allowed', opacity: followupTarget.customer_email ? 1 : 0.4 }}>
                  <input type="checkbox" checked={fuSendEmail} onChange={e => setFuSendEmail(e.target.checked)} disabled={!followupTarget.customer_email} />
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>Email</span>
                  {!followupTarget.customer_email && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>(no email)</span>}
                </label>
              </div>
            </>
          ) : (
            /* Success state */
            <div style={{ textAlign: 'center', padding: SPACING.lg }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: 700, marginBottom: SPACING.sm }}>
                {fuResult.sent ? 'Follow-Up Sent' : 'Follow-Up Link Generated'}
              </div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
                {fuResult.sent ? 'The customer has been notified with a fresh booking link.' : 'Copy the link below to send manually.'}
                {fuDiscountEnabled && fuDiscountAmount > 0 && (
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>
                    {' '}Includes {fuDiscountType === 'dollar' ? `$${fuDiscountAmount}` : `${fuDiscountAmount}%`} incentive.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <input readOnly value={fuResult.url} style={{ flex: 1, background: 'none', border: 'none', color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', fontFamily: 'monospace' }}
                  onClick={e => (e.target as HTMLInputElement).select()} />
                <Button variant={fuCopied ? 'primary' : 'secondary'} onClick={handleCopyFollowupLink}>{fuCopied ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ================================================================ */}
      {/* DETAIL MODAL */}
      {/* ================================================================ */}
      {detailTarget && (
        <Modal title="Lead Details" onClose={() => setDetailTarget(null)} footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
            {(detailTarget.status === 'sent' || detailTarget.status === 'opened') && (
              <Button variant="primary" onClick={() => { setDetailTarget(null); openFollowup(detailTarget); }}>Send Follow-Up</Button>
            )}
            <Button variant="secondary" onClick={() => setDetailTarget(null)}>Close</Button>
          </div>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
            {/* Customer */}
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Customer</div>
              <div style={{ fontWeight: 700, color: COLORS.textPrimary }}>{detailTarget.customer_name || 'Anonymous'}</div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                {formatPhone(detailTarget.customer_phone)}
                {detailTarget.customer_email && ` | ${detailTarget.customer_email}`}
              </div>
            </div>

            {/* Vehicle */}
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Vehicle</div>
              <div style={{ fontWeight: 700, color: COLORS.textPrimary }}>{detailTarget.vehicle_year} {detailTarget.vehicle_make} {detailTarget.vehicle_model}</div>
            </div>

            {/* Services */}
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Services</div>
              {Array.isArray(detailTarget.services) && detailTarget.services.map((svc, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < detailTarget.services.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>
                    {svc.label}{svc.film_name ? ` (${svc.film_name})` : ''}{svc.shade_front ? ` - ${svc.shade_front}` : ''}
                  </span>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: 700 }}>${svc.price}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontWeight: 700, fontSize: FONT.sizeLg, color: COLORS.textPrimary }}>
                <span>Total</span>
                <span>${Number(detailTarget.total_price).toLocaleString()}</span>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Timeline</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Sent: {formatDate(detailTarget.created_at)} ({timeAgo(detailTarget.created_at)})</div>
                <div style={{ fontSize: FONT.sizeSm, color: detailTarget.link_opened_at ? '#f59e0b' : COLORS.textMuted }}>
                  Opened: {detailTarget.link_opened_at ? formatDate(detailTarget.link_opened_at) : 'Not yet'}
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: detailTarget.booked_at ? COLORS.success : COLORS.textMuted }}>
                  Booked: {detailTarget.booked_at ? formatDate(detailTarget.booked_at) : 'Not yet'}
                </div>
                {detailTarget.followup_count > 0 && (
                  <div style={{ fontSize: FONT.sizeSm, color: '#7c3aed' }}>
                    Follow-ups sent: {detailTarget.followup_count} (last: {detailTarget.last_followup_at ? formatDate(detailTarget.last_followup_at) : '--'})
                  </div>
                )}
                {detailTarget.followup_discount_type && Number(detailTarget.followup_discount_amount) > 0 && (
                  <div style={{ fontSize: FONT.sizeSm, color: '#16a34a', fontWeight: 600 }}>
                    Active incentive: {detailTarget.followup_discount_type === 'dollar' ? `$${detailTarget.followup_discount_amount} off` : `${detailTarget.followup_discount_amount}% off`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
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
