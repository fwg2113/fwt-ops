'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pin: string | null;
  role: string;
  role_id: number;
  module_permissions: string[];
  department: string | null;
  active: boolean;
}

interface TeamRole {
  id: number;
  name: string;
  permissions: Record<string, unknown>;
  is_system: boolean;
}

interface ShopModule {
  id: number;
  module_id: number;
  enabled: boolean;
  service_modules: {
    module_key: string;
    label: string;
    color: string;
    parent_category: string;
    pricing_model: string;
    icon_name: string | null;
  };
}

interface Props {
  data: Record<string, unknown>;
  onRefresh: () => void;
}

interface MemberForm {
  name: string;
  email: string;
  phone: string;
  pin: string;
  role_id: number | '';
  module_permissions: string[];
  active: boolean;
}

const EMPTY_FORM: MemberForm = {
  name: '',
  email: '',
  phone: '',
  pin: '',
  role_id: '',
  module_permissions: [],
  active: true,
};

const ROLE_VARIANT: Record<string, 'red' | 'warning' | 'info' | 'success' | 'neutral'> = {
  Owner: 'red',
  Manager: 'warning',
  Installer: 'info',
  Apprentice: 'neutral',
};

// --- SVG Icons ---

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

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function TeamTab({ data, onRefresh }: Props) {
  const shopModules = ((data.shopModules || []) as ShopModule[]).filter(m => m.enabled);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MemberForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<MemberForm>({ ...EMPTY_FORM });
  const [adding, setAdding] = useState(false);

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auto/team');
      if (!res.ok) throw new Error('Failed to load team data');
      const result = await res.json();
      setMembers(result.members || []);
      setRoles(result.roles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // --- Helpers ---

  function getModuleColor(moduleKey: string): string {
    const mod = shopModules.find(m => m.service_modules.module_key === moduleKey);
    return mod?.service_modules.color || COLORS.textMuted;
  }

  function getModuleLabel(moduleKey: string): string {
    const mod = shopModules.find(m => m.service_modules.module_key === moduleKey);
    return mod?.service_modules.label || moduleKey;
  }

  function getRoleName(roleId: number): string {
    const role = roles.find(r => r.id === roleId);
    return role?.name || 'Unknown';
  }

  // --- Edit handlers ---

  function startEdit(member: TeamMember) {
    setEditingId(member.id);
    setEditForm({
      name: member.name,
      email: member.email || '',
      phone: member.phone || '',
      pin: member.pin || '',
      role_id: member.role_id,
      module_permissions: [...member.module_permissions],
      active: member.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ ...EMPTY_FORM });
  }

  async function handleSaveEdit(memberId: string) {
    if (!editForm.name.trim() || editForm.role_id === '') return;
    setSaving(true);
    try {
      const res = await fetch('/api/auto/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: memberId,
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          pin: editForm.pin.trim() || null,
          role_id: editForm.role_id,
          module_permissions: editForm.module_permissions,
          active: editForm.active,
        }),
      });
      if (!res.ok) throw new Error('Failed to update team member');
      setEditingId(null);
      await fetchTeam();
      onRefresh();
    } catch {
      // Could show an error toast here
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!addForm.name.trim() || addForm.role_id === '') return;
    setAdding(true);
    try {
      const res = await fetch('/api/auto/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim() || null,
          phone: addForm.phone.trim() || null,
          pin: addForm.pin.trim() || null,
          role_id: addForm.role_id,
          module_permissions: addForm.module_permissions,
          active: addForm.active,
        }),
      });
      if (!res.ok) throw new Error('Failed to add team member');
      setAddForm({ ...EMPTY_FORM });
      setShowAddForm(false);
      await fetchTeam();
      onRefresh();
    } catch {
      // Could show an error toast here
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(member: TeamMember) {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    try {
      const res = await fetch('/api/auto/team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id }),
      });
      if (!res.ok) throw new Error('Failed to delete team member');
      await fetchTeam();
      onRefresh();
    } catch {
      // Could show an error toast here
    }
  }

  async function handleToggleActive(member: TeamMember) {
    setSaving(true);
    try {
      const res = await fetch('/api/auto/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: !member.active }),
      });
      if (!res.ok) throw new Error('Failed to update team member');
      await fetchTeam();
      onRefresh();
    } catch {
      // Could show an error toast here
    } finally {
      setSaving(false);
    }
  }

  // --- Module permission toggle ---

  function toggleModulePermission(
    form: MemberForm,
    setForm: (f: MemberForm) => void,
    moduleKey: string,
  ) {
    const perms = form.module_permissions.includes(moduleKey)
      ? form.module_permissions.filter(k => k !== moduleKey)
      : [...form.module_permissions, moduleKey];
    setForm({ ...form, module_permissions: perms });
  }

  // --- Form renderer ---

  function renderForm(
    form: MemberForm,
    setForm: (f: MemberForm) => void,
  ) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
        {/* Row 1: Name + Role */}
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Name" required>
              <TextInput
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Danny"
              />
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Role" required>
              <SelectInput
                value={form.role_id}
                onChange={e => setForm({ ...form, role_id: e.target.value === '' ? '' : parseInt(e.target.value) })}
              >
                <option value="">Select role...</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </SelectInput>
            </FormField>
          </div>
        </div>

        {/* Row 2: Email + Phone */}
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Email">
              <TextInput
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="danny@shop.com"
              />
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Phone">
              <TextInput
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="(301) 555-1234"
              />
            </FormField>
          </div>
        </div>

        {/* Row 3: PIN + Active */}
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200, maxWidth: 200 }}>
            <FormField label="PIN" hint="For clock-in / POS">
              <TextInput
                value={form.pin}
                onChange={e => setForm({ ...form, pin: e.target.value })}
                placeholder="1234"
                style={{ fontFamily: 'monospace', letterSpacing: '2px' }}
              />
            </FormField>
          </div>
          <div style={{ marginBottom: SPACING.lg }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: SPACING.sm,
              cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
            }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm({ ...form, active: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: COLORS.success, cursor: 'pointer' }}
              />
              Active
            </label>
          </div>
        </div>

        {/* Module Permissions */}
        {shopModules.length > 0 && (
          <div>
            <div style={{
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
              color: COLORS.textPrimary, marginBottom: SPACING.md,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Module Permissions
            </div>
            <div style={{ display: 'flex', gap: SPACING.lg, flexWrap: 'wrap' }}>
              {shopModules.map(mod => {
                const moduleKey = mod.service_modules.module_key;
                const checked = form.module_permissions.includes(moduleKey);
                return (
                  <label key={mod.id} style={{
                    display: 'flex', alignItems: 'center', gap: SPACING.sm,
                    cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary,
                    padding: `${SPACING.xs}px ${SPACING.md}px`,
                    background: checked ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${checked ? mod.service_modules.color : COLORS.border}`,
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModulePermission(form, setForm, moduleKey)}
                      style={{ width: 16, height: 16, accentColor: mod.service_modules.color, cursor: 'pointer' }}
                    />
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: mod.service_modules.color, flexShrink: 0,
                    }} />
                    {mod.service_modules.label}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Loading / Error states ---

  if (loading) {
    return (
      <DashboardCard title="Team Members">
        <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
          Loading team data...
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard title="Team Members">
        <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.danger, fontSize: FONT.sizeSm }}>
          {error}
        </div>
        <div style={{ textAlign: 'center', marginTop: SPACING.md }}>
          <Button variant="ghost" size="sm" onClick={fetchTeam}>Retry</Button>
        </div>
      </DashboardCard>
    );
  }

  // --- Render ---

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Team Members List */}
      <DashboardCard title={`Team Members (${members.length})`}>
        {members.length === 0 && (
          <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: 0 }}>
            No team members yet. Add your first team member below.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
          {members.map(member => (
            <div key={member.id}>
              {/* Member Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING.md,
                  padding: SPACING.md,
                  background: COLORS.inputBg,
                  borderRadius: editingId === member.id ? `${RADIUS.md}px ${RADIUS.md}px 0 0` : RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  borderBottom: editingId === member.id ? 'none' : `1px solid ${COLORS.border}`,
                  opacity: member.active ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                }}
              >
                {/* User icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: COLORS.hoverBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: COLORS.textMuted, flexShrink: 0,
                }}>
                  <UserIcon />
                </div>

                {/* Name + Role + Module badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    <span style={{
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeSm,
                      color: COLORS.textPrimary,
                    }}>
                      {member.name}
                    </span>
                    <StatusBadge
                      label={getRoleName(member.role_id)}
                      variant={ROLE_VARIANT[getRoleName(member.role_id)] || 'neutral'}
                    />
                    {!member.active && (
                      <span style={{
                        fontSize: FONT.sizeXs,
                        color: COLORS.textMuted,
                        fontStyle: 'italic',
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {/* Module permission badges */}
                  {member.module_permissions.length > 0 && (
                    <div style={{ display: 'flex', gap: SPACING.xs, marginTop: SPACING.xs, flexWrap: 'wrap' }}>
                      {member.module_permissions.map(moduleKey => (
                        <span key={moduleKey} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: FONT.sizeXs, color: COLORS.textTertiary,
                          padding: '1px 6px', borderRadius: RADIUS.sm,
                          background: COLORS.hoverBg,
                          border: `1px solid ${COLORS.border}`,
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: getModuleColor(moduleKey), flexShrink: 0,
                          }} />
                          {getModuleLabel(moduleKey)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: SPACING.xs, flexShrink: 0 }}>
                  {/* Active Toggle */}
                  <button
                    onClick={() => handleToggleActive(member)}
                    disabled={saving}
                    title={member.active ? 'Deactivate' : 'Activate'}
                    style={{
                      background: member.active ? COLORS.successBg : COLORS.inputBg,
                      color: member.active ? COLORS.success : COLORS.textMuted,
                      border: `1px solid ${member.active ? COLORS.success : COLORS.border}`,
                      borderRadius: RADIUS.sm,
                      padding: '4px 10px',
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                    }}
                  >
                    {member.active ? 'Active' : 'Inactive'}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => editingId === member.id ? cancelEdit() : startEdit(member)}
                    title="Edit"
                    style={{
                      background: editingId === member.id ? COLORS.activeBg : COLORS.inputBg,
                      color: editingId === member.id ? COLORS.red : COLORS.textSecondary,
                      border: `1px solid ${editingId === member.id ? COLORS.red : COLORS.border}`,
                      borderRadius: RADIUS.sm,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <EditIcon />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(member)}
                    title="Remove team member"
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
                </div>
              </div>

              {/* Inline Edit Form */}
              {editingId === member.id && (
                <div style={{
                  padding: SPACING.lg,
                  background: COLORS.cardBg,
                  borderRadius: `0 0 ${RADIUS.md}px ${RADIUS.md}px`,
                  border: `1px solid ${COLORS.border}`,
                  borderTop: 'none',
                }}>
                  {renderForm(editForm, setEditForm)}
                  <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveEdit(member.id)}
                      disabled={saving || !editForm.name.trim() || editForm.role_id === ''}
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

      {/* Add Team Member */}
      <DashboardCard title="Add Team Member">
        {!showAddForm ? (
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
            <PlusIcon /> Add a new team member
          </button>
        ) : (
          <>
            {renderForm(addForm, setAddForm)}
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={adding || !addForm.name.trim() || addForm.role_id === ''}
              >
                {adding ? 'Adding...' : 'Add Member'}
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
