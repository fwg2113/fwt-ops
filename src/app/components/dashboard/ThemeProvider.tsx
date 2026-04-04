'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { buildColors, DEFAULT_THEME, type ThemeInput } from './theme';

type DashboardColors = ReturnType<typeof buildColors>;

interface ThemeContextValue {
  colors: DashboardColors;
  themeInput: ThemeInput;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: buildColors(DEFAULT_THEME),
  themeInput: DEFAULT_THEME,
});

export function useDashboardTheme() {
  return useContext(ThemeContext);
}

export default function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeInput, setThemeInput] = useState<ThemeInput>(DEFAULT_THEME);

  useEffect(() => {
    fetch('/api/auto/settings')
      .then(r => r.json())
      .then(data => {
        const sc = data?.shopConfig;
        if (sc) {
          setThemeInput({
            primary: sc.theme_int_primary || DEFAULT_THEME.primary,
            accent: sc.theme_int_accent || DEFAULT_THEME.accent,
            background: sc.theme_int_background || DEFAULT_THEME.background,
            surface: sc.theme_int_surface || DEFAULT_THEME.surface,
            text: sc.theme_int_text || DEFAULT_THEME.text,
          });
        }
      })
      .catch(() => {});
  }, []);

  const colors = buildColors(themeInput);
  const isLight = (() => {
    const hex = themeInput.surface.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  })();

  // Inject CSS custom properties so every component using COLORS gets dynamic values
  const cssVars = `
    :root {
      --dash-color-scheme: ${isLight ? 'light' : 'dark'};
      color-scheme: ${isLight ? 'light' : 'dark'};
      --dash-page-bg: ${colors.pageBg};
      --dash-card-bg: ${colors.cardBg};
      --dash-input-bg: ${colors.inputBg};
      --dash-hover-bg: ${colors.hoverBg};
      --dash-active-bg: ${colors.activeBg};
      --dash-border: ${colors.border};
      --dash-border-input: ${colors.borderInput};
      --dash-border-accent: ${colors.borderAccent};
      --dash-border-accent-solid: ${colors.borderAccentSolid};
      --dash-red: ${colors.red};
      --dash-red-hover: ${colors.redHover};
      --dash-yellow: ${colors.yellow};
      --dash-yellow-solid: ${colors.yellowSolid};
      --dash-text-primary: ${colors.textPrimary};
      --dash-text-secondary: ${colors.textSecondary};
      --dash-text-tertiary: ${colors.textTertiary};
      --dash-text-muted: ${colors.textMuted};
      --dash-text-placeholder: ${colors.textPlaceholder};
    }

    /* Global button hover effect */
    button:not(:disabled) {
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    button:not(:disabled):hover {
      transform: scale(1.02);
    }
    button:not(:disabled):active {
      transform: scale(0.98);
    }

    /* Mobile responsive foundations */
    @media (max-width: 768px) {
      /* Disable hover scale on mobile (causes issues with touch) */
      button:not(:disabled):hover {
        transform: none;
      }

      /* Full-width inputs on mobile */
      input, select, textarea {
        font-size: 16px !important; /* Prevents iOS zoom on focus */
      }

      /* Modal responsive */
      .modal-overlay > div {
        width: 95% !important;
        max-width: 95% !important;
        max-height: 90vh !important;
      }
    }
  `;

  return (
    <ThemeContext.Provider value={{ colors, themeInput }}>
      <style dangerouslySetInnerHTML={{ __html: cssVars }} />
      {children}
    </ThemeContext.Provider>
  );
}
