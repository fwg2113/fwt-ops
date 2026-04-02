'use client'

import { useState } from 'react'
import type { EstimatorState, RoomEntry, WindowEntry } from '@/app/lib/flat-glass-state'
import {
  RESIDENTIAL_ROOM_TYPES,
  COMMERCIAL_ROOM_TYPES,
  RESIDENTIAL_WINDOW_TYPES,
  COMMERCIAL_WINDOW_TYPES,
  ACCESS_LEVELS,
  DEFAULT_PRICING,
  PRICING_MULTIPLIER,
  getNextWindowTier,
  calculatePriceBreakdown,
  formatPrice,
} from '@/app/lib/flat-glass-data'
import type { RoomTypeEntry, WindowTypeEntry } from '@/app/lib/flat-glass-data'

interface Props {
  state: EstimatorState
  updateState: (updates: Partial<EstimatorState>) => void
  onContinue: () => void
  onBack: () => void
}

// ============================================================================
// WINDOW TYPE SVG ICONS (ported from legacy getWindowTypeSVG)
// ============================================================================

function getWindowTypeSVG(typeId: string, small = false) {
  const size = small ? 'width="50" height="50"' : 'width="70" height="70"'

  const svgs: Record<string, string> = {
    hung: `<svg ${size} viewBox="0 0 70 100"><rect x="5" y="5" width="60" height="90" rx="2" fill="none" stroke="#374151" stroke-width="2"/><line x1="5" y1="50" x2="65" y2="50" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="52" height="38" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><rect x="9" y="53" width="52" height="38" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    sliding: `<svg ${size} viewBox="0 0 100 80"><rect x="5" y="5" width="90" height="70" rx="2" fill="none" stroke="#374151" stroke-width="2"/><line x1="50" y1="5" x2="50" y2="75" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="38" height="62" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><rect x="53" y="9" width="38" height="62" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    single: `<svg ${size} viewBox="0 0 90 70"><rect x="5" y="5" width="80" height="60" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="72" height="52" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    single_tall: `<svg ${size} viewBox="0 0 55 100"><rect x="5" y="5" width="45" height="90" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="37" height="82" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    storefront: `<svg ${size} viewBox="0 0 100 70"><rect x="5" y="5" width="90" height="60" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="82" height="52" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><line x1="5" y1="60" x2="95" y2="60" stroke="#374151" stroke-width="3"/></svg>`,
    entry_door: `<svg ${size} viewBox="0 0 60 100"><rect x="5" y="5" width="50" height="90" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="10" y="10" width="40" height="60" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><circle cx="45" cy="80" r="4" fill="#374151"/></svg>`,
    arch: `<svg ${size} viewBox="0 0 70 90"><path d="M5 90 L5 35 Q5 5 35 5 Q65 5 65 35 L65 90" fill="none" stroke="#374151" stroke-width="2"/><path d="M9 88 L9 36 Q9 10 35 10 Q61 10 61 36 L61 88" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    sidelight: `<svg ${size} viewBox="0 0 40 100"><rect x="5" y="5" width="30" height="90" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="22" height="82" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    transom: `<svg ${size} viewBox="0 0 100 40"><rect x="5" y="5" width="90" height="30" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="82" height="22" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/></svg>`,
    casement: `<svg ${size} viewBox="0 0 70 90"><rect x="5" y="5" width="60" height="80" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="52" height="72" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><circle cx="55" cy="45" r="3" fill="#374151"/></svg>`,
    misc: `<svg ${size} viewBox="0 0 70 70"><rect x="5" y="5" width="60" height="60" rx="2" fill="none" stroke="#374151" stroke-width="2"/><rect x="9" y="9" width="52" height="52" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/><text x="35" y="40" text-anchor="middle" font-size="12" fill="#6b7280">?</text></svg>`,
  }

  return svgs[typeId] || svgs.misc
}

function getWindowMeasureSVG(typeId: string, measuring: 'width' | 'height') {
  const isWidth = measuring === 'width'

  if (typeId === 'hung') {
    return `<svg width="120" height="180" viewBox="0 0 120 180">
      <rect x="20" y="10" width="80" height="140" rx="2" fill="none" stroke="#374151" stroke-width="2"/>
      <line x1="20" y1="80" x2="100" y2="80" stroke="#374151" stroke-width="2"/>
      <rect x="24" y="14" width="72" height="62" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/>
      <rect x="24" y="84" width="72" height="62" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/>
      ${isWidth ? `
        <line x1="24" y1="160" x2="96" y2="160" stroke="#d61f26" stroke-width="2"/>
        <line x1="24" y1="157" x2="24" y2="163" stroke="#d61f26" stroke-width="2"/>
        <line x1="96" y1="157" x2="96" y2="163" stroke="#d61f26" stroke-width="2"/>
        <text x="60" y="178" text-anchor="middle" font-size="11" fill="#d61f26" font-weight="600">\u2190 WIDTH \u2192</text>
      ` : `
        <line x1="110" y1="84" x2="110" y2="146" stroke="#d61f26" stroke-width="2"/>
        <line x1="107" y1="84" x2="113" y2="84" stroke="#d61f26" stroke-width="2"/>
        <line x1="107" y1="146" x2="113" y2="146" stroke="#d61f26" stroke-width="2"/>
        <text x="60" y="178" text-anchor="middle" font-size="11" fill="#d61f26" font-weight="600">HEIGHT \u2195</text>
      `}
    </svg>`
  }

  return `<svg width="140" height="120" viewBox="0 0 140 120">
    <rect x="20" y="10" width="100" height="70" rx="2" fill="none" stroke="#374151" stroke-width="2"/>
    <rect x="24" y="14" width="92" height="62" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/>
    ${isWidth ? `
      <line x1="24" y1="95" x2="116" y2="95" stroke="#d61f26" stroke-width="2"/>
      <line x1="24" y1="92" x2="24" y2="98" stroke="#d61f26" stroke-width="2"/>
      <line x1="116" y1="92" x2="116" y2="98" stroke="#d61f26" stroke-width="2"/>
      <text x="70" y="115" text-anchor="middle" font-size="11" fill="#d61f26" font-weight="600">\u2190 WIDTH \u2192</text>
    ` : `
      <line x1="130" y1="14" x2="130" y2="76" stroke="#d61f26" stroke-width="2"/>
      <line x1="127" y1="14" x2="133" y2="14" stroke="#d61f26" stroke-width="2"/>
      <line x1="127" y1="76" x2="133" y2="76" stroke="#d61f26" stroke-width="2"/>
      <text x="70" y="115" text-anchor="middle" font-size="11" fill="#d61f26" font-weight="600">HEIGHT \u2195</text>
    `}
  </svg>`
}

// ============================================================================
// MEASURE PRIMER MODAL
// ============================================================================

function MeasurePrimerModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fwt-primer-modal-overlay" onClick={onDismiss}>
      <div className="fwt-primer-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="primer-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
          Quick Guide: Counting Panes
        </h3>
        <p className="primer-intro">We measure by <strong>pane of glass</strong>, not by window frame. Here&apos;s what that means:</p>

        <div className="primer-examples">
          <div className="primer-example">
            <div className="primer-diagram" dangerouslySetInnerHTML={{ __html: `
              <svg viewBox="0 0 80 120" style="width:100%;height:100%">
                <rect x="5" y="5" width="70" height="110" rx="2" fill="none" stroke="#666" stroke-width="3"/>
                <line x1="5" y1="60" x2="75" y2="60" stroke="#666" stroke-width="3"/>
                <rect x="10" y="10" width="60" height="45" fill="rgba(96,165,250,0.25)" stroke="#60a5fa" stroke-width="1.5"/>
                <text x="40" y="38" text-anchor="middle" font-size="16" fill="#93c5fd" font-weight="700">1</text>
                <rect x="10" y="65" width="60" height="45" fill="rgba(96,165,250,0.25)" stroke="#60a5fa" stroke-width="1.5"/>
                <text x="40" y="93" text-anchor="middle" font-size="16" fill="#93c5fd" font-weight="700">2</text>
              </svg>
            ` }} />
            <strong>Double-Hung</strong>
            <span className="primer-count">= 2 panes</span>
          </div>

          <div className="primer-example">
            <div className="primer-diagram primer-diagram-wide" dangerouslySetInnerHTML={{ __html: `
              <svg viewBox="0 0 120 100" style="width:100%;height:100%">
                <rect x="5" y="5" width="110" height="90" rx="2" fill="none" stroke="#666" stroke-width="3"/>
                <line x1="60" y1="5" x2="60" y2="95" stroke="#666" stroke-width="3"/>
                <rect x="10" y="10" width="45" height="80" fill="rgba(96,165,250,0.25)" stroke="#60a5fa" stroke-width="1.5"/>
                <text x="32" y="55" text-anchor="middle" font-size="16" fill="#93c5fd" font-weight="700">1</text>
                <rect x="65" y="10" width="45" height="80" fill="rgba(96,165,250,0.25)" stroke="#60a5fa" stroke-width="1.5"/>
                <text x="88" y="55" text-anchor="middle" font-size="16" fill="#93c5fd" font-weight="700">2</text>
              </svg>
            ` }} />
            <strong>Sliding Door</strong>
            <span className="primer-count">= 2 panes</span>
          </div>

          <div className="primer-example">
            <div className="primer-diagram primer-diagram-single" dangerouslySetInnerHTML={{ __html: `
              <svg viewBox="0 0 100 80" style="width:100%;height:100%">
                <rect x="5" y="5" width="90" height="70" rx="2" fill="none" stroke="#666" stroke-width="3"/>
                <rect x="10" y="10" width="80" height="60" fill="rgba(96,165,250,0.25)" stroke="#60a5fa" stroke-width="1.5"/>
                <text x="50" y="48" text-anchor="middle" font-size="16" fill="#93c5fd" font-weight="700">1</text>
              </svg>
            ` }} />
            <strong>Single Window</strong>
            <span className="primer-count">= 1 pane</span>
          </div>
        </div>

        <div className="primer-tip">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/></svg>
          <div>
            <strong>Measuring tip:</strong> If panes are slightly different sizes, measure the <em>wider</em> one. We&apos;ll cut both pieces to fit.
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={onDismiss}>
          Got It - Let&apos;s Measure
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// ROOM TYPE MODAL
// ============================================================================

function RoomTypeModal({ roomTypes, onSelect, onClose }: { roomTypes: RoomTypeEntry[]; onSelect: (rt: RoomTypeEntry) => void; onClose: () => void }) {
  return (
    <div className="room-modal-overlay" onClick={onClose}>
      <div className="room-modal" onClick={(e) => e.stopPropagation()}>
        <button className="room-modal-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div className="room-modal-header">
          <h3>What type of room is this?</h3>
        </div>
        <div className="room-modal-body">
          <div className="room-type-grid">
            {roomTypes.map((rt) => (
              <div key={rt.id} className="room-type-option" onClick={() => onSelect(rt)}>
                {rt.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TOTALS PANEL (side column)
// ============================================================================

function TotalsPanel({ state, totals }: { state: EstimatorState; totals: { totalSqFt: number; totalPanes: number; hasOversized: boolean } }) {
  const hasAnyWindows = state.rooms.some((r) => r.windows.length > 0)
  const activeDiscount = state.promoDiscount || state.baseDiscount || 0.25

  // Calculate price range across all films (since film isn't chosen yet)
  const allFilmIds = Object.keys(DEFAULT_PRICING)
  let minPrice = Infinity
  let maxPrice = 0

  if (hasAnyWindows) {
    allFilmIds.forEach((fId) => {
      const bd = calculatePriceBreakdown(fId, state.rooms)
      if (bd.total > 0) {
        const retail = Math.round(bd.total * PRICING_MULTIPLIER)
        const discounted = Math.round(retail * (1 - activeDiscount))
        if (discounted < minPrice) minPrice = discounted
        if (discounted > maxPrice) maxPrice = discounted
      }
    })
  }

  if (minPrice === Infinity) minPrice = 0

  // Next tier teaser
  const nextTier = getNextWindowTier(totals.totalPanes)

  return (
    <div className="totals-panel">
      <h3>Your Estimate</h3>
      <div className="totals-stats">
        <div className="stat">
          <span className="stat-value">{totals.totalPanes}</span>
          <span className="stat-label">Panes</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totals.totalSqFt.toFixed(1)}</span>
          <span className="stat-label">Sq Ft</span>
        </div>
      </div>

      {/* Price range (film not yet chosen) */}
      {hasAnyWindows && minPrice > 0 ? (
        <div className="price-total-box">
          <div className="price-your-price-label">Estimated Range</div>
          <div className="price-commit-value">
            {minPrice === maxPrice
              ? formatPrice(minPrice)
              : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`}
          </div>
          <div className="price-savings-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            {Math.round(activeDiscount * 100)}% online discount applied
          </div>
          <div className="price-urgency">Exact price determined by film selection</div>
        </div>
      ) : (
        <div className="price-total-box empty">
          <div className="price-your-price-label">Estimated Price</div>
          <div className="price-commit-value">&mdash;</div>
        </div>
      )}

      {totals.hasOversized && <p className="disclaimer">* Includes oversized windows - final price confirmed on-site.</p>}
      <p className="disclaimer">Final price contingent upon accurate measurements and access information.</p>

      {/* Discount teaser */}
      {nextTier && nextTier.windowsNeeded > 0 && (nextTier.nextDiscount - nextTier.currentDiscount) > 0 && (
        <div className="discount-teaser">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <div className="teaser-content">
            <strong>Add {nextTier.windowsNeeded} more pane{nextTier.windowsNeeded > 1 ? 's' : ''}</strong> to save an extra <strong>${nextTier.nextDiscount - nextTier.currentDiscount}/ft&sup2;</strong> on your entire project!
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type WizardStep = 'summary' | 'window-type' | 'width' | 'height' | 'actions' | 'post-save'

export default function MeasurementsSection({ state, updateState, onContinue, onBack }: Props) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('summary')
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0)
  const [pendingWindow, setPendingWindow] = useState<WindowEntry | null>(null)
  const [showPrimer, setShowPrimer] = useState(!state.measurePrimerShown)
  const [showRoomTypeModal, setShowRoomTypeModal] = useState(false)
  // Film choice modal removed — film selection happens after measurements in new flow

  const roomTypes = state.propertyType === 'commercial' ? COMMERCIAL_ROOM_TYPES : RESIDENTIAL_ROOM_TYPES
  const windowTypes = state.propertyType === 'commercial' ? COMMERCIAL_WINDOW_TYPES : RESIDENTIAL_WINDOW_TYPES
  const hasWindows = state.rooms.some((r) => r.windows.length > 0)

  // Calculate totals
  const calculateTotals = () => {
    let totalSqFt = 0
    let totalPanes = 0
    let hasOversized = false

    state.rooms.forEach((room) => {
      room.windows.forEach((win) => {
        const w = win.width === 'oversize' ? 120 : parseFloat(String(win.width)) || 0
        const h = win.height === 'oversize' ? 120 : parseFloat(String(win.height)) || 0
        const qty = win.quantity || 1
        const panes = win.panes || 1
        if (win.width === 'oversize' || win.height === 'oversize') hasOversized = true
        if (w > 0 && h > 0) {
          totalSqFt += (w * h / 144) * qty * panes
          totalPanes += qty * panes
        }
      })
    })

    return { totalSqFt: Math.round(totalSqFt * 10) / 10, totalPanes, hasOversized }
  }

  const totals = calculateTotals()

  const getWindowType = (id: string) => windowTypes.find((wt) => wt.id === id) || windowTypes[0]

  // ---- Room management ----

  const addRoom = (rt: RoomTypeEntry) => {
    const counters = { ...state.roomCounters }
    let label = rt.label
    if (rt.sequential) {
      counters[rt.id] = (counters[rt.id] || 0) + 1
      if (rt.id !== 'custom') label = `${rt.label} ${counters[rt.id]}`
    }

    const newRoom: RoomEntry = {
      roomType: rt.id,
      roomLabel: label,
      filmType: 'recommended',
      decorativeSelections: [],
      securitySelection: null,
      windows: [],
    }

    const rooms = [...state.rooms, newRoom]
    const newIndex = rooms.length - 1
    setCurrentRoomIndex(newIndex)
    updateState({ rooms, roomCounters: counters })
    setShowRoomTypeModal(false)
    setWizardStep('window-type')
  }

  const removeRoom = (index: number) => {
    const rooms = state.rooms.filter((_, i) => i !== index)
    updateState({ rooms })
  }

  const removeWindow = (roomIndex: number, winIndex: number) => {
    const rooms = [...state.rooms]
    const room = { ...rooms[roomIndex] }
    room.windows = room.windows.filter((_, i) => i !== winIndex)
    rooms[roomIndex] = room
    updateState({ rooms })
  }

  // ---- Window wizard ----

  const selectWindowType = (wt: WindowTypeEntry) => {
    setPendingWindow({
      windowType: wt.id,
      width: '',
      height: '',
      quantity: 1,
      panes: wt.panes,
      accessLevels: [ACCESS_LEVELS.GROUND],
    })
    setWizardStep('width')
  }

  const setWidth = (w: string | number) => {
    if (pendingWindow) {
      setPendingWindow({ ...pendingWindow, width: w })
      if (w !== '') setWizardStep('height')
    }
  }

  const setHeight = (h: string | number) => {
    if (pendingWindow) {
      setPendingWindow({ ...pendingWindow, height: h })
      if (h !== '') setWizardStep('actions')
    }
  }

  const saveWindow = () => {
    if (!pendingWindow) return
    const rooms = [...state.rooms]
    const room = { ...rooms[currentRoomIndex] }
    room.windows = [...room.windows, { ...pendingWindow }]
    rooms[currentRoomIndex] = room
    updateState({ rooms })
    setWizardStep('post-save')
  }

  const startAddWindow = (roomIndex: number) => {
    setCurrentRoomIndex(roomIndex)
    setPendingWindow(null)
    setWizardStep('window-type')
  }

  const openAddRoom = () => {
    setShowRoomTypeModal(true)
  }

  const handlePrimerDismiss = () => {
    setShowPrimer(false)
    updateState({ measurePrimerShown: true })
    if (state.rooms.length === 0) {
      setShowRoomTypeModal(true)
    }
  }

  const currentRoom = state.rooms[currentRoomIndex]

  // ============================================================================
  // WIZARD: Window Type Step
  // ============================================================================

  if (wizardStep === 'window-type' && currentRoom) {
    return (
      <div className="fwt-container content-page">
        <div className="fwt-header">
          <h2>Measure Your Windows</h2>
          <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
        </div>
        <div className="two-column-layout">
          <div className="main-column">
            <div className="wizard-card">
              <div className="wizard-step-indicator">Step 1 of 4</div>
              <div className="wizard-room-tag">{currentRoom.roomLabel}</div>
              <h3>What type of window?</h3>
              <p className="wizard-hint">Select the style that best matches.</p>
              <div className="window-type-grid">
                {windowTypes.map((wt) => (
                  <button
                    key={wt.id}
                    className={`window-type-btn ${pendingWindow?.windowType === wt.id ? 'selected' : ''}`}
                    onClick={() => selectWindowType(wt)}
                  >
                    <div dangerouslySetInnerHTML={{ __html: getWindowTypeSVG(wt.id) }} />
                    <span className="window-type-label">{wt.label}</span>
                    <span className="window-type-panes">{wt.panes} pane{wt.panes > 1 ? 's' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
            {renderWizardSummary()}
          </div>
          <div className="side-column">
            <TotalsPanel state={state} totals={totals} />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setWizardStep('summary')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {showPrimer && <MeasurePrimerModal onDismiss={handlePrimerDismiss} />}
        {showRoomTypeModal && <RoomTypeModal roomTypes={roomTypes} onSelect={addRoom} onClose={() => setShowRoomTypeModal(false)} />}
      </div>
    )
  }

  // ============================================================================
  // WIZARD: Width Step
  // ============================================================================

  if (wizardStep === 'width' && pendingWindow && currentRoom) {
    const wt = getWindowType(pendingWindow.windowType)
    const is2Pane = wt.panes === 2

    return (
      <div className="fwt-container content-page">
        <div className="fwt-header">
          <h2>Measure Your Windows</h2>
          <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
        </div>
        <div className="two-column-layout">
          <div className="main-column">
            <div className="wizard-card">
              <div className="wizard-step-indicator">Step 2 of 4</div>
              <div className="wizard-room-tag">{currentRoom.roomLabel} &bull; {wt.label}</div>
              <h3>Measure the width</h3>
              <p className="wizard-hint">
                {is2Pane
                  ? <>Measure the <strong>wider</strong> pane. We&apos;ll cut both pieces to that size.</>
                  : 'Measure edge to edge, inside the frame. Round UP.'}
              </p>

              <div className="wizard-measure-visual" dangerouslySetInnerHTML={{ __html: getWindowMeasureSVG(pendingWindow.windowType, 'width') }} />

              <div className="wizard-input-row">
                <label>Width (inches)</label>
                <select
                  className="wizard-dimension-input"
                  value={String(pendingWindow.width)}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'oversize') setWidth('oversize')
                    else if (val) setWidth(Number(val))
                  }}
                >
                  <option value="">Select...</option>
                  {Array.from({ length: 120 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}&quot;</option>
                  ))}
                  <option value="oversize">Wider than 120&quot;</option>
                </select>
              </div>
            </div>
            {renderWizardSummary()}
          </div>
          <div className="side-column">
            <TotalsPanel state={state} totals={totals} />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setWizardStep('window-type')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // WIZARD: Height Step
  // ============================================================================

  if (wizardStep === 'height' && pendingWindow && currentRoom) {
    const wt = getWindowType(pendingWindow.windowType)
    const is2Pane = wt.panes === 2

    return (
      <div className="fwt-container content-page">
        <div className="fwt-header">
          <h2>Measure Your Windows</h2>
          <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
        </div>
        <div className="two-column-layout">
          <div className="main-column">
            <div className="wizard-card">
              <div className="wizard-step-indicator">Step 3 of 4</div>
              <div className="wizard-room-tag">{currentRoom.roomLabel} &bull; {wt.label} &bull; {pendingWindow.width}&quot;W</div>
              <h3>Measure the height</h3>
              <p className="wizard-hint">
                {is2Pane
                  ? 'Both panes should be similar height. Measure the taller one if different.'
                  : 'Measure top to bottom, inside the frame. Round UP.'}
              </p>

              <div className="wizard-measure-visual" dangerouslySetInnerHTML={{ __html: getWindowMeasureSVG(pendingWindow.windowType, 'height') }} />

              <div className="wizard-dimension-summary">
                <span className="dim-label">Width:</span>
                <span className="dim-value">{pendingWindow.width === 'oversize' ? '120"+' : `${pendingWindow.width}"`}</span>
                <button className="btn-text-link" onClick={() => setWizardStep('width')}>Edit</button>
              </div>

              <div className="wizard-input-row">
                <label>Height (inches)</label>
                <select
                  className="wizard-dimension-input"
                  value={String(pendingWindow.height)}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'oversize') setHeight('oversize')
                    else if (val) setHeight(Number(val))
                  }}
                >
                  <option value="">Select...</option>
                  {Array.from({ length: 120 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}&quot;</option>
                  ))}
                  <option value="oversize">Taller than 120&quot;</option>
                </select>
              </div>
            </div>
            {renderWizardSummary()}
          </div>
          <div className="side-column">
            <TotalsPanel state={state} totals={totals} />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setWizardStep('width')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // WIZARD: Actions Step (Quantity + Access)
  // ============================================================================

  if (wizardStep === 'actions' && pendingWindow && currentRoom) {
    const wt = getWindowType(pendingWindow.windowType)
    const totalPanes = pendingWindow.quantity * wt.panes
    const hasElevatedAccess = pendingWindow.accessLevels.some((a) => a !== ACCESS_LEVELS.GROUND)

    return (
      <div className="fwt-container content-page">
        <div className="fwt-header">
          <h2>Measure Your Windows</h2>
          <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
        </div>
        <div className="two-column-layout">
          <div className="main-column">
            <div className="wizard-card wizard-actions-card">
              <div className="wizard-step-indicator">Step 4 of 4</div>
              <div className="wizard-room-tag">{currentRoom.roomLabel}</div>

              <div className="current-window-header">
                <span className="current-window-label">{wt.label} &bull; {pendingWindow.width}&quot; x {pendingWindow.height}&quot;</span>
                <button className="btn-text-link" onClick={() => setWizardStep('window-type')}>Edit</button>
              </div>

              <div className="wizard-quantity-row">
                <p className="wizard-hint">How many <strong>windows</strong> this size in {currentRoom.roomLabel}?</p>
                <p className="wizard-sub-hint">Count the frames, not the panes - we&apos;ll calculate panes automatically.</p>
                <div className="quantity-buttons">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      className={`qty-btn ${pendingWindow.quantity === n ? 'selected' : ''}`}
                      onClick={() => {
                        const accessLevels = Array.from({ length: n }, (_, i) => pendingWindow.accessLevels[i] || ACCESS_LEVELS.GROUND)
                        setPendingWindow({ ...pendingWindow, quantity: n, accessLevels })
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    className={`qty-input-other ${pendingWindow.quantity > 6 ? 'has-value' : ''}`}
                    placeholder="7+"
                    min={7}
                    max={99}
                    value={pendingWindow.quantity > 6 ? pendingWindow.quantity : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 7
                      const accessLevels = Array.from({ length: val }, (_, i) => pendingWindow.accessLevels[i] || ACCESS_LEVELS.GROUND)
                      setPendingWindow({ ...pendingWindow, quantity: val, accessLevels })
                    }}
                  />
                </div>

                <div className="pane-calculation">
                  <span className="calc-formula">{pendingWindow.quantity} window{pendingWindow.quantity > 1 ? 's' : ''} x {wt.panes} individual pane{wt.panes > 1 ? 's' : ''}</span>
                  <span className="calc-result">= <strong>{totalPanes} total window panes</strong></span>
                </div>
              </div>

              <div className="wizard-access-section">
                <p className="wizard-hint">Can you reach the <strong>top</strong> of {pendingWindow.quantity > 1 ? 'these windows' : 'this window'} while standing on the ground?</p>
                <div className="access-choice-buttons">
                  <button
                    className={`access-choice-btn ${!hasElevatedAccess ? 'selected' : ''}`}
                    onClick={() => {
                      const accessLevels = Array.from({ length: pendingWindow.quantity }, () => ACCESS_LEVELS.GROUND)
                      setPendingWindow({ ...pendingWindow, accessLevels })
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Yes{pendingWindow.quantity > 1 ? ', all of them' : ''}
                  </button>
                  <button
                    className={`access-choice-btn ${hasElevatedAccess ? 'selected' : ''}`}
                    onClick={() => {
                      const accessLevels = Array.from({ length: pendingWindow.quantity }, () => ACCESS_LEVELS.STEP_STOOL)
                      setPendingWindow({ ...pendingWindow, accessLevels })
                    }}
                  >
                    No, {pendingWindow.quantity > 1 ? 'some are' : "it's"} out of reach
                  </button>
                </div>

                {hasElevatedAccess && (
                  <div className="access-detail-section">
                    <p className="wizard-sub-hint">{pendingWindow.quantity > 1 ? 'Set access level for each window:' : 'What will be needed to reach the top?'}</p>
                    <div className="access-window-grid">
                      {Array.from({ length: pendingWindow.quantity }, (_, i) => {
                        const accessLevel = pendingWindow.accessLevels[i] || ACCESS_LEVELS.GROUND
                        return (
                          <div key={i} className={`access-window-item ${accessLevel !== ACCESS_LEVELS.GROUND ? 'elevated' : ''}`}>
                            <div className="access-window-icon" dangerouslySetInnerHTML={{ __html: getWindowTypeSVG(pendingWindow.windowType, true) }} />
                            <span className="access-window-num">#{i + 1}</span>
                            <select
                              className="access-level-select"
                              value={accessLevel}
                              onChange={(e) => {
                                const newLevels = [...pendingWindow.accessLevels]
                                newLevels[i] = e.target.value
                                setPendingWindow({ ...pendingWindow, accessLevels: newLevels })
                              }}
                            >
                              <option value={ACCESS_LEVELS.GROUND}>Ground</option>
                              <option value={ACCESS_LEVELS.STEP_STOOL}>Step stool</option>
                              <option value={ACCESS_LEVELS.LADDER}>6ft ladder</option>
                              <option value={ACCESS_LEVELS.TALL_LADDER}>Tall ladder</option>
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="wizard-action-buttons">
                <button className="btn btn-primary" onClick={saveWindow}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                  Add {pendingWindow.quantity} Window{pendingWindow.quantity > 1 ? 's' : ''} ({totalPanes} pane{totalPanes > 1 ? 's' : ''})
                </button>
              </div>
            </div>
            {renderWizardSummary()}
          </div>
          <div className="side-column">
            <TotalsPanel state={state} totals={totals} />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setWizardStep('height')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // WIZARD: Post-Save Step
  // ============================================================================

  if (wizardStep === 'post-save' && currentRoom) {
    const lastWindow = currentRoom.windows[currentRoom.windows.length - 1]
    const wt = lastWindow ? getWindowType(lastWindow.windowType) : null
    const paneCount = lastWindow ? lastWindow.quantity * (wt?.panes || 1) : 0

    return (
      <div className="fwt-container content-page">
        <div className="fwt-header">
          <h2>Measure Your Windows</h2>
          <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
        </div>
        <div className="two-column-layout">
          <div className="main-column">
            <div className="wizard-card wizard-success-card">
              <div className="wizard-success-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h3>Added!</h3>
              {lastWindow && wt && (
                <p className="wizard-success-detail">
                  {lastWindow.quantity} x {wt.label} ({lastWindow.width}&quot; x {lastWindow.height}&quot;)<br />
                  <strong>{paneCount} panes</strong> added to {currentRoom.roomLabel}
                </p>
              )}
              <p className="wizard-prompt">What would you like to do next?</p>
              <div className="wizard-next-buttons">
                <button className="btn btn-primary" onClick={() => { setPendingWindow(null); setWizardStep('window-type') }}>
                  + Add More Windows to {currentRoom.roomLabel}
                </button>
                <button className="btn btn-secondary" onClick={openAddRoom}>
                  + Add Another Room
                </button>
                <button className="btn btn-outline" onClick={() => setWizardStep('summary')}>
                  I&apos;m Done Measuring
                </button>
              </div>
            </div>
            {renderWizardSummary()}
          </div>
          <div className="side-column">
            <TotalsPanel state={state} totals={totals} />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {showRoomTypeModal && <RoomTypeModal roomTypes={roomTypes} onSelect={addRoom} onClose={() => setShowRoomTypeModal(false)} />}
      </div>
    )
  }

  // ============================================================================
  // WIZARD SUMMARY (inline, shows added windows)
  // ============================================================================

  function renderWizardSummary() {
    const roomsWithWindows = state.rooms.filter((r) => r.windows.length > 0)
    if (roomsWithWindows.length === 0) return null

    let totalPanesAll = 0
    state.rooms.forEach((r) => r.windows.forEach((w) => {
      const wt = getWindowType(w.windowType)
      totalPanesAll += w.quantity * wt.panes
    }))

    return (
      <div className="wizard-summary">
        <h4>Windows Added</h4>
        {roomsWithWindows.map((room) => {
          const ri = state.rooms.indexOf(room)
          return (
            <div key={ri} className="summary-room">
              <div className="summary-room-header">{room.roomLabel}</div>
              {room.windows.map((win, wi) => {
                const wt = getWindowType(win.windowType)
                const paneCount = wt.panes * win.quantity
                return (
                  <div key={wi} className="summary-window-entry">
                    <div className="summary-window-icons">
                      {Array.from({ length: Math.min(win.quantity, 4) }, (_, i) => (
                        <div key={i} className="summary-icon-item" dangerouslySetInnerHTML={{ __html: getWindowTypeSVG(win.windowType, true) }} />
                      ))}
                    </div>
                    <div className="summary-window-row">
                      <div className="summary-window-info">
                        <span className="summary-window-qty">{win.quantity}x</span>
                        <span className="summary-window-type">{wt.label}</span>
                        <span className="summary-window-dims">{win.width}&quot; x {win.height}&quot;</span>
                        <span className="summary-window-panes">&rarr; {paneCount} pane{paneCount > 1 ? 's' : ''}</span>
                      </div>
                      <div className="summary-window-actions">
                        <button className="btn-icon-small" onClick={() => removeWindow(ri, wi)} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
        <div className="summary-total">
          <strong>{totalPanesAll} panes total</strong>
        </div>
      </div>
    )
  }

  // ============================================================================
  // DEFAULT: Summary / Empty View
  // ============================================================================

  return (
    <div className="fwt-container">
      <div className="fwt-header">
        <h2>Measure Your Windows</h2>
        <p>Selected: <strong>{state.selectedFilm?.displayName}</strong></p>
      </div>

      <div className="two-column-layout">
        <div className="main-column">
          {!hasWindows ? (
            <div className="empty-state">
              <p>No windows added yet. Let&apos;s get started!</p>
              <button className="btn btn-primary" onClick={openAddRoom}>
                + Add First Window
              </button>
            </div>
          ) : (
            <div className="measure-summary">
              {state.rooms.map((room, ri) => (
                <div key={ri} className="summary-room-card">
                  <div className="summary-room-header">
                    <div className="room-header-left">
                      <span className="room-name">{room.roomLabel}</span>
                    </div>
                    <div className="room-header-actions">
                      <button className="btn-text-link" onClick={() => startAddWindow(ri)}>+ Add Window</button>
                      <button className="btn-icon-small" onClick={() => removeRoom(ri)} title="Remove room">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                  {room.windows.length === 0 ? (
                    <p className="no-windows-hint">No windows yet</p>
                  ) : (
                    <div className="summary-windows">
                      {room.windows.map((win, wi) => {
                        const wt = getWindowType(win.windowType)
                        const paneCount = wt.panes * win.quantity
                        return (
                          <div key={wi} className="summary-window-row">
                            <div className="summary-window-icons">
                              {Array.from({ length: Math.min(win.quantity, 3) }, (_, i) => (
                                <div key={i} className="summary-icon-item" dangerouslySetInnerHTML={{ __html: getWindowTypeSVG(win.windowType, true) }} />
                              ))}
                            </div>
                            <div className="summary-window-info">
                              <span className="summary-window-qty">{win.quantity}x</span>
                              <span className="summary-window-type">{wt.label}</span>
                              <span className="summary-window-dims">{win.width}&quot; x {win.height}&quot;</span>
                              <span className="summary-window-panes">&rarr; {paneCount} pane{paneCount > 1 ? 's' : ''}</span>
                            </div>
                            <button className="btn-icon-small" onClick={() => removeWindow(ri, wi)} title="Remove">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary" onClick={openAddRoom}>+ Add Another Room</button>
            </div>
          )}
        </div>
        <div className="side-column">
          <TotalsPanel state={state} totals={totals} />
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <button className="btn btn-primary" onClick={onContinue} disabled={!hasWindows}>
          Continue
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {showPrimer && <MeasurePrimerModal onDismiss={handlePrimerDismiss} />}
      {showRoomTypeModal && <RoomTypeModal roomTypes={roomTypes} onSelect={addRoom} onClose={() => setShowRoomTypeModal(false)} />}
    </div>
  )
}
