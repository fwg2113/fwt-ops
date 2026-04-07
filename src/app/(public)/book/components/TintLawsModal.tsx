'use client';

import { useState } from 'react';

// ============================================================================
// MD TINT LAWS MODAL
// Collapsible sections for each vehicle type with VLT details
// Triggered by a "Learn About MD Tint Laws" button on booking pages
// ============================================================================

interface Props {
  onClose: () => void;
}

interface LawSection {
  title: string;
  items: { window: string; rule: string }[];
  note?: string;
}

const MD_LAWS: LawSection[] = [
  {
    title: 'Passenger Cars (Sedans, Coupes, Convertibles)',
    items: [
      { window: 'Front Side Windows', rule: 'Minimum 35% VLT' },
      { window: 'Rear Side Windows', rule: 'Minimum 35% VLT' },
      { window: 'Rear Window', rule: 'Minimum 35% VLT' },
      { window: 'Windshield', rule: 'Any VLT down to the AS1 line or 5 inches from the top' },
      { window: 'Sunroof', rule: 'No limit' },
    ],
  },
  {
    title: 'Multipurpose Vehicles (Trucks, SUVs, Minivans)',
    items: [
      { window: 'Front Side Windows', rule: 'Minimum 35% VLT' },
      { window: 'Rear Side Windows', rule: 'No limit' },
      { window: 'Rear Window', rule: 'No limit' },
      { window: 'Windshield', rule: 'Any VLT down to the AS1 line or 5 inches from the top' },
      { window: 'Sunroof', rule: 'No limit' },
    ],
  },
];

export default function TintLawsModal({ onClose }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500,
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1a1a1a' }}>
            Maryland Tint Laws
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: '#888', fontSize: '1.2rem', lineHeight: 1,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 24px 24px' }}>
          <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.6, margin: '0 0 16px' }}>
            VLT (Visible Light Transmission) refers to the percentage of light that passes through the window film. A lower percentage means a darker tint. Maryland law sets minimum VLT requirements that vary by vehicle type and window position.
          </p>

          {/* Collapsible Sections */}
          {MD_LAWS.map((section, idx) => (
            <div key={idx} style={{
              border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 8,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                style={{
                  width: '100%', padding: '14px 16px', textAlign: 'left',
                  background: expandedIdx === idx ? '#f9fafb' : '#fff',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a1a' }}>
                  {section.title}
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#888" strokeWidth="2"
                  style={{ transform: expandedIdx === idx ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <path d="M5 3l5 5-5 5"/>
                </svg>
              </button>
              {expandedIdx === idx && (
                <div style={{ padding: '0 16px 14px' }}>
                  {section.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: i < section.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <span style={{ fontSize: '0.85rem', color: '#333', fontWeight: 500 }}>{item.window}</span>
                      <span style={{ fontSize: '0.85rem', color: '#666', textAlign: 'right' }}>{item.rule}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Disclaimer */}
          <div style={{
            marginTop: 16, padding: '12px 16px', background: '#fffbeb',
            border: '1px solid #fde68a', borderRadius: 8,
            fontSize: '0.8rem', color: '#92400e', lineHeight: 1.5,
          }}>
            <strong>Disclaimer:</strong> Most drivers in Maryland choose darker tints than the legal minimum. It is the vehicle owner's responsibility to understand and comply with Maryland tint laws. Medical exemptions may be available for those with qualifying conditions. Frederick Window Tinting is not responsible for any citations related to window tint darkness.
          </div>
        </div>
      </div>
    </div>
  );
}

// Button component to trigger the modal
export function TintLawsButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} type="button" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8,
      background: 'transparent', border: '2px solid #dc2626',
      color: '#dc2626', fontSize: '0.85rem', fontWeight: 600,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      Learn About MD Tint Laws
    </button>
  );
}
