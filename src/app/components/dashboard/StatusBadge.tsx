'use client';

import { COLORS, RADIUS, FONT } from './theme';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'red';

interface Props {
  label: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: COLORS.successBg, color: COLORS.success },
  warning: { bg: COLORS.warningBg, color: COLORS.warning },
  danger: { bg: COLORS.dangerBg, color: COLORS.danger },
  info: { bg: COLORS.infoBg, color: COLORS.info },
  neutral: { bg: 'rgba(255,255,255,0.06)', color: COLORS.textTertiary },
  red: { bg: COLORS.activeBg, color: COLORS.red },
};

export default function StatusBadge({ label, variant = 'neutral', icon }: Props) {
  const style = VARIANT_STYLES[variant];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: RADIUS.sm,
      background: style.bg, color: style.color,
      fontSize: FONT.sizeXs, fontWeight: FONT.weightBold,
      textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      {icon}
      {label}
    </span>
  );
}
