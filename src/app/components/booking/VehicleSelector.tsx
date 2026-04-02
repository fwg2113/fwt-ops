'use client';

interface Props {
  years: number[];
  makes: string[];
  models: string[];
  selectedYear: string;
  selectedMake: string;
  selectedModel: string;
  loading: boolean;
  onYearChange: (year: string) => void;
  onMakeChange: (make: string) => void;
  onModelChange: (model: string) => void;
  onNotListed: () => void;
}

export default function VehicleSelector({
  years, makes, models,
  selectedYear, selectedMake, selectedModel,
  loading,
  onYearChange, onMakeChange, onModelChange, onNotListed,
}: Props) {
  function handleYearChange(value: string) {
    if (value === 'NOT_LISTED') { onNotListed(); return; }
    onYearChange(value);
  }

  function handleMakeChange(value: string) {
    if (value === 'NOT_LISTED') { onNotListed(); return; }
    onMakeChange(value);
  }

  function handleModelChange(value: string) {
    if (value === 'NOT_LISTED') { onNotListed(); return; }
    onModelChange(value);
  }

  return (
    <div className="fwt-card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, marginBottom: 16, fontSize: '1.1rem' }}>
        Select Your Vehicle
      </div>

      <div className="fwt-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Year */}
        <div style={{ minWidth: 200, flex: 1 }}>
          <label htmlFor="fwt-year" style={{ fontWeight: 800, display: 'block', margin: '0 0 6px' }}>
            Year
          </label>
          <select
            id="fwt-year"
            className={`fwt-select${loading ? ' loading-blink' : ''}`}
            value={selectedYear}
            onChange={e => handleYearChange(e.target.value)}
            disabled={loading}
            style={{ width: '100%' }}
          >
            <option value="">{loading ? 'Loading years...' : 'Select year...'}</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
            <option value="NOT_LISTED">-- Year Not Listed --</option>
          </select>
        </div>

        {/* Make */}
        <div style={{ minWidth: 200, flex: 1 }}>
          <label htmlFor="fwt-make" style={{ fontWeight: 800, display: 'block', margin: '0 0 6px' }}>
            Make
          </label>
          <select
            id="fwt-make"
            className="fwt-select"
            value={selectedMake}
            onChange={e => handleMakeChange(e.target.value)}
            disabled={!selectedYear}
            style={{ width: '100%' }}
          >
            <option value="">Select make...</option>
            {makes.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            {selectedYear && <option value="NOT_LISTED">-- Make Not Listed --</option>}
          </select>
        </div>

        {/* Model */}
        <div style={{ minWidth: 200, flex: 1 }}>
          <label htmlFor="fwt-model" style={{ fontWeight: 800, display: 'block', margin: '0 0 6px' }}>
            Model
          </label>
          <select
            id="fwt-model"
            className="fwt-select"
            value={selectedModel}
            onChange={e => handleModelChange(e.target.value)}
            disabled={!selectedMake}
            style={{ width: '100%' }}
          >
            <option value="">Select model...</option>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            {selectedMake && <option value="NOT_LISTED">-- Model Not Listed --</option>}
          </select>
        </div>
      </div>
    </div>
  );
}
