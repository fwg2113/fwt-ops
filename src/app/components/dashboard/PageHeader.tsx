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
      marginBottom: SPACING.xxl, flexWrap: 'wrap', gap: SPACING.lg,
    }}>
      <div>
        <h1 style={{
          fontSize: FONT.sizePageTitle, fontWeight: FONT.weightBold,
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
        <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
