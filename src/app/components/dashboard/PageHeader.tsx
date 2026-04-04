'use client';

import { COLORS, FONT, SPACING } from './theme';

interface Props {
  title: string;
  titleAccent?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, titleAccent, subtitle, actions }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: SPACING.xxl, flexWrap: 'wrap', gap: SPACING.md,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontSize: 'clamp(1.2rem, 4vw, 1.75rem)', fontWeight: FONT.weightBold,
          color: COLORS.textPrimary, margin: 0,
        }}>
          {title}
          {titleAccent && (
            <span style={{ color: COLORS.red }}> {titleAccent}</span>
          )}
        </h1>
        {subtitle && (
          <div style={{
            fontSize: FONT.sizeBase, color: COLORS.textMuted,
            marginTop: 4,
          }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
