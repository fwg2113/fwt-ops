'use client';

import { useState, useEffect } from 'react';
import { COLORS, RADIUS, FONT } from './theme';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  desc?: string;
  size?: 'sm' | 'md';
}

function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export default function ColorPicker({ value, onChange, label, desc, size = 'md' }: Props) {
  const [hexInput, setHexInput] = useState(value);

  // Sync when external value changes
  useEffect(() => {
    setHexInput(value);
  }, [value]);

  function handleHexChange(raw: string) {
    // Auto-prepend # if missing
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    setHexInput(v);
    if (isValidHex(v)) {
      onChange(v);
    }
  }

  const pickerSize = size === 'sm' ? 28 : 40;
  const inputWidth = size === 'sm' ? 90 : 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? 6 : 10 }}>
      <div style={{ position: 'relative', width: pickerSize, height: pickerSize, flexShrink: 0 }}>
        <input
          type="color"
          value={isValidHex(hexInput) ? hexInput : value}
          onChange={e => { onChange(e.target.value); setHexInput(e.target.value); }}
          style={{
            width: pickerSize, height: pickerSize, padding: 0,
            border: `2px solid ${COLORS.borderInput}`,
            borderRadius: size === 'sm' ? RADIUS.sm : 8,
            cursor: 'pointer', background: 'transparent',
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {label && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: size === 'sm' ? FONT.sizeXs : FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
              {label}
            </span>
          </div>
        )}
        <input
          type="text"
          value={hexInput}
          onChange={e => handleHexChange(e.target.value)}
          onBlur={() => { if (!isValidHex(hexInput)) setHexInput(value); }}
          placeholder="#000000"
          maxLength={7}
          style={{
            width: inputWidth, padding: '3px 6px',
            background: COLORS.inputBg, color: COLORS.textPrimary,
            border: `1px solid ${isValidHex(hexInput) ? COLORS.borderInput : COLORS.danger}`,
            borderRadius: RADIUS.sm, fontSize: FONT.sizeXs,
            fontFamily: 'monospace',
          }}
        />
        {desc && (
          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{desc}</span>
        )}
      </div>
    </div>
  );
}
