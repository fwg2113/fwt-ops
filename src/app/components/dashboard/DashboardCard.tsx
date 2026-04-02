'use client';

import { COLORS, RADIUS, SPACING, FONT } from './theme';

interface Props {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  noPadding?: boolean;
  allowOverflow?: boolean;
}

export default function DashboardCard({ title, icon, children, actions, noPadding, allowOverflow }: Props) {
  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.borderAccent}`,
      borderRadius: RADIUS.xl,
      overflow: allowOverflow ? 'visible' : 'hidden',
    }}>
      {title && (
        <div style={{
          padding: `${SPACING.lg}px ${SPACING.xxl}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.lg }}>
            {icon && (
              <div style={{
                width: 32, height: 32,
                background: COLORS.activeBg,
                borderRadius: RADIUS.md,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {icon}
              </div>
            )}
            <div style={{
              fontSize: FONT.sizeLg, fontWeight: FONT.weightSemibold,
              color: COLORS.textPrimary,
            }}>
              {title}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div style={noPadding ? {} : { padding: SPACING.xxl }}>
        {children}
      </div>
    </div>
  );
}
