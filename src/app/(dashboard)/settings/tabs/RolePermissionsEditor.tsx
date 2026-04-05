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

function PermissionToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: enabled ? COLORS.red : COLORS.inputBg,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#ffffff',
          position: 'absolute',
          top: 3,
          left: enabled ? 23 : 3,
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function RoleEditor({
  role,
  onSave,
  isMobile,
}: {
  role: Role;
  onSave: (roleId: number, permissions: Record<string, boolean>) => Promise<void>;
  isMobile: boolean;
}) {
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...role.permissions });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isOwner = role.name.toLowerCase() === 'owner';

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
    } catch {
      // error handled upstream
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(perms) !== JSON.stringify(role.permissions);

  return (
    <DashboardCard
      title={role.name}
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
            {saved && (
              <span style={{ color: COLORS.success, fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                Saved
              </span>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )
      }
    >
      {isOwner ? (
        <div style={{
          color: COLORS.textMuted,
          fontSize: FONT.sizeBase,
          padding: `${SPACING.sm}px 0`,
        }}>
          The Owner role always has unrestricted access to all areas of the platform.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: `${SPACING.sm}px ${SPACING.xxl}px`,
        }}>
          {PERMISSION_DEFS.map(({ key, label }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                background: COLORS.inputBg,
                borderRadius: RADIUS.md,
                minHeight: 44,
              }}
            >
              <span style={{
                color: COLORS.textPrimary,
                fontSize: FONT.sizeBase,
                fontWeight: FONT.weightMedium,
              }}>
                {label}
              </span>
              <PermissionToggle
                enabled={!!perms[key]}
                onChange={(val) => handleToggle(key, val)}
              />
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

export default function RolePermissionsEditor({ roles, onSave }: Props) {
  const isMobile = useIsMobile();

  // Sort: Owner first, then alphabetical
  const sorted = [...roles].sort((a, b) => {
    if (a.name.toLowerCase() === 'owner') return -1;
    if (b.name.toLowerCase() === 'owner') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACING.sm,
        marginBottom: SPACING.xs,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 style={{
          color: COLORS.textPrimary,
          fontSize: FONT.sizeTitle,
          fontWeight: FONT.weightBold,
          margin: 0,
        }}>
          Role Permissions
        </h2>
      </div>

      <p style={{
        color: COLORS.textMuted,
        fontSize: FONT.sizeBase,
        margin: 0,
        lineHeight: 1.5,
      }}>
        Control what each role can access. Changes apply immediately after saving.
      </p>

      {sorted.map((role) => (
        <RoleEditor
          key={role.id}
          role={role}
          onSave={onSave}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}
