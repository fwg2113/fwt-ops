'use client';

import type { ServiceType } from './types';

interface Props {
  serviceType: ServiceType;
  onChange: (type: ServiceType) => void;
}

const SERVICE_TYPES: { key: ServiceType; label: string }[] = [
  { key: 'tint', label: 'Window Tint' },
  { key: 'removal', label: 'Window Tint Removal' },
  { key: 'alacarte', label: 'Single Window (Ala Carte)' },
];

export default function ServiceTypeSelector({ serviceType, onChange }: Props) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '1rem' }}>
        What would you like to do?
      </div>
      <div className="fwt-prompt" style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: 20 }}>
        Select Service Type
      </div>
      <div className="fwt-service-type-pills" style={{ justifyContent: 'center', marginBottom: 20, gap: 16 }}>
        {SERVICE_TYPES.map(st => (
          <button
            key={st.key}
            type="button"
            className={`fwt-pill${serviceType === st.key ? ' is-selected' : ''}`}
            onClick={() => onChange(st.key)}
            style={{ flex: 1, maxWidth: 280 }}
          >
            {st.label}
          </button>
        ))}
      </div>
    </div>
  );
}
