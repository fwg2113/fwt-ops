/**
 * FWT Flat Glass Estimator - Application State
 * Mirrors the legacy state object from flatglass-estimator.js
 */

import type { FilmDataEntry, DecorativeFilm, SecurityFilmOption, Recommendation } from './flat-glass-data'

// ============================================================================
// SECTION TYPES
// ============================================================================

export type Section =
  | 'welcome'
  | 'property-type'
  | 'film-selector'
  | 'primer'
  | 'questions'
  | 'path-choice'
  | 'measurements'
  | 'contact'
  | 'options'
  | 'photos'
  | 'contact-come'
  | 'photos-come'
  | 'calendar'
  | 'confirmation'

// ============================================================================
// WINDOW & ROOM TYPES
// ============================================================================

export interface WindowEntry {
  windowType: string
  width: string | number
  height: string | number
  quantity: number
  panes: number
  accessLevels: string[]
}

export type RoomFilmType = 'recommended' | 'performance' | 'decorative' | 'security'

export interface RoomEntry {
  roomType: string
  roomLabel: string
  filmType: RoomFilmType
  filmId?: string
  filmName?: string
  decorativeSelections: { code: string; name: string }[]
  securitySelection: SecurityFilmOption | null
  windows: WindowEntry[]
}

// ============================================================================
// CONTACT
// ============================================================================

export interface ContactInfo {
  name: string
  email: string
  phone: string
  street: string
  city: string
  state: string
  zip: string
  pointOfContact: string
}

export const INITIAL_CONTACT: ContactInfo = {
  name: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  pointOfContact: '',
}

// ============================================================================
// MEASURE WIZARD STATE
// ============================================================================

export type WizardStep = 'room' | 'window-type' | 'width' | 'height' | 'actions' | 'post-save' | 'edit'

export interface MeasureWizardState {
  active: boolean
  step: WizardStep
  currentRoomIndex: number
  currentWindowIndex: number
  pendingWindow: WindowEntry | null
  editingExisting: boolean
}

export const INITIAL_WIZARD: MeasureWizardState = {
  active: false,
  step: 'room',
  currentRoomIndex: 0,
  currentWindowIndex: 0,
  pendingWindow: null,
  editingExisting: false,
}

// ============================================================================
// ROOM MODAL STATE
// ============================================================================

export type RoomModalStep = 'room-type' | 'film-choice' | 'film-questions' | 'decorative-gallery' | 'security-options'

export interface RoomModalState {
  active: boolean
  step: RoomModalStep
  pendingRoom: Partial<RoomEntry> | null
  selectedFilmType: 'recommended' | 'different' | null
  decorativeSelections: { code: string; name: string }[]
  securitySelection: SecurityFilmOption | null
  customRoomName: string
  filmFilter: string
}

export const INITIAL_ROOM_MODAL: RoomModalState = {
  active: false,
  step: 'room-type',
  pendingRoom: null,
  selectedFilmType: null,
  decorativeSelections: [],
  securitySelection: null,
  customRoomName: '',
  filmFilter: 'B',
}

// ============================================================================
// ANSWERS
// ============================================================================

export interface Answers {
  problems: string[]
  appearance: string | null
  lightPreference: string | null
  warmCool: string | null
  timeline: string | null
}

export const INITIAL_ANSWERS: Answers = {
  problems: [],
  appearance: null,
  lightPreference: null,
  warmCool: null,
  timeline: null,
}

// ============================================================================
// TOTALS
// ============================================================================

export interface Totals {
  totalSqFt: number
  totalWindows: number
  totalPanes: number
  hasOversized: boolean
}

// ============================================================================
// FULL APPLICATION STATE
// ============================================================================

export interface EstimatorState {
  currentSection: Section
  propertyType: 'residential' | 'commercial' | null

  // Questions
  answers: Answers
  questionsAnswered: Record<string, boolean>
  questionPrimerShown: boolean
  privacyModalShown: boolean
  privacyDisclaimerShown: boolean

  // Film selector
  filmSelectorFilter: string
  showWarmCoolQuestion: boolean

  // Recommendations & Selection
  recommendations: Recommendation[]
  selectedFilm: { filmId: string; displayName: string } | null

  // Decorative/Security modal state (from Film Selector standalone)
  decorativeModalActive: boolean
  decorativeModalSelections: { code: string; name: string }[]
  securityModalActive: boolean
  securityModalSelection: SecurityFilmOption | null

  // Path choice
  measurePath: 'self' | 'come' | null
  windowCountEstimate: string | null

  // Rooms & Windows
  rooms: RoomEntry[]
  roomCounters: Record<string, number>
  measureWizard: MeasureWizardState
  roomModal: RoomModalState
  measurePrimerShown: boolean

  // Contact
  contact: ContactInfo
  distance: number | null

  // Pricing
  totals: Totals
  price: number
  overridePrice: number | null

  // Intent
  selectedPath: 'save' | 'consult' | 'commit' | 'request' | null
  consultFee: number | null

  // Commit pricing
  originalPrice: number
  commitPrice: number
  commitSavings: number
  depositAmount: number
  currentDiscount: number

  // Calendar
  selectedDate: string | null
  selectedSlot: string | null

  // Photos
  photos: File[]

  // Cancellation
  cancellationAcknowledged: boolean

  // Promo / Incentive
  promoCode: string
  promoDiscount: number // e.g. 0.30 for 30% off
  baseDiscount: number  // e.g. 0.25 for 25% off (no code)

  // Submission
  submissionId: string | null
  submitting: boolean

  // Summary bar
  summaryBarExpanded: boolean
}

export const INITIAL_STATE: EstimatorState = {
  currentSection: 'welcome',
  propertyType: null,

  answers: { ...INITIAL_ANSWERS },
  questionsAnswered: { problems: false, appearance: false, lightPreference: false, timeline: false },
  questionPrimerShown: false,
  privacyModalShown: false,
  privacyDisclaimerShown: false,

  filmSelectorFilter: 'B',
  showWarmCoolQuestion: false,

  recommendations: [],
  selectedFilm: null,

  decorativeModalActive: false,
  decorativeModalSelections: [],
  securityModalActive: false,
  securityModalSelection: null,

  measurePath: null,
  windowCountEstimate: null,

  rooms: [],
  roomCounters: {},
  measureWizard: { ...INITIAL_WIZARD },
  roomModal: { ...INITIAL_ROOM_MODAL },
  measurePrimerShown: false,

  contact: { ...INITIAL_CONTACT },
  distance: null,

  totals: { totalSqFt: 0, totalWindows: 0, totalPanes: 0, hasOversized: false },
  price: 0,
  overridePrice: null,

  selectedPath: null,
  consultFee: null,

  originalPrice: 0,
  commitPrice: 0,
  commitSavings: 0,
  depositAmount: 0,
  currentDiscount: 15,

  selectedDate: null,
  selectedSlot: null,

  photos: [],

  cancellationAcknowledged: false,

  promoCode: '',
  promoDiscount: 0,
  baseDiscount: 0.25, // 25% off for everyone

  submissionId: null,
  submitting: false,

  summaryBarExpanded: false,
}
