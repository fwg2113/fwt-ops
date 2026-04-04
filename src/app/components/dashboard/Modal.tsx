'use client';

import { useEffect, useRef, useState } from 'react';
import { COLORS, RADIUS, SPACING } from './theme';

interface Props {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
  footer?: React.ReactNode;
}

export default function Modal({ title, children, onClose, width = 520, footer }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : SPACING.lg,
      }}
    >
      <div style={{
        background: '#1d1d1d',
        borderRadius: isMobile ? `${RADIUS.modal}px ${RADIUS.modal}px 0 0` : RADIUS.modal,
        maxWidth: isMobile ? '100%' : width, width: '100%', maxHeight: isMobile ? '95vh' : '90vh',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      }}>
        {/* Pull indicator */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '12px 0 4px',
        }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.15)',
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: `${SPACING.lg}px ${SPACING.xxl}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{
            fontSize: '1.125rem', fontWeight: 600,
            color: COLORS.textPrimary,
          }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: COLORS.textMuted, padding: 4,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: SPACING.xxl }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: `${SPACING.lg}px ${SPACING.xxl}px`,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex', gap: SPACING.md, justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
