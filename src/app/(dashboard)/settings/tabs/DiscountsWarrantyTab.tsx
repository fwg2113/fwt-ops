'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onAdd: (table: string, data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDelete: (table: string, id: number) => Promise<boolean>;
  onRefresh: () => void;
}

interface DiscountType {
  id: number;
  name: string;
  description: string | null;
  discount_type: 'percent' | 'dollar';
  discount_value: number;
  applies_to: 'subtotal' | 'balance_due';
  include_warranty: boolean;
  stackable: boolean;
  requires_verification: boolean;
  enabled: boolean;
  sort_order: number;
}

interface WarrantyProduct {
  id: number;
  name: string;
  description: string | null;
  terms_text: string | null;
  coverage_years: number;
  enabled: boolean;
  sort_order: number;
}

interface WarrantyOption {
  id: number;
  warranty_product_id: number;
  name: string;
  price: number;
  sort_order: number;
}

export default function DiscountsWarrantyTab({ data, onSave, onAdd, onDelete, onRefresh }: Props) {
  const discounts = (data.checkoutDiscountTypes || []) as DiscountType[];
  const warranties = (data.warrantyProducts || []) as WarrantyProduct[];
  const warrantyOptions = (data.warrantyProductOptions || []) as WarrantyOption[];

  // Editing states
  const [editingDiscount, setEditingDiscount] = useState<number | null>(null);
  const [editingWarranty, setEditingWarranty] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Addon discount settings from shop_config
  const config = data.shopConfig as Record<string, unknown> || {};
  const [addonDiscountEnabled, setAddonDiscountEnabled] = useState(config.addon_discount_enabled !== false);
  const [addonDiscountPercent, setAddonDiscountPercent] = useState(String(config.addon_discount_percent || '10'));
  const [addonExcludedFilms, setAddonExcludedFilms] = useState<string[]>((config.addon_discount_excluded_films as string[]) || []);
  const films = (data.films || []) as { id: number; name: string; offered: boolean }[];
  const [addonPromoText, setAddonPromoText] = useState(String(config.addon_discount_promo_text || ''));
  const [addonDisclaimer, setAddonDisclaimer] = useState(String(config.addon_discount_disclaimer || ''));
  const [addonSaving, setAddonSaving] = useState(false);
  const [addonSaved, setAddonSaved] = useState(false);

  // Auto-generate default promo text when percentage changes
  function handlePercentChange(val: string) {
    setAddonDiscountPercent(val);
    const pct = parseInt(val) || 10;
    const defaultText = `Save ${pct}% on ALL Add-On Services - Online Only`;
    // Only auto-update if the promo text matches a previously auto-generated pattern
    if (!addonPromoText || /^Save \d+% on ALL Add-On Services/.test(addonPromoText)) {
      setAddonPromoText(defaultText);
    }
  }

  async function saveAddonSettings() {
    setAddonSaving(true);
    const success = await onSave('shop_config', null, {
      addon_discount_enabled: addonDiscountEnabled,
      addon_discount_percent: parseFloat(addonDiscountPercent) || 10,
      addon_discount_excluded_films: addonExcludedFilms,
      addon_discount_promo_text: addonPromoText || null,
      addon_discount_disclaimer: addonDisclaimer || null,
    });
    setAddonSaving(false);
    if (success) { setAddonSaved(true); setTimeout(() => setAddonSaved(false), 2000); }
  }

  // New discount form
  const [newDiscountName, setNewDiscountName] = useState('');
  const [newDiscountType, setNewDiscountType] = useState<'percent' | 'dollar'>('percent');
  const [newDiscountValue, setNewDiscountValue] = useState('');
  const [newDiscountDesc, setNewDiscountDesc] = useState('');
  const [newDiscountAppliesTo, setNewDiscountAppliesTo] = useState('balance_due');
  const [newDiscountIncludeWarranty, setNewDiscountIncludeWarranty] = useState(false);

  // New warranty form
  const [newWarrantyName, setNewWarrantyName] = useState('');
  const [newWarrantyDesc, setNewWarrantyDesc] = useState('');
  const [newWarrantyYears, setNewWarrantyYears] = useState('3');
  const [newWarrantyTerms, setNewWarrantyTerms] = useState('');

  // New warranty option form
  const [newOptionWarrantyId, setNewOptionWarrantyId] = useState<number | null>(null);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState('');

  async function addDiscount() {
    if (!newDiscountName.trim() || !newDiscountValue) return;
    setSaving(true);
    await onAdd('checkout_discount_types', {
      name: newDiscountName.trim(),
      description: newDiscountDesc.trim() || null,
      discount_type: newDiscountType,
      discount_value: parseFloat(newDiscountValue),
      applies_to: newDiscountAppliesTo,
      include_warranty: newDiscountIncludeWarranty,
      sort_order: discounts.length + 1,
    });
    setNewDiscountName('');
    setNewDiscountValue('');
    setNewDiscountDesc('');
    setSaving(false);
    onRefresh();
  }

  async function addWarranty() {
    if (!newWarrantyName.trim()) return;
    setSaving(true);
    await onAdd('warranty_products', {
      name: newWarrantyName.trim(),
      description: newWarrantyDesc.trim() || null,
      terms_text: newWarrantyTerms.trim() || null,
      coverage_years: parseInt(newWarrantyYears) || 3,
      sort_order: warranties.length + 1,
    });
    setNewWarrantyName('');
    setNewWarrantyDesc('');
    setNewWarrantyTerms('');
    setNewWarrantyYears('3');
    setSaving(false);
    onRefresh();
  }

  async function addWarrantyOption() {
    if (!newOptionWarrantyId || !newOptionName.trim()) return;
    setSaving(true);
    const options = warrantyOptions.filter(o => o.warranty_product_id === newOptionWarrantyId);
    await onAdd('warranty_product_options', {
      warranty_product_id: newOptionWarrantyId,
      name: newOptionName.trim(),
      price: parseFloat(newOptionPrice) || 0,
      sort_order: options.length + 1,
    });
    setNewOptionName('');
    setNewOptionPrice('');
    setSaving(false);
    onRefresh();
  }

  async function toggleDiscount(id: number, enabled: boolean) {
    await onSave('checkout_discount_types', id, { enabled });
    onRefresh();
  }

  async function toggleWarranty(id: number, enabled: boolean) {
    await onSave('warranty_products', id, { enabled });
    onRefresh();
  }

  async function deleteDiscount(id: number) {
    await onDelete('checkout_discount_types', id);
    onRefresh();
  }

  async function deleteWarrantyOption(id: number) {
    await onDelete('warranty_product_options', id);
    onRefresh();
  }

  async function deleteWarranty(id: number) {
    await onDelete('warranty_products', id);
    onRefresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* ================================================================ */}
      {/* ADDON DISCOUNT (BOOKING PAGE) */}
      {/* ================================================================ */}
      <DashboardCard
        title="Add-On Service Discount (Booking Page)"
        actions={
          <Button variant="primary" size="sm" onClick={saveAddonSettings} disabled={addonSaving}
            style={addonSaved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
            {addonSaving ? 'Saving...' : addonSaved ? 'Saved' : 'Save'}
          </Button>
        }
      >
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                Enable Add-On Discount
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                Shows discount badges and promotional text on the booking page for secondary services
              </div>
            </div>
            <button
              onClick={() => setAddonDiscountEnabled(!addonDiscountEnabled)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: addonDiscountEnabled ? COLORS.red : COLORS.border,
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: addonDiscountEnabled ? 23 : 3,
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </div>

        {addonDiscountEnabled && (
          <>
            <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', marginBottom: SPACING.md }}>
              <div style={{ width: 120 }}>
                <FormField label="Discount %">
                  <TextInput
                    type="number"
                    value={addonDiscountPercent}
                    onChange={e => handlePercentChange(e.target.value)}
                    min="0" max="100" step="1"
                  />
                </FormField>
              </div>
            </div>
            <div style={{ marginBottom: SPACING.md }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>Excluded Films (discount will NOT apply to these)</div>
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                {films.filter(f => f.offered).map(film => {
                  const isExcluded = addonExcludedFilms.includes(film.name);
                  return (
                    <button
                      key={film.id}
                      onClick={() => {
                        setAddonExcludedFilms(prev =>
                          isExcluded ? prev.filter(n => n !== film.name) : [...prev, film.name]
                        );
                      }}
                      style={{
                        padding: '4px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                        background: isExcluded ? COLORS.dangerBg : 'transparent',
                        color: isExcluded ? COLORS.danger : COLORS.textMuted,
                        border: `1px solid ${isExcluded ? COLORS.danger : COLORS.borderInput}`,
                        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                      }}
                    >
                      {film.name} {isExcluded ? '(excluded)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
            <FormField label="Promo Badge Text" hint="Shown as a badge above the add-on services section">
              <TextInput
                value={addonPromoText}
                onChange={e => setAddonPromoText(e.target.value)}
                placeholder="e.g. Save 10% on ALL Add-On Services - Online Only"
              />
            </FormField>
            <FormField label="Disclaimer Text" hint="Shown below the badge. Supports HTML (bold, etc.)">
              <textarea
                value={addonDisclaimer}
                onChange={e => setAddonDisclaimer(e.target.value)}
                rows={3}
                placeholder="e.g. Offer valid via ONLINE BOOKING ONLY..."
                style={{
                  width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none',
                }}
              />
            </FormField>
          </>
        )}
      </DashboardCard>

      {/* ================================================================ */}
      {/* DISCOUNT TYPES */}
      {/* ================================================================ */}
      <DashboardCard title="Checkout Discounts" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Discounts your team can apply during checkout. Each discount reduces the invoice total.
        </div>

        {/* Existing discounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.lg }}>
          {discounts.map(d => {
            const isEditing = editingDiscount === d.id;
            return (
              <DiscountRow
                key={d.id}
                discount={d}
                isEditing={isEditing}
                onToggle={v => toggleDiscount(d.id, v)}
                onEdit={() => setEditingDiscount(isEditing ? null : d.id)}
                onSave={async (updates) => {
                  await onSave('checkout_discount_types', d.id, updates);
                  setEditingDiscount(null);
                  onRefresh();
                }}
                onDelete={() => deleteDiscount(d.id)}
              />
            );
          })}
          {discounts.length === 0 && (
            <div style={{ padding: SPACING.lg, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
              No discounts configured. Add one below.
            </div>
          )}
        </div>

        {/* Add discount form */}
        <div style={{
          padding: SPACING.lg, background: COLORS.cardBg, borderRadius: RADIUS.md,
          border: `1px dashed ${COLORS.borderInput}`,
        }}>
          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.md }}>
            Add Discount
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            <FormField label="Name"><TextInput value={newDiscountName} onChange={e => setNewDiscountName(e.target.value)} placeholder="Military Discount" /></FormField>
            <FormField label="Type">
              <SelectInput value={newDiscountType} onChange={e => setNewDiscountType(e.target.value as 'percent' | 'dollar')}>
                <option value="percent">Percent (%)</option>
                <option value="dollar">Dollar ($)</option>
              </SelectInput>
            </FormField>
            <FormField label="Value"><TextInput value={newDiscountValue} onChange={e => setNewDiscountValue(e.target.value)} placeholder="10" type="number" /></FormField>
          </div>
          <FormField label="Description (optional)"><TextInput value={newDiscountDesc} onChange={e => setNewDiscountDesc(e.target.value)} placeholder="Active duty and veterans" /></FormField>
          {newDiscountType === 'percent' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm, marginTop: SPACING.sm }}>
              <FormField label="Apply percentage to">
                <SelectInput value={newDiscountAppliesTo} onChange={e => setNewDiscountAppliesTo(e.target.value)}>
                  <option value="balance_due">Balance Due (after deposit)</option>
                  <option value="subtotal">Subtotal (before deposit)</option>
                </SelectInput>
              </FormField>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
                  <div onClick={() => setNewDiscountIncludeWarranty(!newDiscountIncludeWarranty)} style={{
                    width: 16, height: 16, borderRadius: 3,
                    border: `2px solid ${newDiscountIncludeWarranty ? COLORS.red : COLORS.borderInput}`,
                    background: newDiscountIncludeWarranty ? COLORS.red : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {newDiscountIncludeWarranty && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M2 5l2 2 4-4"/></svg>}
                  </div>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>Include warranty in discount</span>
                </label>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.md }}>
            <Button variant="primary" size="sm" onClick={addDiscount} disabled={saving || !newDiscountName.trim() || !newDiscountValue}>
              Add Discount
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* ================================================================ */}
      {/* WARRANTY PRODUCTS */}
      {/* ================================================================ */}
      <DashboardCard title="In-House Warranty Products" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      }>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
          Warranty products your team can upsell during checkout. Each option adds to the invoice total.
        </div>

        {/* Existing warranties */}
        {warranties.map(w => {
          const options = warrantyOptions.filter(o => o.warranty_product_id === w.id);
          return (
            <div key={w.id} style={{
              padding: SPACING.lg, background: COLORS.inputBg, borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderInput}`, marginBottom: SPACING.md,
              opacity: w.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
                <Toggle checked={w.enabled} onChange={v => toggleWarranty(w.id, v)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{w.name}</div>
                  {w.description && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{w.description}</div>}
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPlaceholder, marginTop: 2 }}>{w.coverage_years} year coverage</div>
                </div>
                <button onClick={() => deleteWarranty(w.id)} style={{
                  background: 'transparent', border: `1px solid ${COLORS.danger}30`,
                  color: COLORS.danger, padding: '4px 12px', borderRadius: RADIUS.sm,
                  fontSize: FONT.sizeXs, cursor: 'pointer',
                }}>
                  Remove
                </button>
              </div>

              {/* Warranty terms */}
              {w.terms_text && (
                <div style={{
                  fontSize: FONT.sizeXs, color: COLORS.textMuted, lineHeight: 1.6,
                  padding: SPACING.sm, background: COLORS.cardBg, borderRadius: RADIUS.sm,
                  marginBottom: SPACING.md, border: `1px solid ${COLORS.border}`,
                }}>
                  {w.terms_text}
                </div>
              )}

              {/* Options list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: SPACING.md }}>
                {options.map(opt => (
                  <div key={opt.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACING.sm}px ${SPACING.md}px`,
                    background: COLORS.cardBg, borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{opt.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                      <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: opt.price > 0 ? COLORS.red : COLORS.textMuted }}>
                        ${opt.price}
                      </span>
                      <button onClick={() => deleteWarrantyOption(opt.id)} style={{
                        background: 'transparent', border: 'none', color: COLORS.textMuted,
                        cursor: 'pointer', padding: 2, fontSize: FONT.sizeXs,
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add option */}
              <div style={{ display: 'flex', gap: SPACING.sm }}>
                <TextInput value={newOptionWarrantyId === w.id ? newOptionName : ''} onChange={e => { setNewOptionWarrantyId(w.id); setNewOptionName(e.target.value); }} placeholder="Option name" style={{ flex: 1 }} />
                <TextInput value={newOptionWarrantyId === w.id ? newOptionPrice : ''} onChange={e => { setNewOptionWarrantyId(w.id); setNewOptionPrice(e.target.value); }} placeholder="$" type="number" style={{ width: 80 }} />
                <Button variant="secondary" size="sm" onClick={() => { setNewOptionWarrantyId(w.id); addWarrantyOption(); }} disabled={saving || !newOptionName.trim() || newOptionWarrantyId !== w.id}>
                  Add
                </Button>
              </div>
            </div>
          );
        })}

        {warranties.length === 0 && (
          <div style={{ padding: SPACING.lg, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm, marginBottom: SPACING.lg }}>
            No warranty products configured. Add one below.
          </div>
        )}

        {/* Add warranty form */}
        <div style={{
          padding: SPACING.lg, background: COLORS.cardBg, borderRadius: RADIUS.md,
          border: `1px dashed ${COLORS.borderInput}`,
        }}>
          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.md }}>
            Add Warranty Product
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            <FormField label="Name"><TextInput value={newWarrantyName} onChange={e => setNewWarrantyName(e.target.value)} placeholder="No Fault Warranty" /></FormField>
            <FormField label="Coverage Years"><TextInput value={newWarrantyYears} onChange={e => setNewWarrantyYears(e.target.value)} type="number" /></FormField>
          </div>
          <FormField label="Description"><TextInput value={newWarrantyDesc} onChange={e => setNewWarrantyDesc(e.target.value)} placeholder="Brief description shown during checkout" /></FormField>
          <FormField label="Terms Text">
            <textarea
              value={newWarrantyTerms}
              onChange={e => setNewWarrantyTerms(e.target.value)}
              placeholder="Full warranty terms shown on the invoice..."
              rows={3}
              style={{
                width: '100%', padding: SPACING.sm, borderRadius: RADIUS.sm,
                background: COLORS.inputBg, color: COLORS.textPrimary,
                border: `1px solid ${COLORS.borderInput}`, fontSize: FONT.sizeSm,
                resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.md }}>
            <Button variant="primary" size="sm" onClick={addWarranty} disabled={saving || !newWarrantyName.trim()}>
              Add Warranty Product
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* ================================================================ */}
      {/* INVOICE WARRANTY & CARE TEXT — per module */}
      {/* ================================================================ */}
      <ModuleInvoiceContentEditor
        moduleInvoiceContent={(data.shopConfig as any)?.module_invoice_content || {}}
        enabledModules={(data.shopConfig as any)?.enabled_modules || ['auto_tint']}
        onSave={async (content: Record<string, unknown>) => {
          const ok = await onSave('shop_config', 1, { module_invoice_content: content });
          if (ok) onRefresh();
          return ok;
        }}
      />
    </div>
  );
}

// ============================================================================
// MODULE INVOICE CONTENT EDITOR
// Per-module warranty and care text editing
// ============================================================================
const MODULE_LABELS: Record<string, string> = {
  auto_tint: 'Window Tint', flat_glass: 'Flat Glass', detailing: 'Detailing',
  ceramic_coating: 'Ceramic Coating', ppf: 'Paint Protection Film',
  wraps: 'Vehicle Wraps', signage: 'Signage', apparel: 'Custom Apparel',
};

function ModuleInvoiceContentEditor({ moduleInvoiceContent, enabledModules, onSave }: {
  moduleInvoiceContent: Record<string, any>;
  enabledModules: string[];
  onSave: (content: Record<string, any>) => Promise<boolean>;
}) {
  const [content, setContent] = useState<Record<string, any>>(moduleInvoiceContent);
  const [saving, setSaving] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  function updateField(mod: string, field: string, value: string | string[]) {
    setContent(prev => ({
      ...prev,
      [mod]: { ...(prev[mod] || {}), [field]: value },
    }));
  }

  function updateCareItem(mod: string, idx: number, value: string) {
    const items = [...(content[mod]?.care_items || [])];
    items[idx] = value;
    updateField(mod, 'care_items', items);
  }

  function addCareItem(mod: string) {
    const items = [...(content[mod]?.care_items || []), ''];
    updateField(mod, 'care_items', items);
  }

  function removeCareItem(mod: string, idx: number) {
    const items = [...(content[mod]?.care_items || [])];
    items.splice(idx, 1);
    updateField(mod, 'care_items', items);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(content);
    setSaving(false);
  }

  return (
    <DashboardCard title="Invoice Warranty & Care Text" icon={
      <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.borderAccentSolid} strokeWidth="2" style={{ width: 18, height: 18 }}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    }>
      <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
        Configure warranty information and care instructions shown on invoices for each service module. Each service can have its own warranty text and care instructions.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
        {enabledModules.map(mod => {
          const modContent = content[mod] || {};
          const isExpanded = expandedModule === mod;
          const hasContent = modContent.warranty_title || modContent.warranty_text;

          return (
            <div key={mod} style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedModule(isExpanded ? null : mod)}
                style={{
                  width: '100%', padding: `${SPACING.md}px ${SPACING.lg}px`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: COLORS.cardBg, border: 'none', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                    {MODULE_LABELS[mod] || mod}
                  </span>
                  {!hasContent && (
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.warning, background: `${COLORS.warning}15`, padding: '2px 8px', borderRadius: RADIUS.sm }}>
                      Not configured
                    </span>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {isExpanded && (
                <div style={{ padding: `${SPACING.md}px ${SPACING.lg}px`, borderTop: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                  <FormField label="Warranty Title">
                    <TextInput value={modContent.warranty_title || ''} onChange={(e) => updateField(mod, 'warranty_title', e.target.value)} placeholder="Warranty Information" />
                  </FormField>
                  <FormField label="Warranty Text">
                    <textarea
                      value={modContent.warranty_text || ''} onChange={(e) => updateField(mod, 'warranty_text', e.target.value)}
                      rows={4} placeholder="Describe warranty coverage..."
                      style={{ width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                        background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                        fontSize: FONT.sizeSm, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                    />
                  </FormField>
                  <FormField label="Extended Warranty Title (optional)">
                    <TextInput value={modContent.no_fault_title || ''} onChange={(e) => updateField(mod, 'no_fault_title', e.target.value)} placeholder="e.g., No Fault Warranty" />
                  </FormField>
                  <FormField label="Extended Warranty Text (optional)">
                    <textarea
                      value={modContent.no_fault_text || ''} onChange={(e) => updateField(mod, 'no_fault_text', e.target.value)}
                      rows={3} placeholder="Extended warranty details..."
                      style={{ width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                        background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                        fontSize: FONT.sizeSm, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                    />
                  </FormField>
                  <FormField label="Care Instructions Title (optional)">
                    <TextInput value={modContent.care_title || ''} onChange={(e) => updateField(mod, 'care_title', e.target.value)} placeholder="e.g., Care & Instructions" />
                  </FormField>
                  <FormField label="Care Instructions">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
                      {(modContent.care_items || []).map((item: string, idx: number) => (
                        <div key={idx} style={{ display: 'flex', gap: SPACING.xs, alignItems: 'center' }}>
                          <TextInput value={item} onChange={(e) => updateCareItem(mod, idx, e.target.value)} placeholder="Care instruction..." />
                          <button onClick={() => removeCareItem(mod, idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, padding: 4, flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addCareItem(mod)} style={{
                        display: 'flex', alignItems: 'center', gap: SPACING.xs,
                        background: 'none', border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.sm,
                        padding: `${SPACING.xs}px ${SPACING.sm}px`, cursor: 'pointer', color: COLORS.textMuted, fontSize: FONT.sizeXs,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add care instruction
                      </button>
                    </div>
                  </FormField>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.lg }}>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Invoice Content'}
        </Button>
      </div>
    </DashboardCard>
  );
}

// ============================================================================
// DISCOUNT ROW — editable inline
// ============================================================================
function DiscountRow({ discount, isEditing, onToggle, onEdit, onSave, onDelete }: {
  discount: DiscountType;
  isEditing: boolean;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(discount.name);
  const [desc, setDesc] = useState(discount.description || '');
  const [type, setType] = useState(discount.discount_type);
  const [value, setValue] = useState(String(discount.discount_value));
  const [appliesTo, setAppliesTo] = useState<string>(discount.applies_to || 'balance_due');
  const [includeWarranty, setIncludeWarranty] = useState(discount.include_warranty ?? false);
  const [savingEdit, setSavingEdit] = useState(false);

  return (
    <div style={{
      background: COLORS.inputBg, borderRadius: RADIUS.md,
      border: `1px solid ${isEditing ? COLORS.borderAccent : COLORS.borderInput}`,
      opacity: discount.enabled ? 1 : 0.5,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        padding: `${SPACING.md}px ${SPACING.lg}px`,
      }}>
        <Toggle checked={discount.enabled} onChange={onToggle} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{discount.name}</div>
          {discount.description && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{discount.description}</div>}
        </div>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.success }}>
          {discount.discount_type === 'percent' ? `${discount.discount_value}%` : `$${discount.discount_value}`}
        </div>
        <button onClick={onEdit} style={{
          background: 'transparent', border: 'none', color: COLORS.textMuted,
          cursor: 'pointer', padding: 4, fontSize: FONT.sizeXs,
        }}>
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
        <button onClick={onDelete} style={{
          background: 'transparent', border: 'none', color: COLORS.danger,
          cursor: 'pointer', padding: 4,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div style={{ padding: `0 ${SPACING.lg}px ${SPACING.lg}px`, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: SPACING.sm, marginTop: SPACING.md }}>
            <FormField label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} /></FormField>
            <FormField label="Type">
              <SelectInput value={type} onChange={e => setType(e.target.value as 'percent' | 'dollar')}>
                <option value="percent">Percent (%)</option>
                <option value="dollar">Dollar ($)</option>
              </SelectInput>
            </FormField>
            <FormField label="Value"><TextInput value={value} onChange={e => setValue(e.target.value)} type="number" /></FormField>
          </div>
          <FormField label="Description"><TextInput value={desc} onChange={e => setDesc(e.target.value)} /></FormField>
          {type === 'percent' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm, marginTop: SPACING.sm }}>
              <FormField label="Apply percentage to">
                <SelectInput value={appliesTo} onChange={e => setAppliesTo(e.target.value)}>
                  <option value="balance_due">Balance Due (after deposit)</option>
                  <option value="subtotal">Subtotal (before deposit)</option>
                </SelectInput>
              </FormField>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
                  <div onClick={() => setIncludeWarranty(!includeWarranty)} style={{
                    width: 16, height: 16, borderRadius: 3,
                    border: `2px solid ${includeWarranty ? COLORS.red : COLORS.borderInput}`,
                    background: includeWarranty ? COLORS.red : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {includeWarranty && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2"><path d="M2 5l2 2 4-4"/></svg>}
                  </div>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>Include warranty in discount calculation</span>
                </label>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md }}>
            <Button variant="primary" size="sm" onClick={async () => {
              setSavingEdit(true);
              await onSave({ name, description: desc || null, discount_type: type, discount_value: parseFloat(value) || 0, applies_to: appliesTo, include_warranty: includeWarranty });
              setSavingEdit(false);
            }} disabled={savingEdit || !name.trim()}>
              {savingEdit ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
      background: checked ? COLORS.red : COLORS.borderInput,
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2,
        left: checked ? 20 : 2,
        transition: 'left 0.2s',
      }} />
    </div>
  );
}
