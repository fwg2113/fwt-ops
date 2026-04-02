'use client';

import { useState, useCallback, useMemo } from 'react';
import { Modal, Button, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

// Fields available for mapping
const MAPPABLE_FIELDS = [
  { key: '', label: '-- Skip this column --' },
  // Customer
  { key: 'name', label: 'Full Name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  // Vehicle
  { key: 'vehicle', label: 'Vehicle (Year Make Model combined)' },
  { key: 'vehicle_year', label: 'Vehicle Year' },
  { key: 'vehicle_make', label: 'Vehicle Make' },
  { key: 'vehicle_model', label: 'Vehicle Model' },
  // Job date
  { key: 'job_date', label: 'Job / Visit Date' },
  { key: 'appointment_type', label: 'Appointment Type' },
  // Services
  { key: 'services_summary', label: 'Services (raw text)' },
  { key: 'film_type', label: 'Film Type' },
  { key: 'shade_front', label: 'Shade (Front)' },
  { key: 'shade_rear', label: 'Shade (Rear)' },
  { key: 'full_service', label: 'Full (Sides & Rear)' },
  { key: 'two_fd', label: '2 Front Doors' },
  { key: 'windshield', label: 'Windshield' },
  { key: 'sun_strip', label: 'Sun Strip' },
  { key: 'sun_roof', label: 'Sun Roof' },
  { key: 'removal', label: 'Removal' },
  // Financials
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'discount_note', label: 'Discount Note' },
  { key: 'nfw_amount', label: 'No-Fault Warranty Amount' },
  { key: 'tip', label: 'Tip' },
  { key: 'total', label: 'Total' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'balance_due', label: 'Balance Due' },
  { key: 'starting_total', label: 'Starting Total' },
  { key: 'upsell_amount', label: 'Upsell Amount' },
  // Payment
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'processor', label: 'Processor' },
  { key: 'source', label: 'Source' },
  { key: 'gc_code', label: 'GC / Promo Code' },
  { key: 'invoice_num', label: 'Invoice Number' },
  { key: 'notes', label: 'Notes' },
  { key: 'notes_autoparse', label: 'Notes (auto-parse vehicle + services)' },
];

// Auto-guess field from header name
function guessField(header: string): string {
  const h = header.toLowerCase().trim().replace(/[_\s]+/g, '_');
  // Customer
  if (h === 'name' || h === 'customer_name' || h === 'customer') return 'name';
  if (h === 'first_name' || h === 'firstname') return 'first_name';
  if (h === 'last_name' || h === 'lastname') return 'last_name';
  if (h === 'phone' || h === 'telephone' || h === 'cell' || h === 'phone_number') return 'phone';
  if (h === 'email' || h === 'e-mail' || h === 'email_address') return 'email';
  if (h === 'company' || h === 'business' || h === 'company_name') return 'company';
  // Vehicle
  if (h === 'vehicle' || h === 'car' || h === 'vehicle_ymm') return 'vehicle';
  if (h === 'vehicle_year' || h === 'year' || h === 'car_year') return 'vehicle_year';
  if (h === 'vehicle_make' || h === 'make') return 'vehicle_make';
  if (h === 'vehicle_model' || h === 'model') return 'vehicle_model';
  // Date
  if (h === 'date' || h === 'job_date' || h === 'visit_date' || h === 'appointment_date' || h === 'service_date') return 'job_date';
  if (h === 'appointment_type' || h === 'appt_type' || h === 'type') return 'appointment_type';
  // Services
  if (h === 'services' || h === 'service' || h === 'services_summary') return 'services_summary';
  if (h === 'film_type' || h === 'film' || h === 'film_name') return 'film_type';
  if (h === 'shade_front' || h === 'front_shade' || h === 'shade') return 'shade_front';
  if (h === 'shade_rear' || h === 'rear_shade') return 'shade_rear';
  if (h === 'full' || h === 'full_sides' || h === 'full_(sides_&_rear)' || h === 'full_service') return 'full_service';
  if (h === '2fd' || h === '2_front_doors' || h === 'two_front_doors' || h === 'two_fd') return 'two_fd';
  if (h === 'ws' || h === 'windshield' || h === 'full_windshield') return 'windshield';
  if (h === 'ts' || h === 'sun_strip' || h === 'sunstrip') return 'sun_strip';
  if (h === 'sr' || h === 'sun_roof' || h === 'sunroof') return 'sun_roof';
  if (h === 'removal' || h === 'removals') return 'removal';
  // Financials
  if (h === 'subtotal' || h === 'sub_total') return 'subtotal';
  if (h === 'discount') return 'discount';
  if (h === 'discount_note' || h === 'discountnote') return 'discount_note';
  if (h === 'nfw' || h === 'nfw_amount' || h === 'no_fault' || h === 'no-fault_warranty') return 'nfw_amount';
  if (h === 'tip') return 'tip';
  if (h === 'total' || h === 'total_price' || h === 'amount' || h === 'price') return 'total';
  if (h === 'deposit') return 'deposit';
  if (h === 'balance_due' || h === 'balancedue' || h === 'balance') return 'balance_due';
  if (h === 'starting_total' || h === 'startingtotal') return 'starting_total';
  if (h === 'upsell_amount' || h === 'upsellamount' || h === 'upsell') return 'upsell_amount';
  // Payment
  if (h === 'payment' || h === 'payment_method' || h === 'pay_method') return 'payment_method';
  if (h === 'processor') return 'processor';
  if (h === 'source' || h === 'booking_source') return 'source';
  if (h === 'gc' || h === 'code' || h === 'gc_code' || h === 'promo') return 'gc_code';
  if (h === 'invoice_num' || h === 'invoicenum' || h === 'invoice_number' || h === 'invoice_#' || h === 'invoice') return 'invoice_num';
  if (h === 'note' || h === 'notes') return 'notes';
  return '';
}

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';

export default function ImportModal({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importResults, setImportResults] = useState<{
    customersCreated: number;
    customersUpdated: number;
    vehiclesCreated: number;
    jobsCreated: number;
    errors: string[];
  } | null>(null);

  // Parse CSV
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      // Parse CSV (simple -- handles quotes)
      // Detect delimiter: tab or comma
      const firstLine = lines[0];
      const delimiter = firstLine.includes('\t') ? '\t' : ',';

      const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQuotes = !inQuotes; continue; }
          if (c === delimiter && !inQuotes) { result.push(current.trim()); current = ''; continue; }
          current += c;
        }
        result.push(current.trim());
        return result;
      };

      const hdrs = parseLine(lines[0]);
      const dataRows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));

      setHeaders(hdrs);
      setRows(dataRows);

      // Auto-guess mappings
      const autoMap: Record<number, string> = {};
      hdrs.forEach((h, i) => {
        const guess = guessField(h);
        if (guess) autoMap[i] = guess;
      });
      setMapping(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  // Build mapped rows for preview/import
  const mappedRows = useMemo(() => {
    return rows.map(row => {
      const mapped: Record<string, string> = {};
      Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
        if (fieldKey && row[Number(colIdx)]) {
          mapped[fieldKey] = row[Number(colIdx)];
        }
      });
      return mapped;
    });
  }, [rows, mapping]);

  // Check if we have minimum required mapping (at least name or phone)
  const hasRequiredFields = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
    return mappedKeys.has('name') || mappedKeys.has('first_name') || mappedKeys.has('phone');
  }, [mapping]);

  // Import
  async function handleImport() {
    setStep('importing');
    const batchId = `import-${Date.now()}`;

    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mappedRows, batchId }),
      });
      const data = await res.json();
      setImportResults(data.results || null);
      setStep('done');
    } catch {
      setImportResults({ customersCreated: 0, customersUpdated: 0, vehiclesCreated: 0, jobsCreated: 0, errors: ['Import failed'] });
      setStep('done');
    }
  }

  return (
    <Modal
      title={
        step === 'upload' ? 'Import Customers' :
        step === 'map' ? 'Map Columns' :
        step === 'preview' ? 'Preview Import' :
        step === 'importing' ? 'Importing...' : 'Import Complete'
      }
      onClose={onClose}
      width={step === 'map' || step === 'preview' ? 700 : 520}
      footer={
        step === 'map' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep('preview')} disabled={!hasRequiredFields}>
                Preview ({rows.length} rows)
              </Button>
            </div>
          </div>
        ) : step === 'preview' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button variant="secondary" onClick={() => setStep('map')}>Back</Button>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={handleImport}>
                Import {rows.length} Rows
              </Button>
            </div>
          </div>
        ) : step === 'done' ? (
          <Button variant="primary" onClick={onComplete}>Done</Button>
        ) : undefined
      }
    >
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = COLORS.red; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = COLORS.borderInput; }}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = COLORS.borderInput;
            const file = e.dataTransfer.files[0];
            if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) handleFile(file);
          }}
          style={{
            border: `2px dashed ${COLORS.borderInput}`,
            borderRadius: RADIUS.lg,
            padding: `${SPACING.xxxl * 2}px`,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.txt';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            input.click();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textSecondary, marginBottom: SPACING.sm }}>
            Drop a CSV file here or click to browse
          </div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
            Supports .csv files. First row should be column headers.
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 'map' && (
        <div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
            {headers.length} columns detected, {rows.length} data rows. Map each column to a field.
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {headers.map((h, i) => {
              const sampleValue = rows[0]?.[i] || '';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.md,
                  padding: `${SPACING.sm}px 0`,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                      {h || `Column ${i + 1}`}
                    </div>
                    <div style={{
                      fontSize: FONT.sizeXs, color: COLORS.textMuted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {sampleValue || '(empty)'}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <div style={{ width: 220, flexShrink: 0 }}>
                    <SelectInput
                      value={mapping[i] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [i]: e.target.value }))}
                      style={{ minHeight: 32, fontSize: FONT.sizeXs }}
                    >
                      {MAPPABLE_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </SelectInput>
                  </div>
                </div>
              );
            })}
          </div>
          {!hasRequiredFields && (
            <div style={{
              marginTop: SPACING.md, padding: SPACING.md,
              background: COLORS.warningBg, borderRadius: RADIUS.sm,
              fontSize: FONT.sizeSm, color: COLORS.warning,
            }}>
              Map at least a Name or Phone column to continue.
            </div>
          )}
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
            Showing first 10 of {rows.length} rows. Review the mapping before importing.
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeXs }}>
              <thead>
                <tr>
                  <th style={previewThStyle}>#</th>
                  {Object.values(mapping).filter(Boolean).map((fieldKey, i) => (
                    <th key={i} style={previewThStyle}>
                      {MAPPABLE_FIELDS.find(f => f.key === fieldKey)?.label || fieldKey}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td style={previewTdStyle}>{i + 1}</td>
                    {Object.values(mapping).filter(Boolean).map((fieldKey, j) => (
                      <td key={j} style={previewTdStyle}>
                        {row[fieldKey] || '--'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
            Importing {rows.length} rows...
          </div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
            This may take a moment for large files.
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 'done' && importResults && (
        <div style={{ textAlign: 'center', padding: SPACING.lg }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
            Import Complete
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: SPACING.xl, marginBottom: SPACING.lg }}>
            <ResultStat label="Customers Created" value={importResults.customersCreated} color={COLORS.success} />
            <ResultStat label="Customers Updated" value={importResults.customersUpdated} color={COLORS.info} />
            <ResultStat label="Vehicles Added" value={importResults.vehiclesCreated} color={COLORS.textPrimary} />
            <ResultStat label="Jobs Recorded" value={importResults.jobsCreated} color={COLORS.textPrimary} />
          </div>
          {importResults.errors.length > 0 && (
            <div style={{
              textAlign: 'left', marginTop: SPACING.md, padding: SPACING.md,
              background: COLORS.dangerBg, borderRadius: RADIUS.sm,
              maxHeight: 120, overflowY: 'auto',
            }}>
              <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.danger, marginBottom: 4 }}>
                {importResults.errors.length} error{importResults.errors.length !== 1 ? 's' : ''}:
              </div>
              {importResults.errors.map((err, i) => (
                <div key={i} style={{ fontSize: FONT.sizeXs, color: COLORS.danger }}>{err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, color }}>{value}</div>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}

const previewThStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontWeight: 600,
  color: COLORS.textMuted,
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
  whiteSpace: 'nowrap',
};

const previewTdStyle: React.CSSProperties = {
  padding: '4px 10px',
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
  whiteSpace: 'nowrap',
  maxWidth: 150,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
