'use client';

import { useState } from 'react';
import type { PriceSummary } from '../lib/pricing';
import type { GCValidation, BulkConfig } from '../lib/types';
import TintLawsModal, { TintLawsButton } from './TintLawsModal';

interface Props {
  config: BulkConfig;
  priceSummary: PriceSummary;
  gcValidation: GCValidation | null;
  // Windshield check
  hasWindshield: boolean;
  windshieldReplaced: string;
  windshield72hrAck: boolean;
  onWindshieldReplacedChange: (val: string) => void;
  onWindshield72hrAckChange: (val: boolean) => void;
  // Window status
  windowStatus: string;
  hasAftermarketTint: string;
  onWindowStatusChange: (val: string) => void;
  onAftermarketTintChange: (val: string) => void;
  // Policy checkboxes
  policyCheckbox: boolean;
  priceAckCheckbox: boolean;
  onPolicyChange: (val: boolean) => void;
  onPriceAckChange: (val: boolean) => void;
}

export default function SummarySection({
  config, priceSummary, gcValidation,
  hasWindshield, windshieldReplaced, windshield72hrAck,
  onWindshieldReplacedChange, onWindshield72hrAckChange,
  windowStatus, hasAftermarketTint,
  onWindowStatusChange, onAftermarketTintChange,
  policyCheckbox, priceAckCheckbox,
  onPolicyChange, onPriceAckChange,
}: Props) {
  const [showTintLaws, setShowTintLaws] = useState(false);
  const { lineItems, subtotal, defaultDiscountTotal, promoDiscount, gcCredit, depositAmount, balanceDue, totalDuration } = priceSummary;
  const totalDiscount = defaultDiscountTotal + promoDiscount;

  return (
    <div>
      {/* Summary Heading */}
      <div style={{ fontWeight: 800, marginBottom: 20, fontSize: '1.1rem' }}>Summary</div>

      {/* Selected Services List */}
      <div className="fwt-sub" style={{ marginBottom: 12 }}>
        {lineItems.map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            {item.label}
            {item.filmName && ` - ${item.filmAbbrev || item.filmName}`}
            {item.shade && ` - ${item.shade}`}
            {item.price > 0 && `: $${item.price}`}
            {item.discountAmount > 0 && (
              <span style={{ color: '#16a34a', marginLeft: 8 }}>(-${item.discountAmount})</span>
            )}
          </div>
        ))}
        {(gcCredit > 0 || promoDiscount > 0) && (
          <div style={{ color: '#16a34a', fontWeight: 600, marginTop: 4 }}>
            Discount Or Credit: -${gcCredit || promoDiscount}
          </div>
        )}
      </div>

      {/* Disclaimer Notice */}
      <div style={{
        background: 'rgb(214, 31, 37)', border: '1px solid rgb(0, 0, 0)', borderRadius: 8,
        padding: 12, margin: '16px 0', fontSize: '0.9rem', lineHeight: 1.5, color: '#ffffff',
      }}>
        <strong>Note:</strong> The selected services and options are not final and can be changed. We will go over all options when you arrive with the vehicle.
      </div>

      {/* Service Duration */}
      {totalDuration > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong>Service Time Approx. {totalDuration} minutes</strong>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            You will receive an update when the vehicle is ready for pick up.
          </div>
        </div>
      )}

      <div className="fwt-divider" style={{ height: 1, background: '#e5e5e5', margin: '20px 0' }} />

      {/* Pricing */}
      <div style={{ marginBottom: 18 }}>
        Subtotal: ${subtotal}
      </div>
      {totalDiscount > 0 && (
        <div style={{ color: '#16a34a', marginBottom: 18 }}>
          Discount: -${totalDiscount}
        </div>
      )}
      {gcCredit > 0 && (
        <div style={{ color: '#16a34a', marginBottom: 18 }}>
          Gift Certificate: -${gcCredit}
        </div>
      )}
      {depositAmount > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, color: '#16a34a' }}>
            Due Today: ${depositAmount} {config.shopConfig.deposit_refundable ? 'Refundable' : 'Non-Refundable'} Deposit
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            The deposit is applied to the final total in store.
          </div>
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        Balance Due In Store: ${balanceDue}
      </div>

      <div className="fwt-divider" style={{ height: 1, background: '#e5e5e5', margin: '20px 0' }} />

      {/* Deposit Policy Checkbox */}
      <div style={{ margin: '20px 0' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={policyCheckbox}
            onChange={e => onPolicyChange(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            {config.shopConfig.deposit_refundable ? (
              <>I understand the ${config.shopConfig.deposit_amount} deposit is <strong>refundable</strong> if I cancel at least <strong>{config.shopConfig.deposit_refund_hours || 24} hours</strong> before my scheduled appointment time. Cancellations within {config.shopConfig.deposit_refund_hours || 24} hours are non-refundable.</>
            ) : (
              <>I understand the ${config.shopConfig.deposit_amount} deposit is <strong>non-refundable</strong>.</>
            )}
          </span>
        </label>
      </div>

      {/* Windshield Replacement Check */}
      {hasWindshield && (
        <div style={{ margin: '20px 0', padding: 16, background: '#fff3cd', border: '2px solid #ffc107', borderRadius: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 12, color: '#856404' }}>
            Windshield Replacement Check
          </div>
          <div style={{ marginBottom: 12, color: '#856404' }}>
            Has your windshield been replaced in the last 72 hours (3 days)?
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="windshield-replaced" value="no"
                checked={windshieldReplaced === 'no'} onChange={() => onWindshieldReplacedChange('no')} />
              <span style={{ fontWeight: 600 }}>No</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="windshield-replaced" value="yes"
                checked={windshieldReplaced === 'yes'} onChange={() => onWindshieldReplacedChange('yes')} />
              <span style={{ fontWeight: 600 }}>Yes</span>
            </label>
          </div>

          {windshieldReplaced === 'yes' && (
            <div style={{ marginTop: 12, padding: 12, background: '#ffffff', borderRadius: 6 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={windshield72hrAck}
                  onChange={e => onWindshield72hrAckChange(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0 }} />
                <span style={{ color: '#856404', fontWeight: 600 }}>
                  I acknowledge that my appointment must be scheduled at least 72 hours (3 days) after my windshield was replaced to ensure proper adhesion.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Price Change Acknowledgement */}
      {config.shopConfig.price_ack_enabled !== false && (
        <div style={{ margin: '20px 0' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1.5 }}>
            <input type="checkbox" checked={priceAckCheckbox}
              onChange={e => onPriceAckChange(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }} />
            <span>
              {config.shopConfig.price_ack_text || 'I understand that the final price is subject to change if additional labor is required beyond the standard installation process (e.g., removal of existing tint, adhesive residue removal, etc.).'}
            </span>
          </label>
        </div>
      )}

      {/* MD Tint Laws */}
      <div style={{ margin: '20px 0' }}>
        <TintLawsButton onClick={() => setShowTintLaws(true)} />
      </div>

      {/* Window Status Question */}
      <div style={{ margin: '20px 0' }}>
        <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>
          What is the current status of the windows? <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <select
          className="fwt-select"
          value={windowStatus}
          onChange={e => onWindowStatusChange(e.target.value)}
          style={{ width: '100%', maxWidth: 400 }}
        >
          <option value="">Select status...</option>
          <option value="never">Never tinted</option>
          <option value="previously">Previously tinted</option>
          <option value="unsure">I am not sure!</option>
        </select>
      </div>

      {/* Conditional Follow-up */}
      {windowStatus === 'previously' && (
        <div style={{ margin: '20px 0 20px 20px' }}>
          <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>
            Is there currently any aftermarket window tint on any of the windows? <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'not_sure', label: 'Not Sure' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="has-tint" value={opt.value}
                  checked={hasAftermarketTint === opt.value}
                  onChange={() => onAftermarketTintChange(opt.value)} />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showTintLaws && <TintLawsModal onClose={() => setShowTintLaws(false)} />}
    </div>
  );
}
