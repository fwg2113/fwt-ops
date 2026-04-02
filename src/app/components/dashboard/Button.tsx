'use client';

import { COLORS, RADIUS, FONT } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: COLORS.red,
    color: '#ffffff',
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.red,
  },
  secondary: {
    background: 'transparent',
    color: COLORS.textTertiary,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.borderInput,
  },
  danger: {
    background: COLORS.dangerBg,
    color: COLORS.danger,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
  },
  ghost: {
    background: 'transparent',
    color: COLORS.textTertiary,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
  },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: '8px 14px', fontSize: FONT.sizeSm, minHeight: 36 },
  md: { padding: '10px 18px', fontSize: FONT.sizeBase, minHeight: 44 },
  lg: { padding: '14px 22px', fontSize: FONT.sizeLg, minHeight: 48 },
};

export default function Button({ variant = 'primary', size = 'md', children, style, disabled, ...props }: Props) {
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...variantStyle,
        ...sizeStyle,
        borderRadius: RADIUS.xl,
        fontWeight: FONT.weightSemibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
