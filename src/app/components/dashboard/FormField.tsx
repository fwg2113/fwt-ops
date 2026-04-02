'use client';

import { COLORS, RADIUS, SPACING, FONT } from './theme';

interface Props {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}

export default function FormField({ label, required, children, hint, error }: Props) {
  return (
    <div style={{ marginBottom: SPACING.lg }}>
      <label style={{
        display: 'block', marginBottom: SPACING.sm,
        fontSize: FONT.sizeMd, fontWeight: FONT.weightMedium,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        color: COLORS.textTertiary,
      }}>
        {label}
        {required && <span style={{ color: COLORS.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <div style={{ marginTop: 4, fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
          {hint}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 4, fontSize: FONT.sizeSm, color: COLORS.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}

// Styled text input matching dashboard theme
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: `${SPACING.md}px ${SPACING.lg}px`,
        background: COLORS.inputBg,
        color: COLORS.textPrimary,
        border: `1px solid ${COLORS.borderInput}`,
        borderRadius: RADIUS.md,
        fontSize: FONT.sizeBase,
        minHeight: 48,
        outline: 'none',
        transition: 'border-color 0.15s',
        ...props.style,
      }}
    />
  );
}

// Styled select matching dashboard theme
export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <select
      {...rest}
      style={{
        width: '100%',
        padding: `${SPACING.md}px ${SPACING.lg}px`,
        background: COLORS.inputBg,
        color: COLORS.textPrimary,
        border: `1px solid ${COLORS.borderInput}`,
        borderRadius: RADIUS.md,
        fontSize: FONT.sizeBase,
        minHeight: 48,
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: 36,
        ...rest.style,
      }}
    >
      {children}
    </select>
  );
}
