'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { StatusBadge, Button } from '@/app/components/dashboard';
import SignaturePad, { InitialsPad } from '@/app/components/SignaturePad';
import ServiceLineEditor, { type ServiceLine } from '../ServiceLineEditor';
import CollectPaymentModal from '../CollectPaymentModal';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

// ============================================================================
// COUNTER CHECKOUT PAGE
// Two-panel layout: invoice document (left) + control panel (right)
// Team shows the invoice to the customer on screen, controls payment on the right
// ============================================================================

const BRAND = '#dc2626';

interface Invoice {
  id: string;
  invoice_number: string;
  public_token: string;
  booking_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  class_keys: string | null;
  line_items_json: Array<{
    label?: string; filmName?: string; filmAbbrev?: string; shade?: string;
    price?: number; rollId?: string | null;
  }>;
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  deposit_paid: number;
  balance_due: number;
  cc_fee_percent: number;
  cc_fee_flat: number;
  cash_discount_percent: number;
  status: string;
  initials_data: string | null;
  signature_data: string | null;
  signed_at: string | null;
  payment_method: string | null;
  starting_total: number | null;
  upsell_amount: number | null;
  tip_amount: number | null;
  discount_note: string | null;
  payment_processor: string | null;
}

interface ShopConfig {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  cash_discount_percent?: number;
  checkout_flow_config: {
    signature_enabled?: boolean;
    signature_required?: boolean;
    signature_terms_text?: string;
    legality_acknowledgment_enabled?: boolean;
    legality_acknowledgment_required?: boolean;
    legality_acknowledgment_text?: string;
  };
  module_invoice_content?: Record<string, { warranty_title?: string; warranty_text?: string; no_fault_title?: string; no_fault_text?: string; care_title?: string; care_items?: string[] }>;
}

function formatCurrency(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }
function formatPhone(p: string | null) { if (!p) return ''; const d = p.replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p; }

export default function CounterCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Signature state
  const [initialsData, setInitialsData] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'idle' | 'signing' | 'sent' | 'done'>('idle');
  const [savingSignature, setSavingSignature] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState<{ includePayment: boolean } | null>(null);
  const [sendToPhone, setSendToPhone] = useState('');

  // Payment state
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [discountNote, setDiscountNote] = useState('');
  const [terminalDeviceId, setTerminalDeviceId] = useState<string | null>(null);

  // Checkout add-ons
  const [discountTypes, setDiscountTypes] = useState<Array<{ id: number; name: string; discount_type: string; discount_value: number; applies_to: string; include_warranty: boolean; enabled: boolean }>>([]);
  const [warrantyProducts, setWarrantyProducts] = useState<Array<{ id: number; name: string; coverage_years: number; enabled: boolean }>>([]);
  const [warrantyOptions, setWarrantyOptions] = useState<Array<{ id: number; warranty_product_id: number; name: string; price: number }>>([]);
  const [selectedDiscounts, setSelectedDiscounts] = useState<number[]>([]);
  const [selectedWarrantyOption, setSelectedWarrantyOption] = useState<number | null>(null);

  // Line item editing
  const [editingLines, setEditingLines] = useState(false);
  const [editableLines, setEditableLines] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    async function load() {
      const [invRes, configRes] = await Promise.all([
        fetch(`/api/documents/${invoiceId}`),
        fetch('/api/auto/settings'),
      ]);
      const invData = await invRes.json();
      const configData = await configRes.json();

      if (invData.id) {
        // Compose line_items_json from normalized line items for backward compat
        const lineItems = (invData.document_line_items || invData.line_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
        const composedInvoice = {
          ...invData,
          invoice_number: invData.doc_number || invData.invoice_number,
          line_items_json: lineItems.map((li: any) => ({
            label: li.description,
            price: li.line_total,
            filmName: li.custom_fields?.filmName,
            filmAbbrev: li.custom_fields?.filmAbbrev,
            filmId: li.custom_fields?.filmId,
            shade: li.custom_fields?.shade,
            shadeFront: li.custom_fields?.shadeFront,
            shadeRear: li.custom_fields?.shadeRear,
            rollId: li.custom_fields?.rollId,
            serviceKey: li.custom_fields?.serviceKey,
            module: li.module,
            _lineItemId: li.id,
          })),
          _normalized_line_items: lineItems,
        };
        setInvoice(composedInvoice);
        setInitialsData(invData.initials_data);
        setSignatureData(invData.signature_data);
        setEditableLines(composedInvoice.line_items_json.map((i: Record<string, unknown>) => ({ ...i })));
        if (invData.signature_data) setSignatureMode('done');
        if (invData.status === 'paid') setIsPaid(true);
      }
      if (configData.shopConfig) {
        setShopConfig({
          shop_name: configData.shopConfig.shop_name || '',
          shop_phone: configData.shopConfig.shop_phone || '',
          shop_address: configData.shopConfig.shop_address || '',
          cash_discount_percent: configData.shopConfig.cash_discount_percent || 0,
          checkout_flow_config: configData.shopConfig.checkout_flow_config || {},
          module_invoice_content: configData.shopConfig.module_invoice_content || {},
        });
      }
      if (configData.checkoutDiscountTypes) setDiscountTypes(configData.checkoutDiscountTypes.filter((d: { enabled: boolean }) => d.enabled));
      if (configData.warrantyProducts) setWarrantyProducts(configData.warrantyProducts.filter((w: { enabled: boolean }) => w.enabled));
      if (configData.warrantyProductOptions) setWarrantyOptions(configData.warrantyProductOptions);

      // Load terminal devices (if Square connected)
      try {
        const devRes = await fetch('/api/square/terminal/devices');
        const devData = await devRes.json();
        if (devData.devices?.length > 0) {
          setTerminalDeviceId(devData.devices[0].deviceId);
        }
      } catch { /* Square not connected or no devices */ }

      setLoading(false);
    }
    load();
  }, [invoiceId]);

  const sigConfig = shopConfig?.checkout_flow_config;
  const sigEnabled = sigConfig?.signature_enabled ?? false;
  const sigRequired = sigConfig?.signature_required ?? false;
  const legalEnabled = sigConfig?.legality_acknowledgment_enabled ?? false;
  const legalRequired = sigConfig?.legality_acknowledgment_required ?? false;

  const needsSignature = (sigEnabled && sigRequired && signatureMode !== 'done') ||
    (legalEnabled && legalRequired && signatureMode !== 'done');
  const paymentBlocked = needsSignature && signatureMode !== 'sent';

  if (loading) {
    return <div style={{ minHeight: isMobile ? '60vh' : '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.pageBg, color: COLORS.textMuted }}>Loading...</div>;
  }
  if (!invoice) {
    return <div style={{ minHeight: isMobile ? '60vh' : '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.pageBg, color: COLORS.textMuted }}>Invoice not found</div>;
  }

  const inv = invoice;
  const lineItems = inv.line_items_json || [];
  const vehicleStr = [inv.vehicle_year, inv.vehicle_make, inv.vehicle_model].filter(Boolean).join(' ');
  // Calculate warranty add-on first (needed for discount calc)
  const warrantyAmount = selectedWarrantyOption
    ? (warrantyOptions.find(o => o.id === selectedWarrantyOption)?.price || 0)
    : 0;

  // Calculate discount total from selected discounts
  // Each discount can apply to subtotal or balance_due, and may or may not include warranty
  const discountTotal = selectedDiscounts.reduce((sum, dId) => {
    const d = discountTypes.find(dt => dt.id === dId);
    if (!d) return sum;
    if (d.discount_type === 'dollar') return sum + d.discount_value;
    // Percentage discount — determine base amount
    let base: number;
    if (d.applies_to === 'subtotal') {
      base = inv.subtotal;
    } else {
      // balance_due = subtotal - booking discount - deposit
      base = inv.subtotal - (inv.discount_amount || 0) - (inv.deposit_paid || 0);
    }
    if (d.include_warranty) {
      base += warrantyAmount;
    }
    return sum + (base * d.discount_value / 100);
  }, 0);

  // Adjusted balance: original balance - checkout discounts + warranty
  const adjustedBalance = Math.max(0, inv.balance_due - discountTotal + warrantyAmount);
  const balanceDue = adjustedBalance;
  const ccFee = Math.round((balanceDue * ((inv.cc_fee_percent || 0) / 100) + (inv.cc_fee_flat || 0)) * 100) / 100;
  const cardTotal = balanceDue + ccFee;
  const cashDiscount = inv.cash_discount_percent || shopConfig?.cash_discount_percent || 0;
  const cashTotal = cashDiscount > 0 ? Math.round(balanceDue * (1 - cashDiscount / 100) * 100) / 100 : balanceDue;
  const shopName = shopConfig?.shop_name || '';

  async function handleSaveSignature() {
    setSavingSignature(true);
    await fetch('/api/auto/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, initials_data: initialsData, signature_data: signatureData, signed_at: new Date().toISOString(), signed_via: 'counter' }),
    });
    setSavingSignature(false);
    setSignatureMode('done');
  }

  async function handleSendSigningLink(includePayment: boolean) {
    const url = `${window.location.origin}/invoice/${inv.public_token}${includePayment ? '' : '?sign=true'}`;
    const firstName = inv.customer_name?.split(' ')[0] || '';
    const phone = sendToPhone || inv.customer_phone;
    const msg = includePayment
      ? `Hi ${firstName}, please review, sign and pay your invoice for your ${vehicleStr}: ${url}`
      : `Hi ${firstName}, please sign your invoice for your ${vehicleStr}: ${url}`;
    if (phone) {
      await fetch('/api/auto/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: msg }),
      }).catch(() => {});
    }
    setShowSendConfirm(null);
    setSignatureMode('sent');
  }

  async function handleMarkPaid(method: string) {
    setPaying(true);
    setPaymentMethod(method);

    // Build applied add-ons data
    const appliedDiscounts = selectedDiscounts.map(dId => {
      const d = discountTypes.find(dt => dt.id === dId);
      if (!d) return null;
      let amount: number;
      if (d.discount_type === 'dollar') {
        amount = d.discount_value;
      } else {
        let base = d.applies_to === 'subtotal' ? inv.subtotal : (inv.subtotal - (inv.discount_amount || 0) - (inv.deposit_paid || 0));
        if (d.include_warranty) base += warrantyAmount;
        amount = base * d.discount_value / 100;
      }
      return { discount_type_id: d.id, name: d.name, discount_type: d.discount_type, discount_value: d.discount_value, applies_to: d.applies_to, include_warranty: d.include_warranty, amount };
    }).filter(Boolean);

    const appliedWarranty = selectedWarrantyOption ? (() => {
      const opt = warrantyOptions.find(o => o.id === selectedWarrantyOption);
      const prod = warrantyProducts.find(w => opt && w.id === opt.warranty_product_id);
      return opt && prod ? { warranty_product_id: prod.id, option_id: opt.id, name: prod.name, option_name: opt.name, price: opt.price } : null;
    })() : null;

    const tip = parseFloat(tipAmount) || 0;
    const processor = ['cc'].includes(method) ? 'stripe' : method === 'cash' ? 'cash' : 'manual';

    await fetch('/api/auto/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: inv.id,
        status: 'paid',
        payment_method: method,
        payment_processor: processor,
        payment_confirmed_at: new Date().toISOString(),
        total_paid: balanceDue + tip,
        balance_due: 0,
        tip_amount: tip,
        discount_note: discountNote || null,
        applied_discounts: appliedDiscounts,
        applied_warranty: appliedWarranty,
      }),
    });
    setIsPaid(true);
    setPaying(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 'auto' : '100vh', background: '#f3f4f6' }}>
      {/* ================================================================ */}
      {/* LEFT: INVOICE DOCUMENT */}
      {/* ================================================================ */}
      <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? '16px' : isTablet ? '24px' : '32px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {/* Header Card */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 24, position: 'relative' }}>
            {!isMobile && <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '55%', height: '200%', background: `linear-gradient(135deg, ${BRAND} 0%, #b91c1c 100%)`, borderRadius: '50%', zIndex: 0 }} />}
            <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '20px' : '32px 40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 16 : 28 }}>
                <div>
                  <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: BRAND, letterSpacing: -0.5, lineHeight: 1.1 }}>FWT</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{shopName}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ background: BRAND, color: '#fff', padding: isMobile ? '6px 14px' : '8px 20px', borderRadius: 20, fontSize: isMobile ? 11 : 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {inv.invoice_number}
                  </div>
                  {isMobile && (
                    <div style={{
                      display: 'inline-block', padding: '6px 14px', borderRadius: 20,
                      background: isPaid ? 'linear-gradient(179deg, #22c55e 0%, #15803d 100%)' : 'linear-gradient(179deg, #ffffff 0%, #969696 40%)',
                      fontSize: 11, fontWeight: 600, color: isPaid ? '#fff' : '#1a1a1a',
                    }}>
                      {isPaid ? 'Paid' : 'Due'}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 32, maxWidth: isMobile ? '100%' : '60%' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Bill To</div>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{inv.customer_name}</div>
                  {inv.customer_email && <div style={{ fontSize: isMobile ? 13 : 14, color: '#6b7280' }}>{inv.customer_email}</div>}
                  {inv.customer_phone && <div style={{ fontSize: isMobile ? 13 : 14, color: '#6b7280' }}>{formatPhone(inv.customer_phone)}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Vehicle</div>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: '#1a1a1a' }}>{vehicleStr}</div>
                </div>
              </div>
              {/* Status */}
              {!isMobile && (
                <div style={{ position: 'absolute', top: '55%', right: '10%', transform: 'translateY(-50%)', textAlign: 'center', zIndex: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Status</div>
                  <div style={{
                    display: 'inline-block', padding: '10px 28px', borderRadius: 30,
                    background: isPaid ? 'linear-gradient(179deg, #22c55e 0%, #15803d 100%)' : 'linear-gradient(179deg, #ffffff 0%, #969696 40%)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 18, fontWeight: 600, color: isPaid ? '#fff' : '#1a1a1a',
                  }}>
                    {isPaid ? 'Paid' : 'Due'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '16px 20px' : '24px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 24 }}>
            <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, color: '#1a1a1a', margin: '0 0 20px 0' }}>Invoice Details</h2>
            {/* Service line items */}
            {lineItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{item.label || 'Service'}</span>
                  </div>
                  {(item.filmName || item.filmAbbrev) && (
                    <div style={{ fontSize: 14, color: '#6b7280', marginLeft: 16, marginBottom: 2 }}>{item.filmName || item.filmAbbrev}{item.shade ? ` ${item.shade}` : ''}</div>
                  )}
                  {item.rollId && <div style={{ fontSize: 12, color: '#9ca3af', marginLeft: 16 }}>Roll ID: {item.rollId}</div>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{formatCurrency(item.price || 0)}</div>
              </div>
            ))}

            {/* Warranty line item (if selected) */}
            {selectedWarrantyOption && (() => {
              const opt = warrantyOptions.find(o => o.id === selectedWarrantyOption);
              const prod = warrantyProducts.find(w => opt && w.id === opt.warranty_product_id);
              if (!opt || opt.price === 0) return null;
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill={BRAND} stroke="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{opt.name}</span>
                    </div>
                    {prod && <div style={{ fontSize: 12, color: '#9ca3af', marginLeft: 16 }}>{prod.name} - {prod.coverage_years}yr coverage</div>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{formatCurrency(opt.price)}</div>
                </div>
              );
            })()}

            {/* Totals */}
            <div style={{ marginTop: 20, borderTop: '2px solid #f3f4f6', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#6b7280' }}>Subtotal</span>
                <span style={{ fontSize: 14, color: '#1a1a1a' }}>{formatCurrency(inv.subtotal + warrantyAmount)}</span>
              </div>

              {/* Booking discount (from booking flow) */}
              {inv.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#22c55e' }}>Discount{inv.discount_code ? ` (${inv.discount_code})` : ''}</span>
                  <span style={{ fontSize: 14, color: '#22c55e' }}>-{formatCurrency(inv.discount_amount)}</span>
                </div>
              )}

              {/* Checkout discounts (selected during checkout) */}
              {selectedDiscounts.map(dId => {
                const d = discountTypes.find(dt => dt.id === dId);
                if (!d) return null;
                let amount: number;
                if (d.discount_type === 'dollar') {
                  amount = d.discount_value;
                } else {
                  let base = d.applies_to === 'subtotal' ? inv.subtotal : (inv.subtotal - (inv.discount_amount || 0) - (inv.deposit_paid || 0));
                  if (d.include_warranty) base += warrantyAmount;
                  amount = base * d.discount_value / 100;
                }
                return (
                  <div key={dId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: '#22c55e' }}>
                      {d.name} {d.discount_type === 'percent' ? `(${d.discount_value}%)` : ''}
                    </span>
                    <span style={{ fontSize: 14, color: '#22c55e' }}>-{formatCurrency(amount)}</span>
                  </div>
                );
              })}

              {inv.deposit_paid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#6b7280' }}>Deposit Paid</span>
                  <span style={{ fontSize: 14, color: '#22c55e' }}>-{formatCurrency(inv.deposit_paid)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>Balance Due</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: isPaid ? '#22c55e' : BRAND }}>{isPaid ? formatCurrency(0) : formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Warranty — dynamic per module, invoice only */}
          {(inv as any).doc_type !== 'quote' && (() => {
            const warrantyContent = (inv as any).warranty_content_snapshot || shopConfig?.module_invoice_content || {};
            const activeModules = [...new Set((lineItems || []).map((li: any) => li.module || 'auto_tint'))];
            const modulesWithContent = activeModules.filter(mod => warrantyContent[mod]);
            if (modulesWithContent.length === 0) return null;
            const MODULE_LABELS: Record<string, string> = { auto_tint: 'Window Tint', flat_glass: 'Flat Glass', detailing: 'Detailing', ceramic_coating: 'Ceramic Coating', ppf: 'Paint Protection Film', wraps: 'Vehicle Wraps' };
            return (
              <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '16px 20px' : '24px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 24 }}>
                {modulesWithContent.map((mod, i) => {
                  const content = warrantyContent[mod];
                  if (!content) return null;
                  return (
                    <div key={mod} style={{ marginTop: i > 0 ? 16 : 0, paddingTop: i > 0 ? 16 : 0, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                      {modulesWithContent.length > 1 && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{MODULE_LABELS[mod] || mod}</div>
                      )}
                      {content.warranty_title && <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 12px 0' }}>{content.warranty_title}</h2>}
                      {content.warranty_text && (
                        <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.7, marginBottom: 12 }}>
                          {content.warranty_text.split('\n\n').map((para: string, pi: number) => (
                            <p key={pi} style={{ margin: '0 0 8px 0' }}>{para}</p>
                          ))}
                        </div>
                      )}
                      {content.no_fault_title && (
                        <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#1a1a1a', fontSize: 14 }}>{content.no_fault_title}</p>
                      )}
                      {content.no_fault_text && (
                        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 12 }}>
                          {content.no_fault_text.split('\n\n').map((para: string, pi: number) => (
                            <p key={pi} style={{ margin: '0 0 6px 0' }}>{para}</p>
                          ))}
                        </div>
                      )}
                      {content.care_title && (
                        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px 0' }}>{content.care_title}</h3>
                          {content.care_items && content.care_items.length > 0 && (
                            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                              {content.care_items.map((item: string, ci: number) => (
                                <p key={ci} style={{ margin: ci < content.care_items.length - 1 ? '0 0 6px 0' : '0' }}>{item}</p>
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

          {/* Signature display (if signed) */}
          {signatureMode === 'done' && (signatureData || initialsData) && (
            <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '16px 20px' : '24px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px 0' }}>Customer Signature</h2>
              <div style={{ display: 'flex', gap: isMobile ? 16 : 24, flexWrap: isMobile ? 'wrap' as const : 'nowrap' as const }}>
                {initialsData && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Initials</div>
                    <img src={initialsData} alt="Initials" style={{ border: '1px solid #e5e7eb', borderRadius: 8, height: 60 }} />
                  </div>
                )}
                {signatureData && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Signature</div>
                    <img src={signatureData} alt="Signature" style={{ border: '1px solid #e5e7eb', borderRadius: 8, height: 80 }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* RIGHT: CONTROL PANEL */}
      {/* ================================================================ */}
      <div style={{
        width: isMobile ? '100%' : isTablet ? 340 : 380,
        flexShrink: 0, background: COLORS.pageBg,
        borderLeft: isMobile ? 'none' : `1px solid ${COLORS.borderAccent}`,
        borderTop: isMobile ? `1px solid ${COLORS.borderAccent}` : 'none',
        overflowY: isMobile ? 'visible' : 'auto',
        padding: isMobile ? SPACING.lg : SPACING.xxl,
        display: 'flex', flexDirection: 'column', gap: SPACING.lg,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>{inv.invoice_number}</div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Counter Checkout</div>
          </div>
          <button onClick={() => router.push('/appointments')} style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Quick summary */}
        <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.md, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{vehicleStr}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{inv.customer_name}</div>
            </div>
            <StatusBadge label={isPaid ? 'Paid' : 'Due'} variant={isPaid ? 'success' : 'warning'} />
          </div>
        </div>

        {/* Edit Invoice — structured service/film/shade editor */}
        {!isPaid && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
            <button
              onClick={() => setEditingLines(!editingLines)}
              style={{
                width: '100%', padding: `${SPACING.md}px ${SPACING.lg}px`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2">
                  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Edit Invoice</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
                style={{ transform: editingLines ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <path d="M4 6l4 4 4-4"/>
              </svg>
            </button>

            {editingLines && (
              <div style={{ padding: `0 ${SPACING.lg}px ${SPACING.lg}px`, borderTop: `1px solid ${COLORS.border}` }}>
                <ServiceLineEditor
                  initialLines={lineItems as ServiceLine[]}
                  vehicleYear={inv.vehicle_year}
                  vehicleMake={inv.vehicle_make}
                  vehicleModel={inv.vehicle_model}
                  classKeys={inv.class_keys}
                  onSave={async (lines, newSubtotal) => {
                    const startingTotal = inv.starting_total || inv.subtotal;
                    const upsellAmount = newSubtotal - startingTotal;
                    const newBalance = newSubtotal - (inv.discount_amount || 0) - (inv.deposit_paid || 0);
                    await fetch('/api/auto/invoices', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        id: inv.id,
                        line_items_json: lines,
                        subtotal: newSubtotal,
                        balance_due: Math.max(0, newBalance),
                        upsell_amount: upsellAmount > 0 ? upsellAmount : 0,
                      }),
                    });
                    // Refresh invoice
                    const res = await fetch(`/api/auto/invoices?id=${invoiceId}`);
                    const data = await res.json();
                    if (data.invoice) {
                      setInvoice(data.invoice);
                      setEditableLines(data.invoice.line_items_json.map((i: Record<string, unknown>) => ({ ...i })));
                    }
                    setEditingLines(false);
                  }}
                  onCancel={() => setEditingLines(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* ---- 1. DISCOUNTS ---- */}
        {!isPaid && discountTypes.length > 0 && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
              Apply Discount
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {discountTypes.map(d => {
                const isSelected = selectedDiscounts.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDiscounts(prev => isSelected ? prev.filter(id => id !== d.id) : [...prev, d.id])}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                      border: `1px solid ${isSelected ? COLORS.success : COLORS.borderInput}`,
                      background: isSelected ? `${COLORS.success}10` : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 3,
                        border: `2px solid ${isSelected ? COLORS.success : COLORS.borderInput}`,
                        background: isSelected ? COLORS.success : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M2 5l2 2 4-4"/></svg>}
                      </div>
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.success }}>
                      -{d.discount_type === 'percent' ? `${d.discount_value}%` : formatCurrency(d.discount_value)}
                    </span>
                  </button>
                );
              })}
            </div>
            {discountTotal > 0 && (
              <div style={{ marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Discount total</span>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.success }}>-{formatCurrency(discountTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* Warranty Section */}
        {!isPaid && warrantyProducts.length > 0 && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
              {warrantyProducts[0]?.name || 'Warranty'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warrantyOptions
                .filter(o => warrantyProducts.some(w => w.id === o.warranty_product_id))
                .map(opt => {
                  const isSelected = selectedWarrantyOption === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedWarrantyOption(isSelected ? null : opt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                        border: `1px solid ${isSelected ? COLORS.red : COLORS.borderInput}`,
                        background: isSelected ? `${COLORS.red}10` : 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: `2px solid ${isSelected ? COLORS.red : COLORS.borderInput}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.red }} />}
                        </div>
                        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{opt.name}</span>
                      </div>
                      <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: opt.price > 0 ? COLORS.red : COLORS.textMuted }}>
                        {opt.price > 0 ? formatCurrency(opt.price) : '$0'}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Adjusted total summary */}
        {!isPaid && (discountTotal > 0 || warrantyAmount > 0) && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.md, border: `1px solid ${COLORS.border}` }}>
            {discountTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.success }}>Discounts</span>
                <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.success }}>-{formatCurrency(discountTotal)}</span>
              </div>
            )}
            {warrantyAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Warranty</span>
                <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>+{formatCurrency(warrantyAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
              <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>Adjusted Balance</span>
              <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.red }}>{formatCurrency(balanceDue)}</span>
            </div>
          </div>
        )}

        {/* ---- 4. SIGNATURE (after discounts/warranty, before payment) ---- */}
        {(sigEnabled || legalEnabled) && !isPaid && signatureMode !== 'done' && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
              Customer Signature
              {(sigRequired || legalRequired) && <span style={{ color: COLORS.warning, marginLeft: 8, fontSize: FONT.sizeXs }}>Required</span>}
            </div>

            {signatureMode === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                <ControlButton icon={<PenIcon />} color="#8b5cf6" label="Sign Here" desc="Customer signs on this screen" onClick={() => setSignatureMode('signing')} />
                <ControlButton icon={<PhoneIcon />} color="#3b82f6" label="Send to Phone (Sign Only)" desc="Customer signs, pay at counter" onClick={() => { setSendToPhone(inv.customer_phone || ''); setShowSendConfirm({ includePayment: false }); }} />
                <ControlButton icon={<SendIcon />} color="#22c55e" label="Send to Phone (Sign + Pay)" desc="Customer signs and pays on phone" onClick={() => { setSendToPhone(inv.customer_phone || ''); setShowSendConfirm({ includePayment: true }); }} />
                {!sigRequired && !legalRequired && (
                  <button onClick={() => setSignatureMode('done')} style={{ padding: 8, border: 'none', background: 'transparent', color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer' }}>Skip</button>
                )}
              </div>
            )}

            {/* Signing mode renders as a full-screen modal -- see below */}

            {signatureMode === 'sent' && (
              <SignaturePolling
                invoiceId={inv.id}
                onComplete={(sigData, initData) => {
                  setSignatureData(sigData);
                  setInitialsData(initData);
                  setSignatureMode('done');
                }}
                onCancel={() => setSignatureMode('idle')}
              />
            )}
          </div>
        )}

        {/* Signature done indicator */}
        {(sigEnabled || legalEnabled) && signatureMode === 'done' && !isPaid && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: `${SPACING.sm}px ${SPACING.md}px`, background: `${COLORS.success}10`, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.success}30` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.success }}>Signature captured</span>
          </div>
        )}

        {/* Payment blocked notice */}
        {paymentBlocked && signatureMode === 'idle' && (
          <div style={{ padding: SPACING.md, borderRadius: RADIUS.md, background: `${COLORS.warning}10`, border: `1px solid ${COLORS.warning}30`, display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.warning} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.warning }}>Signature required before payment</span>
          </div>
        )}

        {/* Tip + Discount Note */}
        {!isPaid && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: SPACING.sm }}>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Tip</div>
                <input
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  type="number"
                  placeholder="$0"
                  style={{ width: '100%', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: isMobile ? '10px 12px' : '6px 8px', fontSize: FONT.sizeSm, outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Discount Note</div>
                <input
                  value={discountNote}
                  onChange={e => setDiscountNote(e.target.value)}
                  placeholder="e.g. Cash 5% Off Applied"
                  style={{ width: '100%', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, padding: isMobile ? '10px 12px' : '6px 8px', fontSize: FONT.sizeSm, outline: 'none' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ---- 5. PAYMENT ---- */}
        {!isPaid && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, opacity: paymentBlocked ? 0.4 : 1, pointerEvents: paymentBlocked ? 'none' : 'auto' }}>
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={paying}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: RADIUS.md,
                background: '#22c55e', border: 'none', color: '#fff',
                fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                minHeight: 56,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              Collect Payment -- {formatCurrency(balanceDue)}
            </button>
            {cashDiscount > 0 && (
              <div style={{ fontSize: FONT.sizeXs, color: '#22c55e', textAlign: 'center', marginTop: 6 }}>
                Cash discount available: {cashDiscount}% off
              </div>
            )}
            {ccFee > 0 && (
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textAlign: 'center', marginTop: cashDiscount > 0 ? 2 : 6 }}>
                CC fee applies: {formatCurrency(ccFee)}
              </div>
            )}
          </div>
        )}

        {/* Paid */}
        {isPaid && (
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `2px solid ${COLORS.success}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div>
                <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.success }}>Payment Collected</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>via {paymentMethod?.toUpperCase() || inv.payment_method?.toUpperCase() || 'N/A'}</div>
              </div>
            </div>
            <button
              onClick={async () => {
                // Void the payment -- reset document to unpaid
                await fetch('/api/auto/invoices', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: inv.id, status: 'invoiced', payment_method: null,
                    payment_processor: null, payment_confirmed_at: null,
                    total_paid: 0, balance_due: inv.subtotal - (inv.discount_amount || 0) - (inv.deposit_paid || 0),
                    tip_amount: 0,
                  }),
                });
                setIsPaid(false);
                setPaymentMethod(null);
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: RADIUS.sm,
                background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
                marginTop: SPACING.sm,
              }}
            >
              Void Payment
            </button>
          </div>
        )}

        {/* Collect Payment Modal */}
        {showPaymentModal && (
          <CollectPaymentModal
            documentId={inv.id}
            balanceDue={balanceDue}
            ccFeePercent={inv.cc_fee_percent || 0}
            ccFeeFlat={inv.cc_fee_flat || 0}
            cashDiscountPercent={cashDiscount}
            tipAmount={parseFloat(tipAmount) || 0}
            discountNote={discountNote || null}
            appliedDiscounts={selectedDiscounts.length > 0 ? selectedDiscounts.map(dId => {
              const d = discountTypes.find(dt => dt.id === dId);
              if (!d) return null;
              let amount: number;
              if (d.discount_type === 'dollar') { amount = d.discount_value; }
              else { let base = d.applies_to === 'subtotal' ? inv.subtotal : balanceDue; amount = base * d.discount_value / 100; }
              return { discount_type_id: d.id, name: d.name, discount_type: d.discount_type, discount_value: d.discount_value, amount };
            }).filter(Boolean) : null}
            appliedWarranty={selectedWarrantyOption ? (() => {
              const opt = warrantyOptions.find(o => o.id === selectedWarrantyOption);
              const prod = warrantyProducts.find(w => opt && w.id === opt.warranty_product_id);
              return opt && prod ? { warranty_product_id: prod.id, option_id: opt.id, name: prod.name, option_name: opt.name, price: opt.price } : null;
            })() : null}
            terminalDeviceId={terminalDeviceId}
            onPaymentComplete={(payments) => {
              setShowPaymentModal(false);
              setIsPaid(true);
              setPaymentMethod(payments.map(p => p.method).join('+'));
            }}
            onClose={() => setShowPaymentModal(false)}
          />
        )}

        {/* Back button */}
        <button onClick={() => router.push('/appointments')} style={{
          padding: isMobile ? 16 : 12, borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderInput}`,
          background: 'transparent', color: COLORS.textMuted, fontSize: FONT.sizeSm,
          cursor: 'pointer', textAlign: 'center', marginTop: isMobile ? SPACING.md : 'auto',
          marginBottom: isMobile ? SPACING.lg : 0,
        }}>
          Back to Appointments
        </button>
      </div>

      {/* ================================================================ */}
      {/* SEND SIGNING LINK CONFIRMATION MODAL */}
      {/* ================================================================ */}
      {showSendConfirm && (
        <>
          <div onClick={() => setShowSendConfirm(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999, width: '90%', maxWidth: 400,
            background: COLORS.cardBg, borderRadius: RADIUS.xl, padding: SPACING.xl,
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)', border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.lg }}>
              {showSendConfirm.includePayment ? 'Send Sign + Pay Link' : 'Send Signing Link'}
            </div>

            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Send to:
            </div>

            <div style={{ marginBottom: SPACING.lg }}>
              <input
                type="tel"
                value={sendToPhone}
                onChange={e => setSendToPhone(e.target.value)}
                placeholder="Phone number"
                style={{
                  width: '100%', padding: '14px 16px', fontSize: FONT.sizeBase,
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              {inv.customer_phone && sendToPhone !== inv.customer_phone && (
                <button onClick={() => setSendToPhone(inv.customer_phone || '')} style={{
                  marginTop: SPACING.xs, padding: 0, background: 'none', border: 'none',
                  color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer', textDecoration: 'underline',
                }}>
                  Reset to {inv.customer_phone}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button onClick={() => handleSendSigningLink(showSendConfirm.includePayment)}
                disabled={!sendToPhone}
                style={{
                  flex: 1, padding: 14, borderRadius: RADIUS.md, border: 'none',
                  background: sendToPhone ? (showSendConfirm.includePayment ? '#22c55e' : '#3b82f6') : COLORS.inputBg,
                  color: sendToPhone ? '#fff' : COLORS.textMuted,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, cursor: sendToPhone ? 'pointer' : 'not-allowed',
                }}>
                Send
              </button>
              <button onClick={() => setShowSendConfirm(null)} style={{
                padding: '14px 20px', borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.borderInput}`, background: 'transparent',
                color: COLORS.textMuted, fontSize: FONT.sizeSm, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* SIGNATURE MODAL -- large centered for in-person tablet signing */}
      {/* ================================================================ */}
      {signatureMode === 'signing' && (
        <>
          <div onClick={() => { setSignatureMode('idle'); setInitialsData(null); setSignatureData(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />
          <div style={{
            position: 'fixed', top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            zIndex: 9999, width: isMobile ? '100%' : '90%', maxWidth: isMobile ? '100%' : 600,
            height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '90vh', overflowY: 'auto',
            background: '#ffffff', borderRadius: isMobile ? 0 : 16, padding: isMobile ? 20 : 32,
            boxShadow: isMobile ? 'none' : '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>Customer Signature</div>
              <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>{inv.customer_name} -- {vehicleStr}</div>
            </div>

            {legalEnabled && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, padding: 12, background: '#f9fafb', borderRadius: 8, marginBottom: 12, border: '1px solid #e5e7eb' }}>
                  {sigConfig?.legality_acknowledgment_text || 'I acknowledge the legal terms.'}
                </div>
                <InitialsPad label="Customer Initials" value={initialsData} onChange={setInitialsData} disabled={savingSignature} />
              </div>
            )}

            {sigEnabled && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6, padding: 12, background: '#f9fafb', borderRadius: 8, marginBottom: 12, border: '1px solid #e5e7eb', maxHeight: 80, overflowY: 'auto' }}>
                  {sigConfig?.signature_terms_text || 'I accept the terms stated above.'}
                </div>
                <SignaturePad
                  label="Sign Below"
                  value={signatureData}
                  onChange={setSignatureData}
                  disabled={savingSignature}
                  penColor="#1a1a1a"
                  width={isMobile ? 280 : 520}
                  height={isMobile ? 160 : 200}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={handleSaveSignature}
                disabled={savingSignature || (legalRequired && !initialsData) || (sigRequired && !signatureData)}
                style={{
                  flex: 1, padding: 16, borderRadius: 10, border: 'none',
                  background: (legalRequired && !initialsData) || (sigRequired && !signatureData) ? '#e5e7eb' : '#8b5cf6',
                  color: (legalRequired && !initialsData) || (sigRequired && !signatureData) ? '#9ca3af' : '#fff',
                  fontSize: 16, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {savingSignature ? 'Saving...' : 'Confirm Signature'}
              </button>
              <button
                onClick={() => { setSignatureMode('idle'); setInitialsData(null); setSignatureData(null); }}
                style={{
                  padding: '16px 24px', borderRadius: 10, border: '1px solid #d1d5db',
                  background: '#fff', color: '#666', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function ControlButton({ icon, color, label, desc, onClick }: { icon: React.ReactNode; color: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '12px 14px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderInput}`, background: COLORS.cardBg, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: SPACING.md }}>
      <div style={{ width: 32, height: 32, borderRadius: RADIUS.sm, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{label}</div>
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{desc}</div>
      </div>
    </button>
  );
}

function PayBtn({ label, amount, detail, color, loading, disabled, onClick }: { label: string; amount: number; detail?: string; color: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: RADIUS.md, border: `1px solid ${color}30`, background: `${color}08`, cursor: disabled ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s', minHeight: 48 }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{loading ? 'Processing...' : label}</div>
        {detail && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{detail}</div>}
      </div>
      <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color }}>{formatCurrency(amount)}</div>
    </button>
  );
}

function PenIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>; }
function PhoneIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/></svg>; }
function SendIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>; }

// ============================================================================
// SIGNATURE POLLING -- polls the invoice for remote signature completion
// ============================================================================
function SignaturePolling({ invoiceId, onComplete, onCancel }: {
  invoiceId: string;
  onComplete: (sigData: string | null, initData: string | null) => void;
  onCancel: () => void;
}) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auto/invoices?id=${invoiceId}`);
        const data = await res.json();
        const inv = Array.isArray(data) ? data[0] : data.invoice || data;
        if (inv?.signature_data || inv?.signed_at) {
          onComplete(inv.signature_data || null, inv.initials_data || null);
        }
      } catch { /* silent */ }
    }, 3000);

    return () => { clearInterval(dotInterval); clearInterval(pollInterval); };
  }, [invoiceId, onComplete]);

  return (
    <div style={{ textAlign: 'center', padding: SPACING.lg }}>
      <div style={{ marginBottom: SPACING.md }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32, animation: 'spin 2s linear infinite' }}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.11 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
        </svg>
      </div>
      <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
        Waiting for customer{dots}
      </div>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
        This will update automatically when the customer signs
      </div>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' }} />
      <button onClick={onCancel} style={{
        marginTop: SPACING.lg, padding: '8px 16px', borderRadius: RADIUS.sm,
        border: `1px solid ${COLORS.borderInput}`, background: 'transparent',
        color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
      }}>
        Try Another Method
      </button>
    </div>
  );
}
