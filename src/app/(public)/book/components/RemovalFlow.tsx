'use client';

import type { BulkConfig, AutoVehicle } from '../lib/types';
import { calculateServicePrice } from '../lib/pricing';

interface Props {
  config: BulkConfig;
  vehicle: AutoVehicle;
  selectedRemovals: Set<string>;
  onToggle: (key: string) => void;
}

export default function RemovalFlow({ config, vehicle, selectedRemovals, onToggle }: Props) {
  const removalServices = config.services.filter(s => s.service_type === 'removal');

  const totalPrice = Array.from(selectedRemovals).reduce((sum, key) => {
    return sum + calculateServicePrice(vehicle, key, null, config.pricing, config.vehicleClasses);
  }, 0);

  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '1rem' }}>Window Tint Removal</div>
        <div className="fwt-prompt" style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: 20 }}>
          Select Areas to Remove
        </div>
        <div className="fwt-sub" style={{ textAlign: 'center', marginBottom: 30, color: '#666' }}>
          Select all areas where you need existing tint removed. Prices shown include labor and disposal.
        </div>

        <div className="fwt-pills" style={{ flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {removalServices.map(svc => {
            const price = calculateServicePrice(vehicle, svc.service_key, null, config.pricing, config.vehicleClasses);
            return (
              <button
                key={svc.service_key}
                type="button"
                className={`fwt-pill${selectedRemovals.has(svc.service_key) ? ' is-selected' : ''}`}
                onClick={() => onToggle(svc.service_key)}
              >
                {svc.label}
                {price > 0 && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: 4 }}>${price}</span>}
              </button>
            );
          })}
        </div>

        {/* Removal Summary */}
        {selectedRemovals.size > 0 && (
          <div style={{ marginTop: 30, padding: 20, background: '#f8f8f8', borderRadius: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Selected Removals:</div>
            {Array.from(selectedRemovals).map(key => {
              const svc = removalServices.find(s => s.service_key === key);
              const price = calculateServicePrice(vehicle, key, null, config.pricing, config.vehicleClasses);
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{svc?.label || key}</span>
                  <span style={{ fontWeight: 600 }}>${price}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ddd' }}>
              <span style={{ fontWeight: 700 }}>Removal Total:</span>
              <span style={{ fontWeight: 700, color: '#d61f26', float: 'right' }}>${totalPrice}</span>
            </div>
          </div>
        )}

        {/* Tip about re-tinting */}
        <div style={{ marginTop: 30, padding: 16, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, color: '#856404', marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#856404" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm-.5 4v5h1V4h-1zm0 6v1h1v-1h-1z"/>
            </svg>
            Need New Tint After Removal?
          </div>
          <div style={{ color: '#856404', fontSize: '0.95rem' }}>
            After completing this removal booking, you can book a separate appointment for new window tint installation.
          </div>
        </div>
      </div>
    </div>
  );
}
