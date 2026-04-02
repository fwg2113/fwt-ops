'use client';

import { COLORS, RADIUS, SPACING, FONT } from './theme';

interface Props {
  label: string;
  value: string | number;
  color?: string;
  prefix?: string;
  subtitle?: string;
}

export default function StatCard({ label, value, color = COLORS.textPrimary, prefix, subtitle }: Props) {
  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.borderAccent}`,
      borderRadius: RADIUS.lg,
      padding: SPACING.xl,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
        textTransform: 'uppercase', letterSpacing: '1.5px',
        color: COLORS.textMuted,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: FONT.sizePageTitle, fontWeight: FONT.weightBold,
        color,
      }}>
        {prefix}{value}
      </div>
      {subtitle && (
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
