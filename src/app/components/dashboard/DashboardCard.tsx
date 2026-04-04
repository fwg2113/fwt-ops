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
          padding: `${SPACING.md}px ${SPACING.lg}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.border}`,
          flexWrap: 'wrap', gap: SPACING.sm,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, minWidth: 0 }}>
            {icon && (
              <div style={{
                width: 28, height: 28,
                background: COLORS.activeBg,
                borderRadius: RADIUS.sm,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            <div style={{
              fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold,
              color: COLORS.textPrimary,
            }}>
              {title}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div style={noPadding ? {} : { padding: `${SPACING.lg}px ${SPACING.lg}px` }}>
        {children}
      </div>
    </div>
  );
}
