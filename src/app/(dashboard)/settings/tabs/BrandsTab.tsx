'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, ColorPicker } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

const MAX_BRANDS = 4;

interface Brand {
  id: number;
  name: string;
  short_name: string | null;
  logo_square_url: string | null;
  logo_wide_url: string | null;
  email_from: string | null;
  phone: string | null;
  website: string | null;
  primary_color: string;
  secondary_color: string;
  is_default: boolean;
  active: boolean;
  sort_order: number;
}

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onAdd: (table: string, data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDelete: (table: string, id: number) => Promise<boolean>;
  onRefresh: () => void;
}

const EMPTY_FORM = {
  name: '',
  short_name: '',
  email_from: '',
  phone: '',
  website: '',
  primary_color: '#dc2626',
  secondary_color: '#f59e0b',
};

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

async function uploadLogo(brandId: number, file: File, type: 'square' | 'wide'): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('brandId', String(brandId));
  formData.append('type', type);
  try {
    const res = await fetch('/api/auto/settings/upload-logo', { method: 'POST', body: formData });
    const result = await res.json();
    return result.success ? result.url : null;
  } catch { return null; }
}

function LogoUpload({ brandId, label, currentUrl, ratio, onUploaded }: {
  brandId: number; label: string; currentUrl: string | null;
  ratio: 'square' | 'wide'; onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const aspectRatio = ratio === 'square' ? '1 / 1' : '2 / 1';
  const width = ratio === 'square' ? 64 : 128;
  const height = ratio === 'square' ? 64 : 64;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadLogo(brandId, file, ratio);
    setUploading(false);
    if (url) onUploaded();
    e.target.value = '';
  }

  return (
    <div>
      <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
        {label}
      </div>
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width, height, borderRadius: RADIUS.md, cursor: 'pointer',
        border: `2px dashed ${COLORS.borderInput}`, background: COLORS.inputBg,
        overflow: 'hidden', position: 'relative',
      }}>
        {currentUrl ? (
          <img src={currentUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain', aspectRatio }} />
        ) : (
          <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
            {uploading ? 'Uploading...' : ratio === 'square' ? '1:1' : '2:1'}
          </div>
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} style={{ display: 'none' }} />
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
          }}>
            Uploading...
          </div>
        )}
      </label>
    </div>
  );
}

export default function BrandsTab({ data, onSave, onAdd, onDelete, onRefresh }: Props) {
  const brands = ((data.brands || []) as Brand[]).sort((a, b) => a.sort_order - b.sort_order);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_FORM });
  const [adding, setAdding] = useState(false);

  function startEdit(brand: Brand) {
    setEditingId(brand.id);
    setEditForm({
      name: brand.name,
      short_name: brand.short_name || '',
      email_from: brand.email_from || '',
      phone: brand.phone || '',
      website: brand.website || '',
      primary_color: brand.primary_color,
      secondary_color: brand.secondary_color,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(brandId: number) {
    setSaving(true);
    const success = await onSave('brands', brandId, {
      name: editForm.name,
      short_name: editForm.short_name || null,
      email_from: editForm.email_from || null,
      phone: editForm.phone || null,
      website: editForm.website || null,
      primary_color: editForm.primary_color,
      secondary_color: editForm.secondary_color,
    });
    setSaving(false);
    if (success) {
      setEditingId(null);
      onRefresh();
    }
  }

  async function handleAdd() {
    if (!addForm.name.trim()) return;
    setAdding(true);
    const result = await onAdd('brands', {
      name: addForm.name,
      short_name: addForm.short_name || null,
      email_from: addForm.email_from || null,
      phone: addForm.phone || null,
      website: addForm.website || null,
      primary_color: addForm.primary_color,
      secondary_color: addForm.secondary_color,
      is_default: brands.length === 0,
      active: true,
      sort_order: brands.length,
    });
    setAdding(false);
    if (result) {
      setAddForm({ ...EMPTY_FORM });
      setShowAddForm(false);
      onRefresh();
    }
  }

  async function handleDelete(brand: Brand) {
    if (brand.is_default) return;
    const success = await onDelete('brands', brand.id);
    if (success) onRefresh();
  }

  async function handleSetDefault(brand: Brand) {
    if (brand.is_default) return;
    setSaving(true);
    // Set the new default
    await onSave('brands', brand.id, { is_default: true });
    // Unset all others
    for (const b of brands) {
      if (b.id !== brand.id && b.is_default) {
        await onSave('brands', b.id, { is_default: false });
      }
    }
    setSaving(false);
    onRefresh();
  }

  async function handleToggleActive(brand: Brand) {
    setSaving(true);
    await onSave('brands', brand.id, { active: !brand.active });
    setSaving(false);
    onRefresh();
  }

  function renderForm(
    form: typeof EMPTY_FORM,
    setForm: (f: typeof EMPTY_FORM) => void,
  ) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <FormField label="Brand Name" required>
            <TextInput
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Frederick Window Tinting"
            />
          </FormField>
          <FormField label="Short Name">
            <TextInput
              value={form.short_name}
              onChange={e => setForm({ ...form, short_name: e.target.value })}
              placeholder="e.g., FWT"
            />
          </FormField>
        </div>
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <FormField label="Email From">
            <TextInput
              value={form.email_from}
              onChange={e => setForm({ ...form, email_from: e.target.value })}
              placeholder="hello@yourbrand.com"
            />
          </FormField>
          <FormField label="Phone">
            <TextInput
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="(301) 555-1234"
            />
          </FormField>
        </div>
        <FormField label="Website">
          <TextInput
            value={form.website}
            onChange={e => setForm({ ...form, website: e.target.value })}
            placeholder="https://yourbrand.com"
          />
        </FormField>
        <div style={{ display: 'flex', gap: SPACING.xl, flexWrap: 'wrap' }}>
          <FormField label="Primary Color">
            <ColorPicker
              value={form.primary_color}
              onChange={hex => setForm({ ...form, primary_color: hex })}
            />
          </FormField>
          <FormField label="Secondary Color">
            <ColorPicker
              value={form.secondary_color}
              onChange={hex => setForm({ ...form, secondary_color: hex })}
            />
          </FormField>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Existing Brands */}
      <DashboardCard title={`Brands (${brands.length})`}>
        {brands.length === 0 && (
          <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: 0 }}>
            No brands configured yet. Add your first brand below.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
          {brands.map(brand => (
            <div key={brand.id}>
              {/* Brand Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING.md,
                  padding: SPACING.md,
                  background: COLORS.inputBg,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  opacity: brand.active ? 1 : 0.5,
                }}
              >
                {/* Logo or Color Dots */}
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexShrink: 0 }}>
                  {brand.logo_square_url ? (
                    <img src={brand.logo_square_url} alt={brand.short_name || brand.name}
                      style={{ width: 32, height: 32, borderRadius: RADIUS.sm, objectFit: 'contain', background: COLORS.hoverBg }} />
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: brand.primary_color,
                        border: `2px solid ${COLORS.border}`,
                      }} />
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: brand.secondary_color,
                        border: `2px solid ${COLORS.border}`,
                      }} />
                    </div>
                  )}
                </div>

                {/* Name + Badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    <span style={{
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeSm,
                      color: COLORS.textPrimary,
                    }}>
                      {brand.name}
                    </span>
                    {brand.short_name && (
                      <span style={{
                        fontSize: FONT.sizeXs,
                        color: COLORS.textMuted,
                        background: COLORS.hoverBg,
                        padding: '1px 6px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                      }}>
                        {brand.short_name}
                      </span>
                    )}
                    {brand.is_default && (
                      <span style={{
                        fontSize: FONT.sizeXs,
                        color: COLORS.yellowSolid,
                        background: COLORS.yellow,
                        padding: '1px 8px',
                        borderRadius: RADIUS.sm,
                        fontWeight: FONT.weightSemibold,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        <StarIcon /> Default
                      </span>
                    )}
                    {!brand.active && (
                      <span style={{
                        fontSize: FONT.sizeXs,
                        color: COLORS.textMuted,
                        fontStyle: 'italic',
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: SPACING.xs, flexShrink: 0 }}>
                  {/* Active Toggle */}
                  <button
                    onClick={() => handleToggleActive(brand)}
                    disabled={saving}
                    title={brand.active ? 'Deactivate' : 'Activate'}
                    style={{
                      background: brand.active ? COLORS.successBg : COLORS.inputBg,
                      color: brand.active ? COLORS.success : COLORS.textMuted,
                      border: `1px solid ${brand.active ? COLORS.success : COLORS.border}`,
                      borderRadius: RADIUS.sm,
                      padding: '4px 10px',
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                    }}
                  >
                    {brand.active ? 'Active' : 'Inactive'}
                  </button>

                  {/* Set Default */}
                  {!brand.is_default && (
                    <button
                      onClick={() => handleSetDefault(brand)}
                      disabled={saving}
                      title="Set as default brand"
                      style={{
                        background: COLORS.inputBg,
                        color: COLORS.yellowSolid,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.sm,
                        padding: '4px 10px',
                        fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightSemibold,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <StarIcon /> Set Default
                    </button>
                  )}

                  {/* Edit */}
                  <button
                    onClick={() => editingId === brand.id ? cancelEdit() : startEdit(brand)}
                    title="Edit"
                    style={{
                      background: editingId === brand.id ? COLORS.activeBg : COLORS.inputBg,
                      color: editingId === brand.id ? COLORS.red : COLORS.textSecondary,
                      border: `1px solid ${editingId === brand.id ? COLORS.red : COLORS.border}`,
                      borderRadius: RADIUS.sm,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <EditIcon />
                  </button>

                  {/* Delete (only non-default) */}
                  {!brand.is_default && (
                    <button
                      onClick={() => handleDelete(brand)}
                      title="Delete brand"
                      style={{
                        background: COLORS.dangerBg,
                        color: COLORS.danger,
                        border: 'none',
                        borderRadius: RADIUS.sm,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Edit Form */}
              {editingId === brand.id && (
                <div style={{
                  padding: SPACING.lg,
                  background: COLORS.cardBg,
                  borderRadius: `0 0 ${RADIUS.md} ${RADIUS.md}`,
                  border: `1px solid ${COLORS.border}`,
                  borderTop: 'none',
                  marginTop: -1,
                }}>
                  {renderForm(editForm, setEditForm)}
                  {/* Logo Uploads */}
                  <div style={{
                    display: 'flex', gap: SPACING.xl, marginTop: SPACING.lg,
                    paddingTop: SPACING.lg, borderTop: `1px solid ${COLORS.border}`,
                  }}>
                    <LogoUpload brandId={brand.id} label="Square Logo (1:1)" currentUrl={brand.logo_square_url} ratio="square" onUploaded={onRefresh} />
                    <LogoUpload brandId={brand.id} label="Wide Logo (2:1)" currentUrl={brand.logo_wide_url} ratio="wide" onUploaded={onRefresh} />
                  </div>
                  <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveEdit(brand.id)}
                      disabled={saving || !editForm.name.trim()}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* Add Brand */}
      <DashboardCard title="Add Brand">
        {brands.length >= MAX_BRANDS ? (
          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
            Maximum of {MAX_BRANDS} brands reached. Delete or deactivate a brand to add another.
          </div>
        ) : !showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACING.sm,
              background: 'none',
              border: `1px dashed ${COLORS.border}`,
              borderRadius: RADIUS.md,
              padding: `${SPACING.md} ${SPACING.lg}`,
              color: COLORS.textSecondary,
              fontSize: FONT.sizeSm,
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <PlusIcon /> Add a new brand
          </button>
        ) : (
          <>
            {renderForm(addForm, setAddForm)}
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={adding || !addForm.name.trim()}
              >
                {adding ? 'Adding...' : 'Add Brand'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowAddForm(false); setAddForm({ ...EMPTY_FORM }); }}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  );
}
