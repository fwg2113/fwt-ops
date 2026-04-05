'use client';

import { useState } from 'react';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { DashboardCard, Button } from '@/app/components/dashboard';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Role {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
  is_system: boolean;
}

interface Props {
  roles: Role[];
  onSave: (roleId: number, permissions: Record<string, boolean>) => Promise<void>;
  onRename: (roleId: number, name: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onDelete: (roleId: number) => Promise<void>;
}

const PERMISSION_DEFS: Array<{ key: string; label: string }> = [
  { key: 'dashboard', label: 'Dashboard (Command Center)' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'quotes', label: 'Quotes / FLQA' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'customers', label: 'Customers' },
  { key: 'bookkeeping', label: 'Bookkeeping' },
  { key: 'settings', label: 'Settings' },
  { key: 'team_management', label: 'Team Management' },
  { key: 'module_settings', label: 'Module Settings' },
];

function PermissionToggle({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none',
        background: enabled ? COLORS.red : COLORS.inputBg,
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#ffffff',
        position: 'absolute', top: 3, left: enabled ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function RoleEditor({ role, onSave, onRename, onDelete, isMobile }: {
  role: Role;
  onSave: (roleId: number, permissions: Record<string, boolean>) => Promise<void>;
  onRename: (roleId: number, name: string) => Promise<void>;
  onDelete: (roleId: number) => Promise<void>;
  isMobile: boolean;
}) {
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...role.permissions });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(role.name);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const isOwner = role.name.toLowerCase() === 'owner';
  const hasChanges = JSON.stringify(perms) !== JSON.stringify(role.permissions);

  const handleToggle = (key: string, val: boolean) => {
    setPerms(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(role.id, perms);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* */ }
    finally { setSaving(false); }
  };

  const handleRename = async () => {
    if (!nameValue.trim() || nameValue.trim() === role.name) {
      setEditingName(false);
      setNameValue(role.name);
      return;
    }
    await onRename(role.id, nameValue.trim());
    setEditingName(false);
  };

  const handleDelete = async () => {
    setDeleteError('');
    try {
      await onDelete(role.id);
    } catch (err: any) {
      setDeleteError(err?.message || 'Cannot delete this role');
    }
  };

  return (
    <DashboardCard
      title={editingName ? 'Rename Role' : role.name}
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      }
      actions={
        isOwner ? (
          <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, fontStyle: 'italic' }}>
            Full access (cannot be modified)
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
            {saved && <span style={{ color: COLORS.success, fontSize: FONT.sizeSm }}>Saved</span>}
            <button onClick={() => setEditingName(true)} title="Rename role" style={{
              background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <button onClick={() => setShowDelete(!showDelete)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        )
      }
    >
      {/* Rename input */}
      {editingName && (
        <div style={{ display: 'flex', gap: 8, marginBottom: SPACING.md }}>
          <input
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditingName(false); setNameValue(role.name); } }}
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, outline: 'none',
            }}
          />
          <Button size="sm" variant="primary" onClick={handleRename}>Rename</Button>
          <Button size="sm" onClick={() => { setEditingName(false); setNameValue(role.name); }}>Cancel</Button>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && !isOwner && (
        <div style={{
          padding: SPACING.md, marginBottom: SPACING.md, borderRadius: RADIUS.sm,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        }}>
          <div style={{ fontSize: FONT.sizeSm, color: '#ef4444', marginBottom: 8 }}>
            Delete the "{role.name}" role? Team members assigned to this role will need to be reassigned first.
          </div>
          {deleteError && (
            <div style={{ fontSize: FONT.sizeXs, color: '#ef4444', marginBottom: 8 }}>{deleteError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="primary" onClick={handleDelete} style={{ background: '#ef4444' }}>Delete Role</Button>
            <Button size="sm" onClick={() => { setShowDelete(false); setDeleteError(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {isOwner ? (
        <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeBase, padding: `${SPACING.sm}px 0` }}>
          The Owner role always has unrestricted access to all areas of the platform.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: `${SPACING.sm}px ${SPACING.xxl}px`,
        }}>
          {PERMISSION_DEFS.map(({ key, label }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              background: COLORS.inputBg, borderRadius: RADIUS.md, minHeight: 44,
            }}>
              <span style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, fontWeight: FONT.weightMedium }}>
                {label}
              </span>
              <PermissionToggle enabled={!!perms[key]} onChange={(val) => handleToggle(key, val)} />
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

export default function RolePermissionsEditor({ roles, onSave, onRename, onCreate, onDelete }: Props) {
  const isMobile = useIsMobile();
  const [showAdd, setShowAdd] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  const sorted = [...roles].sort((a, b) => {
    if (a.name.toLowerCase() === 'owner') return -1;
    if (b.name.toLowerCase() === 'owner') return 1;
    return a.name.localeCompare(b.name);
  });

  const handleCreate = async () => {
    if (!newRoleName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(newRoleName.trim());
      setNewRoleName('');
      setShowAdd(false);
    } catch { /* */ }
    finally { setCreating(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: SPACING.sm, marginBottom: SPACING.xs,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 style={{ color: COLORS.textPrimary, fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, margin: 0 }}>
            Role Permissions
          </h2>
        </div>
        <Button size="sm" variant="primary" onClick={() => setShowAdd(!showAdd)}>
          + New Role
        </Button>
      </div>

      <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeBase, margin: 0, lineHeight: 1.5 }}>
        Control what each role can access. Rename or delete roles as needed. Changes apply immediately after saving.
      </p>

      {/* Add new role */}
      {showAdd && (
        <div style={{
          display: 'flex', gap: 8, padding: SPACING.md,
          background: COLORS.cardBg, borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`,
        }}>
          <input
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowAdd(false); }}
            placeholder="Role name (e.g. Lead Installer, Apprentice)"
            autoFocus
            style={{
              flex: 1, padding: '10px 14px', background: COLORS.inputBg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, outline: 'none',
            }}
          />
          <Button variant="primary" onClick={handleCreate} disabled={!newRoleName.trim() || creating}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
          <Button onClick={() => { setShowAdd(false); setNewRoleName(''); }}>Cancel</Button>
        </div>
      )}

      {sorted.map((role) => (
        <RoleEditor key={role.id} role={role} onSave={onSave} onRename={onRename} onDelete={onDelete} isMobile={isMobile} />
      ))}
    </div>
  );
}
