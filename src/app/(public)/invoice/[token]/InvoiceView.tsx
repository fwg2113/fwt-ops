'use client';

import React, { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SignaturePad, { InitialsPad } from '@/app/components/SignaturePad';

// ============================================================================
// TYPES (normalized document_line_items format)
// ============================================================================
type LineItem = {
  id: string;
  document_id: string;
  module: string;
  group_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  custom_fields: {
    filmId?: number;
    filmName?: string;
    filmAbbrev?: string;
    shade?: string;
    shadeFront?: string;
    shadeRear?: string;
    shadeId?: number;
    rollId?: string | null;
    rollInventoryId?: number | null;
    warrantyYears?: number;
    serviceKey?: string;
    [key: string]: unknown;
  };
};

type ModuleContentBlock = {
  warranty_title?: string;
  warranty_text?: string;
  no_fault_title?: string;
  no_fault_text?: string;
  care_title?: string;
  care_items?: string[];
};

type DocumentData = {
  id: string;
  doc_type: string;
  doc_number: string;
  public_token: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  class_keys: string | null;
  document_line_items: LineItem[];
  subtotal: number;
  discount_code: string | null;
  discount_type: string | null;
  discount_percent: number;
  discount_amount: number;
  deposit_paid: number;
  cc_fee_percent: number;
  cc_fee_flat: number;
  cc_fee_amount: number;
  cash_discount_percent: number;
  balance_due: number;
  total_paid: number;
  payment_method: string | null;
  payment_confirmed_at: string | null;
  warranty_content_snapshot: Record<string, ModuleContentBlock> | null;
  initials_data: string | null;
  signature_data: string | null;
  signed_at: string | null;
  status: string;
  checkout_type: string;
  options_mode: boolean;
  approval_mode: 'schedule_approve' | 'just_approve' | null;
  available_slots: Array<{ date: string; time: string }> | null;
  customer_requested_dates: Array<{ date: string; preference?: string }> | null;
  notes: string | null;
  created_at: string;
  attachments?: Array<{ key: string; url: string; filename: string; contentType: string }>;
};

type ShopConfig = {
  shop_name: string;
  shop_phone: string | null;
  shop_email: string | null;
  shop_address: string | null;
  cc_fee_percent: number;
  cc_fee_flat: number;
  cash_discount_percent: number;
  payment_methods: string[];
  module_invoice_content?: Record<string, ModuleContentBlock>;
  checkout_flow_config?: {
    signature_enabled?: boolean;
    signature_required?: boolean;
    signature_terms_text?: string;
    legality_acknowledgment_enabled?: boolean;
    legality_acknowledgment_required?: boolean;
    legality_acknowledgment_text?: string;
  };
  invoice_brand_mode?: string;
  invoice_brand_fixed_id?: number | null;
};

type ResolvedBrand = {
  id: number;
  name: string;
  short_name: string | null;
  logo_square_url: string | null;
  logo_wide_url: string | null;
  primary_color: string;
  secondary_color: string;
  is_default: boolean;
};

type Props = {
  document: DocumentData;
  shop: ShopConfig | null;
  resolvedBrands?: ResolvedBrand[];
  moduleColors?: Record<string, string>;
  moduleLabels?: Record<string, string>;
};

// ============================================================================
// BRAND COLOR FALLBACKS — used only when no brand data is available
// ============================================================================
const FALLBACK_BRAND = '#dc2626';
const FALLBACK_BRAND_DARK = '#b91c1c';

// ============================================================================
// HELPERS
// ============================================================================
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'sent': return 'Sent';
    case 'viewed': return 'Viewed';
    case 'approved': return 'Approved';
    case 'revision_requested': return 'Changes Requested';
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'paid': return 'Paid';
    case 'partial': return 'Partial';
    case 'void': return 'Void';
    default: return status;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================
// Fallback module display labels and colors — used only when DB-driven data is not provided
const FALLBACK_MODULE_LABELS: Record<string, string> = {
  auto_tint: 'Window Tint', flat_glass: 'Flat Glass', detailing: 'Detailing',
  ceramic_coating: 'Ceramic Coating', ppf: 'Paint Protection Film',
  wraps: 'Vehicle Wraps', signage: 'Signage', apparel: 'Custom Apparel',
};
const FALLBACK_MODULE_COLORS: Record<string, string> = {
  auto_tint: '#dc2626', flat_glass: '#0ea5e9', detailing: '#8b5cf6',
  ceramic_coating: '#f59e0b', ppf: '#10b981', wraps: '#ec4899',
  signage: '#06b6d4', apparel: '#a855f7',
};

// Group line items by module
function groupByModule(items: LineItem[]): Record<string, LineItem[]> {
  const grouped: Record<string, LineItem[]> = {};
  for (const item of items) {
    const mod = item.module || 'auto_tint';
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(item);
  }
  return grouped;
}

// Helper: darken a hex color by a given amount
function darkenColor(hex: string, amount: number = 30): string {
  const h = hex.replace('#', '');
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Helper: get initials from a name (first letter of each word)
function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').toUpperCase();
}

export default function InvoiceView({ document: docProp, shop, resolvedBrands, moduleColors: moduleColorsProp, moduleLabels: moduleLabelsProp }: Props) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const searchParams = useSearchParams();
  const signOnly = searchParams.get('sign') === 'true';
  const justPaid = searchParams.get('paid') === 'true';

  const doc = docProp;
  const lineItems: LineItem[] = Array.isArray(doc.document_line_items)
    ? doc.document_line_items.sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const groupedItems = groupByModule(lineItems);
  const moduleKeys = Object.keys(groupedItems);
  const hasMultipleModules = moduleKeys.length > 1;

  // Resolved brand identity — primary brand drives accent color
  const brands = resolvedBrands && resolvedBrands.length > 0 ? resolvedBrands : null;
  const primaryBrand = brands ? brands[0] : null;
  const BRAND = primaryBrand?.primary_color || FALLBACK_BRAND;
  const BRAND_DARK = primaryBrand ? darkenColor(primaryBrand.primary_color, 30) : FALLBACK_BRAND_DARK;
  const hasMultipleBrands = brands ? brands.length > 1 : false;

  // Module colors/labels — prefer DB-driven, fall back to hardcoded
  const MODULE_COLORS: Record<string, string> = { ...FALLBACK_MODULE_COLORS, ...moduleColorsProp };
  const MODULE_LABELS: Record<string, string> = { ...FALLBACK_MODULE_LABELS, ...moduleLabelsProp };

  const shopName = shop?.shop_name || '';
  const shopPhone = shop?.shop_phone || '';
  const shopEmail = shop?.shop_email || '';
  const shopAddress = shop?.shop_address || '';

  const isQuote = doc.doc_type === 'quote';
  const isOptionsMode = isQuote && doc.options_mode === true;
  const canApprove = isQuote && ['sent', 'viewed'].includes(doc.status) && !isOptionsMode;
  const canApproveOption = isQuote && ['sent', 'viewed'].includes(doc.status) && isOptionsMode;
  const isApproved = doc.status === 'approved';
  const isRevisionRequested = doc.status === 'revision_requested';
  const isPaid = doc.status === 'paid';
  const canPay = !isPaid && !isQuote && doc.status !== 'void' && doc.balance_due > 0;

  // Option titles from options_json (set by team in document editor)
  const optionTitlesMap: Record<string, string> = (() => {
    const oj = (doc as any).options_json;
    if (oj && typeof oj === 'object' && !Array.isArray(oj)) return oj;
    return {};
  })();

  // Options mode: group line items by group_id into options
  const optionGroups: { groupId: string; title: string; items: typeof lineItems; total: number }[] = (() => {
    if (!isOptionsMode) return [];
    const groupOrder: string[] = [];
    const groupMap: Record<string, typeof lineItems> = {};
    lineItems.forEach(item => {
      const gid = item.group_id || '_ungrouped';
      if (!groupMap[gid]) { groupMap[gid] = []; groupOrder.push(gid); }
      groupMap[gid].push(item);
    });
    return groupOrder.map((gid, idx) => {
      const items = groupMap[gid];
      // Title priority: custom title from options_json > auto from vehicle > generic
      let title = optionTitlesMap[gid] || '';
      if (!title) {
        const firstItem = items[0];
        const cf = firstItem?.custom_fields || {};
        const modLabel = MODULE_LABELS[firstItem?.module] || firstItem?.module || 'Option';
        if (cf.vehicleYear) {
          title = `${modLabel} -- ${cf.vehicleYear} ${cf.vehicleMake} ${cf.vehicleModel}`;
        } else {
          title = modLabel;
        }
      }
      return {
        groupId: gid,
        title,
        items,
        total: items.reduce((sum, i) => sum + (i.line_total || 0), 0),
      };
    });
  })();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [approvingOption, setApprovingOption] = useState(false);

  // Quote approval state
  const [approving, setApproving] = useState(false);
  const [showApprovalConfirmation, setShowApprovalConfirmation] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [contactPreference, setContactPreference] = useState<'sms' | 'email'>('sms');
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [undoingApproval, setUndoingApproval] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState(doc.status);

  // Approval mode state
  const approvalMode = doc.approval_mode || 'just_approve';
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [requestedDates] = useState<Array<{ date: string; preference: string }>>([
    { date: '', preference: 'no_preference' },
  ]);

  async function handleUndoApproval() {
    setUndoingApproval(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/undo-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || 'Unable to undo approval');
      }
    } catch (err) {
      console.error('Undo approval error:', err);
    }
    setUndoingApproval(false);
  }

  async function handleApproveOption(groupId: string) {
    if (approvalMode === 'schedule_approve' && !selectedSlot) {
      alert('Please select an available time slot before approving.');
      return;
    }
    setApprovingOption(true);
    setSelectedOption(groupId);
    try {
      const payload: Record<string, unknown> = { selectedOptionGroupId: groupId };
      if (approvalMode === 'schedule_approve' && selectedSlot) {
        payload.selectedSlot = selectedSlot;
      }
      const res = await fetch(`/api/documents/${doc.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setQuoteStatus('approved');
        setShowApprovalConfirmation(true);
      }
    } catch (err) {
      console.error('Option approval error:', err);
    }
    setApprovingOption(false);
  }

  async function handleApproveQuote() {
    // Validate mode-specific requirements
    if (approvalMode === 'schedule_approve' && !selectedSlot) {
      alert('Please select an available time slot before approving.');
      return;
    }

    setApproving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (approvalMode === 'schedule_approve' && selectedSlot) {
        payload.selectedSlot = selectedSlot;
      }

      const res = await fetch(`/api/documents/${doc.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setQuoteStatus('approved');
        setShowApprovalConfirmation(true);
      }
    } catch (err) {
      console.error('Approval error:', err);
    }
    setApproving(false);
  }

  async function handleRequestChanges() {
    if (!revisionMessage.trim()) return;
    setSubmittingRevision(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: revisionMessage,
          contactPreference,
          customerName: doc.customer_name,
        }),
      });
      if (res.ok) {
        setQuoteStatus('revision_requested');
        setShowRevisionModal(false);
        setRevisionMessage('');
      }
    } catch (err) {
      console.error('Request changes error:', err);
    }
    setSubmittingRevision(false);
  }

  // Signature config
  const sigConfig = shop?.checkout_flow_config;
  const sigEnabled = sigConfig?.signature_enabled ?? false;
  const sigRequired = sigConfig?.signature_required ?? false;
  const legalEnabled = sigConfig?.legality_acknowledgment_enabled ?? false;
  const legalRequired = sigConfig?.legality_acknowledgment_required ?? false;
  const hasSigned = Boolean(doc.signature_data);
  const [initialsData, setInitialsData] = useState<string | null>(doc.initials_data || null);
  const [signatureData, setSignatureData] = useState<string | null>(doc.signature_data || null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(hasSigned);
  const needsSignature = canPay && (sigEnabled || legalEnabled) && !signatureSaved;
  const paymentBlocked = canPay && (
    (sigEnabled && sigRequired && !signatureSaved) ||
    (legalEnabled && legalRequired && !signatureSaved)
  );

  // CC fee calculation
  const ccFeePercent = doc.cc_fee_percent || shop?.cc_fee_percent || 3.5;
  const ccFeeFlat = doc.cc_fee_flat || shop?.cc_fee_flat || 0.30;
  const cashDiscount = doc.cash_discount_percent || shop?.cash_discount_percent || 5.0;

  const balanceDue = doc.balance_due;
  const ccFee = Math.round((balanceDue * (ccFeePercent / 100) + ccFeeFlat) * 100) / 100;
  const cardTotal = balanceDue + ccFee;
  const cashTotal = Math.round(balanceDue * (1 - cashDiscount / 100) * 100) / 100;
  const cashSavings = balanceDue - cashTotal;

  // Vehicle string
  const vehicleStr = [doc.vehicle_year, doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ');

  // PDF download
  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const el = documentRef.current;
      if (!el) return;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f3f4f6',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`${doc.doc_number}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Square payment handler (remote invoice payment)
  async function handleCardPayment() {
    try {
      const res = await fetch('/api/auto/invoices/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: doc.id,
          paymentMethod: 'cc',
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Payment initiation failed:', err);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f4f6',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {/* Responsive styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @media (max-width: 640px) {
          .invoice-header-inner { padding: 20px 16px !important; }
          .invoice-header-accent { width: 70% !important; right: -25% !important; }
          .invoice-info-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .invoice-status-pill { position: relative !important; top: auto !important; right: auto !important; transform: none !important; margin-top: 16px !important; }
          .invoice-card { padding: 16px 16px !important; }
          .invoice-main { padding: 12px !important; }
          .invoice-payment-options { flex-direction: column !important; }
          .invoice-contact-row { flex-direction: column !important; }
          .invoice-trust-bar { gap: 20px !important; flex-wrap: wrap !important; justify-content: center !important; }
          .invoice-line-item { flex-direction: column !important; gap: 4px !important; }
          .invoice-line-price { text-align: left !important; }
        }
        @media print {
          .no-print { display: none !important; }
        }
      `}} />

      {/* Main Container */}
      <div ref={documentRef} className="invoice-main" style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>

        {/* ================================================================ */}
        {/* APPROVAL CONFIRMATION (replaces page content after quote approval) */}
        {/* ================================================================ */}
        {showApprovalConfirmation && (
          <div style={{
            background: '#ffffff', borderRadius: '20px',
            padding: '48px 32px', textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' }}>
              {approvalMode === 'schedule_approve' ? 'Appointment Confirmed' : 'Quote Approved'}
            </h1>
            <p style={{ fontSize: '16px', color: '#6b7280', margin: '0 0 32px', lineHeight: 1.6 }}>
              {approvalMode === 'schedule_approve' && selectedSlot
                ? `Your appointment has been scheduled for ${new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${(() => { const [h, m] = selectedSlot.time.split(':').map(Number); const ampm = h >= 12 ? 'PM' : 'AM'; return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${ampm}`; })()}.`
                : 'Thank you for approving this quote. We will be in touch to schedule your appointment.'}
            </p>

            {/* Approved services summary */}
            <div style={{
              background: '#f9fafb', borderRadius: '12px', padding: '20px',
              textAlign: 'left', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                Services
              </div>
              {lineItems.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                  <span style={{ color: '#1a1a1a' }}>{item.description || 'Service'}</span>
                  <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{formatCurrency(item.line_total)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700 }}>
                <span style={{ color: '#1a1a1a' }}>Total</span>
                <span style={{ color: '#1a1a1a' }}>{formatCurrency(doc.subtotal)}</span>
              </div>
            </div>

            {approvalMode === 'schedule_approve' && selectedSlot && (
              <div style={{
                background: `${BRAND}10`, border: `2px solid ${BRAND}30`,
                borderRadius: '12px', padding: '16px', marginBottom: '24px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: BRAND }}>
                  {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' at '}
                  {(() => { const [h, m] = selectedSlot.time.split(':').map(Number); const ampm = h >= 12 ? 'PM' : 'AM'; return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${ampm}`; })()}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {doc.customer_name} -- {[doc.vehicle_year, doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ')}
                </div>
              </div>
            )}

            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
              A confirmation has been sent to you. If you have any questions, please don't hesitate to reach out.
            </p>
          </div>
        )}

        {!showApprovalConfirmation && (<>
        {/* ================================================================ */}
        {/* HEADER CARD */}
        {/* ================================================================ */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '24px',
          position: 'relative',
        }}>
          {/* Brand accent shape */}
          <div className="invoice-header-accent" style={{
            position: 'absolute',
            top: '-50%',
            right: '-20%',
            width: '55%',
            height: '200%',
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            borderRadius: '50%',
            zIndex: 0,
          }} />

          <div className="invoice-header-inner" style={{ position: 'relative', zIndex: 1, padding: '32px 40px' }}>
            {/* Top row: Logo + Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
              {/* Brand identity */}
              <div>
                {brands && brands.length > 0 ? (
                  <>
                    {/* Logo row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: hasMultipleBrands ? '16px' : '0' }}>
                      {brands.map((brand) => {
                        const hasWideLogo = Boolean(brand.logo_wide_url);
                        const hasSquareLogo = Boolean(brand.logo_square_url);

                        if (!hasMultipleBrands && hasWideLogo) {
                          // Single brand with wide logo: show wide logo only
                          return (
                            <img
                              key={brand.id}
                              src={brand.logo_wide_url!}
                              alt={brand.name}
                              style={{ height: '40px', objectFit: 'contain', display: 'block' }}
                            />
                          );
                        }

                        if (!hasMultipleBrands && hasSquareLogo) {
                          // Single brand with square logo: logo + name beside it
                          return (
                            <div key={brand.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img
                                src={brand.logo_square_url!}
                                alt={brand.name}
                                style={{ height: '40px', width: '40px', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
                              />
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                {brand.name}
                              </div>
                            </div>
                          );
                        }

                        if (hasMultipleBrands) {
                          // Multiple brands: show square logo at 40px or text initials
                          if (hasSquareLogo) {
                            return (
                              <img
                                key={brand.id}
                                src={brand.logo_square_url!}
                                alt={brand.name}
                                style={{ height: '40px', width: '40px', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
                              />
                            );
                          }
                          // No logo: show initials circle in brand color
                          return (
                            <div
                              key={brand.id}
                              style={{
                                width: '40px', height: '40px', borderRadius: '8px',
                                background: brand.primary_color,
                                color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '16px', fontWeight: 700, letterSpacing: '-0.5px',
                              }}
                            >
                              {getInitials(brand.short_name || brand.name)}
                            </div>
                          );
                        }

                        // Single brand, no logo at all: text initials + name (original style)
                        return (
                          <div key={brand.id}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                              <span style={{ color: brand.primary_color }}>{getInitials(brand.short_name || brand.name)}</span>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '2px' }}>
                              {brand.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Multi-brand name row */}
                    {hasMultipleBrands && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginTop: '6px' }}>
                        {brands.map((brand, idx) => (
                          <React.Fragment key={brand.id}>
                            {idx > 0 && (
                              <span style={{ margin: '0 10px', color: '#d1d5db', fontSize: '11px' }}>|</span>
                            )}
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              {brand.short_name || brand.name}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Fallback: no brands data at all — use shop name */
                  <div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                      <span style={{ color: BRAND }}>{shopName ? getInitials(shopName) : ''}</span>
                    </div>
                    {shopName && (
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '2px' }}>
                        {shopName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="header-badge-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Save PDF */}
                <button
                  className="no-print"
                  onClick={handleDownloadPdf}
                  disabled={generatingPdf}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '20px',
                    color: '#6b7280',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: generatingPdf ? 'wait' : 'pointer',
                    opacity: generatingPdf ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {generatingPdf ? 'Generating...' : 'Save PDF'}
                </button>

                {/* Invoice number badge */}
                <div style={{
                  background: BRAND,
                  color: 'white',
                  padding: '8px 20px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}>
                  {doc.doc_number}
                </div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="invoice-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '32px', maxWidth: '55%' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Bill To</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>{doc.customer_name}</div>
                {doc.customer_email && <div style={{ fontSize: '14px', color: '#6b7280' }}>{doc.customer_email}</div>}
                {doc.customer_phone && <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatPhone(doc.customer_phone)}</div>}
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Vehicle</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>{vehicleStr}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>Created: {formatDate(doc.created_at)}</div>
              </div>
            </div>

            {/* Status pill */}
            <div className="invoice-status-pill" style={{
              position: 'absolute',
              top: '55%',
              right: '10%',
              transform: 'translateY(-50%)',
              textAlign: 'center',
              zIndex: 2,
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Status</div>
              <div style={{
                display: 'inline-block',
                padding: '10px 28px',
                borderRadius: '30px',
                background: isPaid
                  ? 'linear-gradient(179deg, #22c55e 0%, #15803d 100%)'
                  : 'linear-gradient(179deg, #ffffff 0%, #969696 40%)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                fontSize: '18px',
                fontWeight: 600,
                color: isPaid ? '#ffffff' : '#1a1a1a',
              }}>
                {getStatusLabel(doc.status)}
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* PROJECT FILES / ATTACHMENTS (if any) */}
        {/* ================================================================ */}
        {(() => {
          const docAttachments = Array.isArray((doc as any).attachments) ? (doc as any).attachments : [];
          const imageAttachments = docAttachments.filter((a: any) => a.contentType?.startsWith('image/'));
          const fileAttachments = docAttachments.filter((a: any) => !a.contentType?.startsWith('image/'));
          if (docAttachments.length === 0) return null;
          return (
            <div className="invoice-card" style={{
              background: '#ffffff', borderRadius: '16px', padding: '24px 32px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: '24px',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                Project Files
              </h2>
              {imageAttachments.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: fileAttachments.length > 0 ? '16px' : '0' }}>
                  {imageAttachments.map((att: any, idx: number) => (
                    <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                      style={{ position: 'relative', paddingBottom: '75%', borderRadius: '12px', overflow: 'hidden', display: 'block', background: '#f1f5f9' }}>
                      <img src={att.url} alt={att.filename} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              )}
              {fileAttachments.map((att: any, idx: number) => (
                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: '10px', border: '1px solid #e5e7eb',
                    textDecoration: 'none', color: '#1a1a1a', marginBottom: idx < fileAttachments.length - 1 ? '8px' : '0',
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>{att.filename}</span>
                </a>
              ))}
            </div>
          );
        })()}

        {/* ================================================================ */}
        {/* OPTIONS MODE — show each option as a card */}
        {/* ================================================================ */}
        {isOptionsMode && optionGroups.length > 0 && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 6px 0' }}>
              Your Options
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px 0' }}>
              Review each option below. Approve the one that works best for you, or request changes.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {optionGroups.map((opt, optIdx) => (
                <div key={opt.groupId} style={{
                  borderRadius: '14px',
                  border: selectedOption === opt.groupId ? '3px solid #22c55e' : '2px solid #e5e7eb',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedOption === opt.groupId ? '0 4px 20px rgba(34,197,94,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                  {/* Option header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: selectedOption === opt.groupId ? 'rgba(34,197,94,0.05)' : '#f9fafb',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: BRAND,
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 700,
                      }}>
                        {optIdx + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>
                          Option {optIdx + 1} -- {opt.title}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {opt.items.length} service{opt.items.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: BRAND }}>
                      {formatCurrency(opt.total)}
                    </div>
                  </div>

                  {/* Option line items */}
                  <div style={{ padding: '16px 20px' }}>
                    {opt.items.map((item, idx) => {
                      const cf = item.custom_fields || {};
                      const modColor = MODULE_COLORS[item.module] || BRAND;
                      return (
                        <div key={item.id || idx} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                          padding: '10px 0',
                          borderBottom: idx < opt.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: modColor, flexShrink: 0 }} />
                              <span style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a' }}>
                                {item.description}
                              </span>
                            </div>
                            {(cf.filmName || cf.shade) && (
                              <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: '14px' }}>
                                {cf.filmName}{cf.shade ? ` ${cf.shade}` : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                            {formatCurrency(item.line_total)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Option action buttons (only when approvable) */}
                  {canApproveOption && (
                  <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleApproveOption(opt.groupId)}
                      disabled={approvingOption}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        background: '#22c55e', color: '#ffffff', fontSize: '14px', fontWeight: 600,
                        cursor: approvingOption ? 'not-allowed' : 'pointer',
                        opacity: approvingOption ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      {approvingOption && selectedOption === opt.groupId ? 'Approving...' : 'Choose This Option'}
                    </button>
                    <button
                      onClick={() => setShowRevisionModal(true)}
                      style={{
                        padding: '12px 20px', borderRadius: '10px',
                        border: '1px solid #e5e7eb', background: '#ffffff',
                        color: '#6b7280', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Request Changes
                    </button>
                  </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SERVICE LINE ITEMS (standard mode — hidden in options mode) */}
        {/* ================================================================ */}
        {!isOptionsMode && <div className="invoice-card" style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 20px 0' }}>
            {isQuote ? 'Quote Details' : 'Invoice Details'}
          </h2>

          {/* Line items — grouped by module when multiple modules present */}
          {moduleKeys.map((mod) => {
            const items = groupedItems[mod];
            const modColor = MODULE_COLORS[mod] || BRAND;
            return (
              <div key={mod}>
                {/* Module group header — only shown when invoice has multiple modules */}
                {hasMultipleModules && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 0', marginBottom: '4px', marginTop: mod === moduleKeys[0] ? 0 : '12px',
                    borderBottom: '2px solid ' + modColor,
                  }}>
                    <div style={{ width: 4, height: 20, borderRadius: 2, background: modColor }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: modColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {MODULE_LABELS[mod] || mod}
                    </span>
                  </div>
                )}
                {items.map((item, idx) => {
                  const cf = item.custom_fields || {};
                  return (
                    <div
                      key={item.id || idx}
                      className="invoice-line-item"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '16px 0',
                        borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        {/* Service label with colored bullet */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasMultipleModules ? modColor : BRAND, flexShrink: 0 }} />
                          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>
                            {item.description || 'Service'}
                          </span>
                        </div>
                        {/* Film + shade detail */}
                        {(cf.filmName || cf.filmAbbrev) && (
                          <div style={{ fontSize: '14px', color: '#6b7280', marginLeft: '16px', marginBottom: '2px' }}>
                            {cf.filmName || cf.filmAbbrev}{cf.shade ? ` ${cf.shade}` : ''}
                          </div>
                        )}
                        {/* Roll ID */}
                        {cf.rollId && (
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '16px' }}>
                            Roll ID: {cf.rollId}
                          </div>
                        )}
                      </div>
                      <div className="invoice-line-price" style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatCurrency(item.line_total || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {lineItems.length === 0 && (
            <div style={{ padding: '20px 0', color: '#9ca3af', textAlign: 'center' }}>
              No line items
            </div>
          )}

          {/* ---- Totals ---- */}
          <div style={{ marginTop: '20px', borderTop: '2px solid #f3f4f6', paddingTop: '16px' }}>
            {/* Subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Subtotal</span>
              <span style={{ fontSize: '14px', color: '#1a1a1a' }}>{formatCurrency(doc.subtotal)}</span>
            </div>

            {/* Discount */}
            {doc.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#22c55e' }}>
                  Discount{doc.discount_code ? ` (${doc.discount_code})` : ''}
                  {doc.discount_type === 'percent' && doc.discount_percent > 0 ? ` ${doc.discount_percent}%` : ''}
                </span>
                <span style={{ fontSize: '14px', color: '#22c55e' }}>-{formatCurrency(doc.discount_amount)}</span>
              </div>
            )}

            {/* Deposit paid */}
            {doc.deposit_paid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Deposit Paid</span>
                <span style={{ fontSize: '14px', color: '#22c55e' }}>-{formatCurrency(doc.deposit_paid)}</span>
              </div>
            )}

            {/* Balance Due */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Balance Due</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: isPaid ? '#22c55e' : BRAND }}>
                {isPaid ? formatCurrency(0) : formatCurrency(balanceDue)}
              </span>
            </div>
          </div>
        </div>}

        {/* ================================================================ */}
        {/* SIGNATURE & ACKNOWLEDGMENT (customer-facing) */}
        {/* ================================================================ */}
        {needsSignature && !signatureSaved && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px 0' }}>
              Acknowledgment & Signature
            </h2>

            {/* Legality acknowledgment + initials */}
            {legalEnabled && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '14px', color: '#4b5563', lineHeight: 1.7,
                  padding: '12px 16px', background: '#f9fafb', borderRadius: '8px',
                  border: '1px solid #e5e7eb', marginBottom: '12px',
                }}>
                  {sigConfig?.legality_acknowledgment_text || 'I acknowledge the legal terms.'}
                </div>
                <InitialsPad
                  label="Your Initials"
                  value={initialsData}
                  onChange={setInitialsData}
                  disabled={savingSignature}
                />
              </div>
            )}

            {/* Signature + terms */}
            {sigEnabled && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '13px', color: '#6b7280', lineHeight: 1.7,
                  padding: '12px 16px', background: '#f9fafb', borderRadius: '8px',
                  border: '1px solid #e5e7eb', marginBottom: '12px',
                  maxHeight: '100px', overflowY: 'auto',
                }}>
                  {sigConfig?.signature_terms_text || 'I accept the terms stated above.'}
                </div>
                <SignaturePad
                  label="Your Signature"
                  value={signatureData}
                  onChange={setSignatureData}
                  disabled={savingSignature}
                  penColor="#1a1a1a"
                />
              </div>
            )}

            {/* Confirm button */}
            <button
              onClick={async () => {
                setSavingSignature(true);
                try {
                  await fetch(`/api/invoice/${doc.public_token}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      initials_data: initialsData,
                      signature_data: signatureData,
                    }),
                  });
                  setSignatureSaved(true);
                } catch { /* silent */ }
                setSavingSignature(false);
              }}
              disabled={
                savingSignature ||
                (legalEnabled && legalRequired && !initialsData) ||
                (sigEnabled && sigRequired && !signatureData)
              }
              style={{
                width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                background:
                  (legalRequired && !initialsData) || (sigRequired && !signatureData)
                    ? '#e5e7eb' : BRAND,
                color:
                  (legalRequired && !initialsData) || (sigRequired && !signatureData)
                    ? '#9ca3af' : '#ffffff',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {savingSignature ? 'Saving...' : signOnly ? 'Submit Signature' : 'Confirm & Continue to Payment'}
            </button>
          </div>
        )}

        {/* Sign-only success message */}
        {signOnly && signatureSaved && (
          <div className="invoice-card" style={{
            background: '#ffffff', borderRadius: '16px', padding: '32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: '24px',
            border: '2px solid #22c55e', textAlign: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ marginBottom: '16px' }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e', margin: '0 0 8px 0' }}>Signature Received</h2>
            <p style={{ fontSize: '15px', color: '#6b7280', margin: 0 }}>Please complete payment at the counter.</p>
          </div>
        )}

        {/* ================================================================ */}
        {/* QUOTE APPROVAL (only for quotes in sent/viewed status) */}
        {/* ================================================================ */}
        {canApprove && quoteStatus !== 'approved' && quoteStatus !== 'revision_requested' && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px 0' }}>
              Ready to Move Forward?
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px 0', lineHeight: 1.6 }}>
              {approvalMode === 'schedule_approve'
                ? 'Select your preferred time slot below, then approve the quote to book your appointment.'
                : 'Review the quote details above. When you\'re ready, approve the quote to proceed or request changes if anything needs adjusting.'}
            </p>

            {/* schedule_approve: slot picker */}
            {approvalMode === 'schedule_approve' && Array.isArray(doc.available_slots) && doc.available_slots.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Available Time Slots
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                  {doc.available_slots.map((slot, idx) => {
                    const isSelected = selectedSlot?.date === slot.date && selectedSlot?.time === slot.time;
                    const slotDate = new Date(slot.date + 'T00:00:00');
                    const dayStr = slotDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    // Format time from 24h to 12h
                    const timeParts = slot.time.split(':');
                    const hour = parseInt(timeParts[0], 10);
                    const minute = timeParts[1] || '00';
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                    const timeStr = `${hour12}:${minute} ${ampm}`;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedSlot(isSelected ? null : slot)}
                        style={{
                          padding: '14px 16px',
                          borderRadius: '10px',
                          border: isSelected ? `2px solid ${BRAND}` : '1px solid #e5e7eb',
                          background: isSelected ? `${BRAND}0D` : '#ffffff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? BRAND : '#1a1a1a' }}>
                          {dayStr}
                        </div>
                        <div style={{ fontSize: '13px', color: isSelected ? BRAND : '#6b7280', marginTop: '2px' }}>
                          {timeStr}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


            <div className="invoice-contact-row" style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleApproveQuote}
                disabled={approving || (approvalMode === 'schedule_approve' && !selectedSlot)}
                style={{
                  flex: 1,
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: (approvalMode === 'schedule_approve' && !selectedSlot) ? '#9ca3af' : '#22c55e',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: (approving || (approvalMode === 'schedule_approve' && !selectedSlot)) ? 'not-allowed' : 'pointer',
                  opacity: approving ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {approving
                  ? 'Approving...'
                  : approvalMode === 'schedule_approve'
                  ? 'Approve & Book'
                  : 'Approve Quote'}
              </button>
              <button
                onClick={() => setShowRevisionModal(true)}
                style={{
                  flex: 1,
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#1a1a1a',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Request Changes
              </button>
            </div>
          </div>
        )}

        {/* Quote approved confirmation */}
        {(isApproved || quoteStatus === 'approved') && isQuote && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
            border: '2px solid #22c55e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>Quote Approved</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {(() => {
                    const approvalConfig = (shop as any)?.quote_approval_config;
                    const customMsg = approvalConfig?.custom_message;
                    return customMsg || 'Your quote has been approved and converted to an invoice. We\'ll be in touch with next steps.';
                  })()}
                </div>
              </div>
            </div>
            {/* Undo button -- only if no payments made */}
            {doc.balance_due > 0 && (doc.total_paid || 0) === 0 && (
              <button
                onClick={handleUndoApproval}
                disabled={undoingApproval}
                style={{
                  marginTop: '16px', width: '100%', padding: '12px',
                  borderRadius: '10px', border: '1px solid #e5e7eb',
                  background: '#ffffff', color: '#6b7280',
                  fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                {undoingApproval ? 'Reverting...' : 'I changed my mind'}
              </button>
            )}
          </div>
        )}

        {/* Revision requested confirmation */}
        {(isRevisionRequested || quoteStatus === 'revision_requested') && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
            border: '2px solid #f59e0b',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>Changes Requested</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  We've received your feedback and will update the quote. We'll send you a revised version soon.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Revision request modal */}
        {showRevisionModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}>
            <div style={{
              background: '#ffffff', borderRadius: '16px', padding: '32px',
              maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px 0' }}>
                Request Changes
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px 0' }}>
                Let us know what you'd like changed and we'll send you an updated quote.
              </p>
              <textarea
                value={revisionMessage}
                onChange={(e) => setRevisionMessage(e.target.value)}
                placeholder="Describe the changes you'd like..."
                rows={4}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: '10px',
                  border: '1px solid #e5e7eb', fontSize: '14px', fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none', lineHeight: 1.6,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ margin: '16px 0', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Best way to reach me:</span>
                <button
                  onClick={() => setContactPreference('sms')}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    border: contactPreference === 'sms' ? `2px solid ${BRAND}` : '1px solid #e5e7eb',
                    background: contactPreference === 'sms' ? `${BRAND}10` : '#fff',
                    color: contactPreference === 'sms' ? BRAND : '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  Text/SMS
                </button>
                <button
                  onClick={() => setContactPreference('email')}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    border: contactPreference === 'email' ? `2px solid ${BRAND}` : '1px solid #e5e7eb',
                    background: contactPreference === 'email' ? `${BRAND}10` : '#fff',
                    color: contactPreference === 'email' ? BRAND : '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  Email
                </button>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  onClick={handleRequestChanges}
                  disabled={submittingRevision || !revisionMessage.trim()}
                  style={{
                    flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                    background: BRAND, color: '#fff', fontSize: '15px', fontWeight: 600,
                    cursor: submittingRevision || !revisionMessage.trim() ? 'not-allowed' : 'pointer',
                    opacity: submittingRevision || !revisionMessage.trim() ? 0.6 : 1,
                  }}
                >
                  {submittingRevision ? 'Sending...' : 'Submit Request'}
                </button>
                <button
                  onClick={() => { setShowRevisionModal(false); setRevisionMessage(''); }}
                  style={{
                    padding: '14px 24px', borderRadius: '10px',
                    border: '1px solid #e5e7eb', background: '#fff',
                    color: '#6b7280', fontSize: '15px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PAYMENT SUCCESS BANNER (shown after Square redirect) */}
        {/* ================================================================ */}
        {(justPaid || isPaid) && (
          <div className="invoice-card no-print" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: '#dcfce7', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px 0' }}>
              {isPaid ? 'Payment Received' : 'Payment Processing'}
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
              {isPaid
                ? 'Thank you! Your payment has been confirmed.'
                : 'Your payment is being processed. This page will update shortly.'}
            </p>
          </div>
        )}

        {/* ================================================================ */}
        {/* PAYMENT OPTIONS (only if unpaid, invoice only) */}
        {/* ================================================================ */}
        {canPay && !paymentBlocked && !signOnly && !justPaid && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 20px 0' }}>
              Payment Options
            </h2>

            <div className="invoice-payment-options" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Cash option */}
              {cashDiscount > 0 && (
                <div style={{
                  padding: '24px',
                  borderRadius: '12px',
                  border: '2px solid #e5e7eb',
                  background: 'linear-gradient(135deg, #e8e9eb 0%, #f5f5f5 100%)',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    padding: '4px 12px',
                    background: `linear-gradient(135deg, #22c55e 0%, #15803d 100%)`,
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}>
                    SAVE {formatCurrency(cashSavings)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                      <line x1="12" y1="1" x2="12" y2="23"/>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Cash</span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{formatCurrency(cashTotal)}</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                    {cashDiscount}% cash discount applied
                  </div>
                </div>
              )}

              {/* Credit Card option */}
              <div
                onClick={handleCardPayment}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${BRAND}25`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                style={{
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Credit Card</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{formatCurrency(cardTotal)}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  Includes {ccFeePercent}% + {formatCurrency(ccFeeFlat)} processing fee
                </div>
              </div>

              {/* Paying at Counter option */}
              <div
                onClick={() => {
                  // Submit signature if captured, then show confirmation
                  if (signatureData || initialsData) {
                    fetch(`/api/invoice/${doc.public_token}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ initials_data: initialsData, signature_data: signatureData }),
                    }).catch(() => {});
                  }
                  setSignatureSaved(true);
                }}
                style={{
                  padding: '20px 24px',
                  borderRadius: '12px',
                  border: '1px dashed #d1d5db',
                  background: '#f9fafb',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#6b7280' }}>Paying at Counter</div>
                <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: 4 }}>Cash, Venmo, Zelle, or other method in person</div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PAID CONFIRMATION */}
        {/* ================================================================ */}
        {isPaid && (
          <div className="invoice-card" style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            marginBottom: '24px',
            border: '2px solid #22c55e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>Payment Received</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {doc.payment_method ? `Paid via ${doc.payment_method.toUpperCase()}` : 'Paid'}
                  {doc.payment_confirmed_at ? ` on ${formatDate(doc.payment_confirmed_at)}` : ''}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* WARRANTY & CARE INSTRUCTIONS — invoice only, never on quotes */}
        {/* ================================================================ */}
        {!isQuote && (() => {
          // Get warranty content: prefer snapshot frozen at creation, fallback to shop config for pre-migration invoices
          const warrantyContent: Record<string, ModuleContentBlock> = doc.warranty_content_snapshot || shop?.module_invoice_content || {};
          const activeModules = [...new Set(lineItems.map(li => li.module || 'auto_tint'))];
          const modulesWithContent = activeModules.filter(mod => warrantyContent[mod]);

          if (modulesWithContent.length === 0) return null;

          return (
            <div className="invoice-card" style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px 32px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              marginBottom: '24px',
            }}>
              {modulesWithContent.map((mod, modIdx) => {
                const content = warrantyContent[mod];
                if (!content) return null;
                const modColor = MODULE_COLORS[mod] || '#6b7280';

                return (
                  <div key={mod} style={{ marginTop: modIdx > 0 ? '20px' : 0, paddingTop: modIdx > 0 ? '20px' : 0, borderTop: modIdx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                    {/* Module sub-header — only shown when multiple modules have warranty content */}
                    {modulesWithContent.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ width: 4, height: 16, borderRadius: 2, background: modColor }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: modColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {MODULE_LABELS[mod] || mod}
                        </span>
                      </div>
                    )}

                    {/* Warranty text */}
                    {content.warranty_title && (
                      <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 12px 0' }}>
                        {content.warranty_title}
                      </h2>
                    )}
                    {content.warranty_text && (
                      <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: 1.7 }}>
                        {content.warranty_text.split('\n\n').map((para, i) => (
                          <p key={i} style={{ margin: '0 0 12px 0' }}>{para}</p>
                        ))}
                      </div>
                    )}

                    {/* No Fault / extended warranty */}
                    {content.no_fault_title && (
                      <p style={{ margin: '0 0 12px 0', fontWeight: 600, color: '#1a1a1a', fontSize: '14px' }}>
                        {content.no_fault_title}
                      </p>
                    )}
                    {content.no_fault_text && (
                      <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: 1.7 }}>
                        {content.no_fault_text.split('\n\n').map((para, i) => (
                          <p key={i} style={{ margin: '0 0 12px 0' }}>{para}</p>
                        ))}
                      </div>
                    )}

                    {/* Care instructions */}
                    {content.care_title && (
                      <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '16px', paddingTop: '16px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 10px 0' }}>
                          {content.care_title}
                        </h3>
                        {content.care_items && content.care_items.length > 0 && (
                          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.8 }}>
                            {content.care_items.map((item, i) => (
                              <p key={i} style={{ margin: i < content.care_items!.length - 1 ? '0 0 6px 0' : 0 }}>
                                {item}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ================================================================ */}
        {/* CONTACT SECTION */}
        {/* ================================================================ */}
        <div className="invoice-card" style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 20px 0' }}>
            Questions? Get in Touch
          </h2>
          <div className="invoice-contact-row" style={{ display: 'flex', gap: '16px' }}>
            <a
              href={`tel:+1${shopPhone.replace(/\D/g, '')}`}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                color: '#1a1a1a',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {formatPhone(shopPhone)}
            </a>
            <a
              href={`mailto:${shopEmail}`}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                color: '#1a1a1a',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {shopEmail}
            </a>
          </div>
        </div>

        {/* ================================================================ */}
        {/* TRUST BAR */}
        {/* ================================================================ */}
        <div className="invoice-trust-bar" style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '48px',
          padding: '24px 0',
          marginBottom: '24px',
        }}>
          {[
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, label: 'Secure Payment' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>, label: 'Licensed & Insured' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: '5-Star Rated' },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>
              {item.icon}
              {item.label}
            </div>
          ))}
        </div>

        {/* ================================================================ */}
        {/* FOOTER */}
        {/* ================================================================ */}
        <div style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px 0' }}>
            {brands && brands.length > 1
              ? brands.map(b => b.short_name || b.name).join(' | ')
              : shopName
            }
            {shopAddress ? ` | ${shopAddress}` : ''}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            <a href={`tel:+1${shopPhone.replace(/\D/g, '')}`} style={{ color: BRAND, fontSize: '13px', textDecoration: 'none' }}>Call or Text</a>
            <a href={`mailto:${shopEmail}`} style={{ color: BRAND, fontSize: '13px', textDecoration: 'none' }}>Email</a>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
