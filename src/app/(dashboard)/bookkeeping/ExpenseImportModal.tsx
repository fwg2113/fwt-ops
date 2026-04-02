'use client';

import { useState, useCallback, useMemo } from 'react';
import { Modal, Button, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Props {
  categories: { id: number; type: string; name: string }[];
  onClose: () => void;
  onComplete: () => void;
}

const MAPPABLE_FIELDS = [
  { key: '', label: '-- Skip this column --' },
  { key: 'txn_date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'vendor', label: 'Vendor / Payee' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description / Memo' },
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'account', label: 'Account / Source' },
  { key: 'brand', label: 'Brand / Business' },
  { key: 'direction', label: 'Direction (IN/OUT)' },
  { key: 'event_type', label: 'Type (SALE/EXPENSE/FEE)' },
];

function guessField(header: string): string {
  const h = header.toLowerCase().trim().replace(/[_\s]+/g, '_');
  if (h === 'date' || h === 'txn_date' || h === 'transaction_date' || h === 'posted_date' || h === 'post_date') return 'txn_date';
  if (h === 'amount' || h === 'total' || h === 'debit' || h === 'charge') return 'amount';
  if (h === 'vendor' || h === 'payee' || h === 'merchant' || h === 'name' || h === 'description') return 'vendor';
  if (h === 'category' || h === 'type' || h === 'expense_category') return 'category';
  if (h === 'memo' || h === 'note' || h === 'notes' || h === 'details') return 'description';
  if (h === 'payment_method' || h === 'method' || h === 'payment_type') return 'payment_method';
  if (h === 'account' || h === 'source' || h === 'bank' || h === 'card') return 'account';
  if (h === 'brand' || h === 'business') return 'brand';
  if (h === 'direction' || h === 'in/out' || h === 'in_out') return 'direction';
  return '';
}

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';

export default function ExpenseImportModal({ categories, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [defaultCategory, setDefaultCategory] = useState('Miscellaneous');
  const [defaultDirection, setDefaultDirection] = useState('OUT');
  const [importResults, setImportResults] = useState<{
    imported: number; skipped: number; errors: string[];
  } | null>(null);

  const expenseCategories = categories.filter(c => c.type === 'expense');

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

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

  const mappedRows = useMemo(() => {
    return rows.map(row => {
      const mapped: Record<string, string> = {};
      Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
        if (fieldKey && row[Number(colIdx)]) {
          mapped[fieldKey] = row[Number(colIdx)];
        }
      });
      // Apply defaults
      if (!mapped.category) mapped.category = defaultCategory;
      if (!mapped.direction) mapped.direction = defaultDirection;
      return mapped;
    });
  }, [rows, mapping, defaultCategory, defaultDirection]);

  const hasAmount = useMemo(() => {
    return Object.values(mapping).includes('amount');
  }, [mapping]);

  async function handleImport() {
    setStep('importing');
    try {
      const res = await fetch('/api/bookkeeping/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const data = await res.json();
      setImportResults(data.results || null);
      setStep('done');
    } catch {
      setImportResults({ imported: 0, skipped: 0, errors: ['Import failed'] });
      setStep('done');
    }
  }

  return (
    <Modal
      title={
        step === 'upload' ? 'Import Expenses' :
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
              <Button variant="primary" onClick={() => setStep('preview')} disabled={!hasAmount}>
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
                Import {rows.length} Expenses
              </Button>
            </div>
          </div>
        ) : step === 'done' ? (
          <Button variant="primary" onClick={onComplete}>Done</Button>
        ) : undefined
      }
    >
      {/* Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = COLORS.red; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = COLORS.borderInput; }}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = COLORS.borderInput;
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          style={{
            border: `2px dashed ${COLORS.borderInput}`, borderRadius: RADIUS.lg,
            padding: `${SPACING.xxxl * 2}px`, textAlign: 'center', cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.txt,.tsv';
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
            Bank exports, credit card statements, or manual expense lists
          </div>
        </div>
      )}

      {/* Map */}
      {step === 'map' && (
        <div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
            {headers.length} columns, {rows.length} rows. Map each column to a field.
          </div>

          {/* Defaults */}
          <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, padding: SPACING.md, background: COLORS.activeBg, borderRadius: RADIUS.sm }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Default Category</div>
              <SelectInput value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)} style={{ minHeight: 32, fontSize: FONT.sizeXs }}>
                {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </SelectInput>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Default Direction</div>
              <SelectInput value={defaultDirection} onChange={e => setDefaultDirection(e.target.value)} style={{ minHeight: 32, fontSize: FONT.sizeXs }}>
                <option value="OUT">Expense (OUT)</option>
                <option value="IN">Revenue (IN)</option>
              </SelectInput>
            </div>
          </div>

          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {headers.map((h, i) => {
              const sampleValue = rows[0]?.[i] || '';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.md,
                  padding: `${SPACING.sm}px 0`, borderBottom: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                      {h || `Column ${i + 1}`}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sampleValue || '(empty)'}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <div style={{ width: 200, flexShrink: 0 }}>
                    <SelectInput
                      value={mapping[i] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [i]: e.target.value }))}
                      style={{ minHeight: 32, fontSize: FONT.sizeXs }}
                    >
                      {MAPPABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </SelectInput>
                  </div>
                </div>
              );
            })}
          </div>
          {!hasAmount && (
            <div style={{
              marginTop: SPACING.md, padding: SPACING.md,
              background: COLORS.warningBg, borderRadius: RADIUS.sm,
              fontSize: FONT.sizeSm, color: COLORS.warning,
            }}>
              Map at least an Amount column to continue.
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
            First 10 of {rows.length} rows. Default category: {defaultCategory}, direction: {defaultDirection}.
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeXs }}>
              <thead>
                <tr>
                  <th style={prevThStyle}>#</th>
                  <th style={prevThStyle}>Date</th>
                  <th style={prevThStyle}>Amount</th>
                  <th style={prevThStyle}>Vendor</th>
                  <th style={prevThStyle}>Category</th>
                  <th style={prevThStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td style={prevTdStyle}>{i + 1}</td>
                    <td style={prevTdStyle}>{row.txn_date || '--'}</td>
                    <td style={{ ...prevTdStyle, fontWeight: FONT.weightBold, color: row.direction === 'IN' ? COLORS.success : COLORS.danger }}>
                      {row.direction === 'IN' ? '+' : '-'}${parseFloat(String(row.amount || '0').replace(/[$,]/g, '')).toFixed(2)}
                    </td>
                    <td style={prevTdStyle}>{row.vendor || '--'}</td>
                    <td style={prevTdStyle}>{row.category || defaultCategory}</td>
                    <td style={{ ...prevTdStyle, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
            Importing {rows.length} expenses...
          </div>
        </div>
      )}

      {/* Done */}
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
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, color: COLORS.success }}>{importResults.imported}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Imported</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, color: COLORS.textMuted }}>{importResults.skipped}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Skipped</div>
            </div>
          </div>
          {importResults.errors.length > 0 && (
            <div style={{
              textAlign: 'left', padding: SPACING.md, background: COLORS.dangerBg, borderRadius: RADIUS.sm,
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

const prevThStyle: React.CSSProperties = {
  padding: '6px 10px', fontWeight: 600, color: COLORS.textMuted,
  textAlign: 'left', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};

const prevTdStyle: React.CSSProperties = {
  padding: '4px 10px', color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};
