'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard'
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme'

// ============================================================================
// CONSULTATIONS PAGE
// Schedule consultation appointments -- meetings with customers to discuss
// options in person (at the shop or off-site). No quote or final pricing.
// ============================================================================

function getTodayString(): string {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let h = 7; h <= 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 18 && m > 0) break
      const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      const minStr = m === 0 ? '00' : String(m)
      options.push({ value: val, label: `${hour12}:${minStr} ${ampm}` })
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

// ============================================================================
// MODULE-SPECIFIC FIELD CONFIG
// Determines which fields show based on the selected service module.
// Default fallback: show vehicle fields only (safe for unknown modules).
// ============================================================================

const MODULE_FIELD_CONFIG: Record<string, { showVehicle: boolean; showPropertyType: boolean; propertyOptions?: string[]; showWrapArea: boolean }> = {
  auto_tint: { showVehicle: true, showPropertyType: false, showWrapArea: false },
  detailing: { showVehicle: true, showPropertyType: false, showWrapArea: false },
  ceramic_coating: { showVehicle: true, showPropertyType: false, showWrapArea: false },
  ppf: { showVehicle: true, showPropertyType: false, showWrapArea: false },
  wraps: { showVehicle: true, showPropertyType: false, showWrapArea: true },
  flat_glass: { showVehicle: false, showPropertyType: true, propertyOptions: ['Home', 'Business'], showWrapArea: false },
  signage: { showVehicle: false, showPropertyType: true, propertyOptions: ['Home', 'Business', 'Vehicle'], showWrapArea: false },
}

const DEFAULT_FIELD_CONFIG = { showVehicle: true, showPropertyType: false, showWrapArea: false }

const WRAP_AREA_OPTIONS = ['Full Wrap', 'Partial Wrap', 'Color Change', 'Commercial']

// ============================================================================
// GOOGLE PLACES AUTOCOMPLETE
// ============================================================================

let googleMapsLoaded = false
let googleMapsLoading = false
const loadCallbacks: (() => void)[] = []

function loadGoogleMaps(callback: () => void) {
  if (googleMapsLoaded) {
    callback()
    return
  }

  loadCallbacks.push(callback)

  if (googleMapsLoading) return
  googleMapsLoading = true

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) return

  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
  script.async = true
  script.defer = true
  script.onload = () => {
    googleMapsLoaded = true
    loadCallbacks.forEach((cb) => cb())
    loadCallbacks.length = 0
  }
  document.head.appendChild(script)
}

type ConsultationType = 'in_shop' | 'off_site'

interface ModuleOption {
  key: string
  label: string
  color: string
}

interface TeamMember {
  id: string
  name: string
  module_permissions: string[]
}

export default function ConsultationsPage() {
  const router = useRouter()

  // Data from API
  const [shopModules, setShopModules] = useState<Array<{ service_modules: { module_key: string; label: string; color: string } }>>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Form state
  const [module, setModule] = useState('')
  const [consultationType, setConsultationType] = useState<ConsultationType>('in_shop')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(getTodayString())
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [assignedTeamMemberId, setAssignedTeamMemberId] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [wrapArea, setWrapArea] = useState('')

  // Google Places autocomplete refs
  const locationInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ date: string; name: string; time: string } | null>(null)

  // Module options
  const moduleOptions: ModuleOption[] = useMemo(() => {
    return shopModules.map(sm => ({
      key: sm.service_modules.module_key,
      label: sm.service_modules.label,
      color: sm.service_modules.color,
    }))
  }, [shopModules])

  // Field config for the selected module
  const fieldConfig = useMemo(() => {
    return MODULE_FIELD_CONFIG[module] || DEFAULT_FIELD_CONFIG
  }, [module])

  // Reset module-specific fields when module changes
  useEffect(() => {
    setVehicleYear('')
    setVehicleMake('')
    setVehicleModel('')
    setPropertyType('')
    setWrapArea('')
  }, [module])

  // Filtered team members by selected module
  const filteredTeam = useMemo(() => {
    if (!module) return teamMembers
    return teamMembers.filter(tm => tm.module_permissions.includes(module))
  }, [teamMembers, module])

  // Google Places autocomplete for off-site location
  const setLocationRef = useRef(setLocation)
  setLocationRef.current = setLocation

  const initAutocomplete = useCallback(() => {
    if (!locationInputRef.current) return
    if (autocompleteRef.current) return

    try {
      if (!window.google?.maps?.places?.Autocomplete) return

      const ac = new google.maps.places.Autocomplete(locationInputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address'],
        types: ['address'],
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place.formatted_address) {
          setLocationRef.current(place.formatted_address)
        }
      })

      autocompleteRef.current = ac
    } catch {
      // Google Maps not available -- manual entry still works
    }
  }, [])

  // Load Google Maps and init autocomplete when off-site is selected
  useEffect(() => {
    if (consultationType !== 'off_site') {
      autocompleteRef.current = null
      return
    }

    loadGoogleMaps(() => {
      setTimeout(initAutocomplete, 100)
    })
  }, [consultationType, initAutocomplete])

  // Fetch modules and team
  useEffect(() => {
    async function fetchData() {
      setDataLoading(true)
      try {
        const [configRes, aptsRes] = await Promise.all([
          fetch('/api/auto/config'),
          fetch(`/api/auto/appointments?date=${getTodayString()}`),
        ])
        const configData = await configRes.json()
        const aptsData = await aptsRes.json()

        if (configData.shopModules) {
          setShopModules(configData.shopModules)
          // Default to first module
          if (configData.shopModules.length > 0) {
            setModule(configData.shopModules[0].service_modules.module_key)
          }
        }
        if (aptsData.teamMembers) {
          setTeamMembers(aptsData.teamMembers)
        }
      } catch {
        // silent
      } finally {
        setDataLoading(false)
      }
    }
    fetchData()
  }, [])

  function resetForm() {
    setConsultationType('in_shop')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setVehicleYear('')
    setVehicleMake('')
    setVehicleModel('')
    setLocation('')
    setDate(getTodayString())
    setTime('09:00')
    setDuration(30)
    setAssignedTeamMemberId('')
    setDescription('')
    setNotes('')
    setPropertyType('')
    setWrapArea('')
    setError(null)
    setSuccess(null)
    if (moduleOptions.length > 0) {
      setModule(moduleOptions[0].key)
    }
  }

  async function handleSubmit() {
    if (!module) {
      setError('Please select a service module.')
      return
    }
    if (!customerName.trim()) {
      setError('Customer name is required.')
      return
    }
    if (!date) {
      setError('Please select a date.')
      return
    }

    setSubmitting(true)
    setError(null)

    const consultLabel = consultationType === 'off_site'
      ? `Consultation (Off-Site): ${description.trim() || 'General consultation'}`
      : `Consultation: ${description.trim() || 'General consultation'}`

    try {
      const res = await fetch('/api/auto/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          customer_email: customerEmail.trim() || null,
          vehicle_year: vehicleYear ? parseInt(vehicleYear, 10) : null,
          vehicle_make: vehicleMake.trim() || null,
          vehicle_model: vehicleModel.trim() || null,
          appointment_date: date,
          appointment_time: time || null,
          duration_minutes: duration,
          appointment_type: 'consultation',
          booking_source: 'internal',
          notes: [
            consultationType === 'off_site' && location.trim() ? `Location: ${location.trim()}` : '',
            notes.trim(),
          ].filter(Boolean).join('\n') || null,
          calendar_title: consultLabel,
          services_json: [{
            label: consultLabel,
            custom_fields: {
              ...(propertyType ? { property_type: propertyType } : {}),
              ...(wrapArea ? { wrap_area: wrapArea } : {}),
              ...(consultationType === 'off_site' && location.trim() ? { location: location.trim() } : {}),
              consultation_type: consultationType,
            },
          }],
          assigned_team_member_id: assignedTeamMemberId || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to create consultation (${res.status})`)
      }

      // Find time label
      const timeLabel = TIME_OPTIONS.find(t => t.value === time)?.label || time

      setSuccess({
        date,
        name: customerName.trim(),
        time: timeLabel,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create consultation')
    } finally {
      setSubmitting(false)
    }
  }

  // Section header style
  const sectionHeader: React.CSSProperties = {
    fontSize: FONT.sizeSm,
    fontWeight: FONT.weightMedium as React.CSSProperties['fontWeight'],
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: SPACING.md,
    marginTop: SPACING.xl,
  }

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: `${SPACING.md}px ${SPACING.lg}px`,
    background: COLORS.inputBg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.borderInput}`,
    borderRadius: RADIUS.md,
    fontSize: FONT.sizeBase,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  }

  // Success state
  if (success) {
    const displayDate = new Date(success.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    return (
      <div>
        <PageHeader
          title="Schedule"
          titleAccent="Consultation"
          subtitle="Appointments"
        />

        <DashboardCard>
          <div style={{
            padding: SPACING.xxxl,
            textAlign: 'center',
            maxWidth: 480,
            margin: '0 auto',
          }}>
            {/* Success icon */}
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: `${COLORS.success}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              marginBottom: SPACING.xl,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            <h2 style={{
              fontSize: FONT.sizeLg,
              fontWeight: FONT.weightBold,
              color: COLORS.textPrimary,
              margin: 0,
              marginBottom: SPACING.sm,
            }}>
              Consultation Scheduled
            </h2>

            <p style={{
              fontSize: FONT.sizeBase,
              color: COLORS.textMuted,
              margin: 0,
              marginBottom: SPACING.xxl,
              lineHeight: 1.6,
            }}>
              {success.name} -- {displayDate} at {success.time}
            </p>

            <div style={{
              display: 'flex',
              gap: SPACING.md,
              justifyContent: 'center',
            }}>
              <Button
                variant="primary"
                onClick={() => router.push(`/appointments?date=${success.date}`)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  View on Calendar
                </span>
              </Button>
              <Button
                variant="secondary"
                onClick={resetForm}
              >
                Schedule Another
              </Button>
            </div>
          </div>
        </DashboardCard>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        titleAccent="Consultation"
        subtitle="Appointments"
      />

      {dataLoading ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
            Loading...
          </div>
        </DashboardCard>
      ) : (
        <DashboardCard>
          <div style={{ padding: SPACING.xl, maxWidth: 720, margin: '0 auto' }}>

            {/* Service Module */}
            <FormField label="Service Module" required>
              <SelectInput value={module} onChange={e => setModule(e.target.value)}>
                {moduleOptions.length === 0 && (
                  <option value="">No modules available</option>
                )}
                {moduleOptions.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </SelectInput>
            </FormField>

            {/* Module color indicator */}
            {module && (() => {
              const mod = moduleOptions.find(m => m.key === module)
              if (!mod) return null
              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING.sm,
                  marginTop: -SPACING.md,
                  marginBottom: SPACING.lg,
                }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: mod.color,
                  }} />
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {mod.label}
                  </span>
                </div>
              )
            })()}

            {/* Consultation Type */}
            <FormField label="Consultation Type" required>
              <SelectInput value={consultationType} onChange={e => setConsultationType(e.target.value as ConsultationType)}>
                <option value="in_shop">In-Shop</option>
                <option value="off_site">Off-Site</option>
              </SelectInput>
            </FormField>

            {/* Customer section */}
            <div style={sectionHeader}>Customer</div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: SPACING.md,
            }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <FormField label="Name" required>
                  <TextInput
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </FormField>
              </div>
              <FormField label="Phone">
                <TextInput
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </FormField>
              <FormField label="Email">
                <TextInput
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </FormField>
            </div>

            {/* Vehicle section -- only when module config says showVehicle */}
            {fieldConfig.showVehicle && (
              <>
                <div style={sectionHeader}>Vehicle</div>
                <div style={{
                  fontSize: FONT.sizeXs,
                  color: COLORS.textMuted,
                  marginTop: -SPACING.sm,
                  marginBottom: SPACING.md,
                }}>
                  Optional -- add if the consultation is about a specific vehicle
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 1fr',
                  gap: SPACING.md,
                }}>
                  <FormField label="Year">
                    <TextInput
                      type="number"
                      value={vehicleYear}
                      onChange={e => setVehicleYear(e.target.value)}
                      placeholder="2024"
                      min={1900}
                      max={2100}
                    />
                  </FormField>
                  <FormField label="Make">
                    <TextInput
                      value={vehicleMake}
                      onChange={e => setVehicleMake(e.target.value)}
                      placeholder="BMW"
                    />
                  </FormField>
                  <FormField label="Model">
                    <TextInput
                      value={vehicleModel}
                      onChange={e => setVehicleModel(e.target.value)}
                      placeholder="M3"
                    />
                  </FormField>
                </div>
              </>
            )}

            {/* Property Type -- only when module config says showPropertyType */}
            {fieldConfig.showPropertyType && (
              <>
                <div style={sectionHeader}>Property</div>
                <FormField label="Property Type">
                  <SelectInput value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                    <option value="">Select type...</option>
                    {(fieldConfig.propertyOptions || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </SelectInput>
                </FormField>
              </>
            )}

            {/* Wrap Area -- only when module config says showWrapArea */}
            {fieldConfig.showWrapArea && (
              <>
                <div style={sectionHeader}>Wrap Details</div>
                <FormField label="Wrap Area">
                  <SelectInput value={wrapArea} onChange={e => setWrapArea(e.target.value)}>
                    <option value="">Select wrap area...</option>
                    {WRAP_AREA_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </SelectInput>
                </FormField>
              </>
            )}

            {/* Location (off-site only) -- with Google Places autocomplete */}
            {consultationType === 'off_site' && (
              <>
                <div style={sectionHeader}>Location</div>
                <FormField label="Address" required>
                  <input
                    ref={locationInputRef}
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="Start typing an address..."
                    autoComplete="off"
                    style={{
                      width: '100%',
                      padding: `${SPACING.md}px ${SPACING.lg}px`,
                      background: COLORS.inputBg,
                      color: COLORS.textPrimary,
                      border: `1px solid ${COLORS.borderInput}`,
                      borderRadius: RADIUS.md,
                      fontSize: FONT.sizeBase,
                      minHeight: 48,
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                </FormField>
              </>
            )}

            {/* Schedule section */}
            <div style={sectionHeader}>Schedule</div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 100px',
              gap: SPACING.md,
            }}>
              <FormField label="Date" required>
                <TextInput
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </FormField>
              <FormField label="Time">
                <SelectInput value={time} onChange={e => setTime(e.target.value)}>
                  {TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Duration">
                <TextInput
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Math.max(15, parseInt(e.target.value) || 15))}
                  min={15}
                  step={15}
                  style={{ textAlign: 'center', paddingLeft: SPACING.sm, paddingRight: SPACING.sm }}
                />
              </FormField>
            </div>
            <div style={{
              fontSize: FONT.sizeXs,
              color: COLORS.textMuted,
              marginTop: -SPACING.sm,
              marginBottom: SPACING.md,
            }}>
              Duration in minutes
            </div>

            {/* Assign To */}
            {filteredTeam.length > 0 && (
              <FormField label="Assign To">
                <SelectInput
                  value={assignedTeamMemberId}
                  onChange={e => setAssignedTeamMemberId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {filteredTeam.map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </SelectInput>
              </FormField>
            )}

            {/* Details section */}
            <div style={sectionHeader}>Details</div>

            <FormField label="Description" hint="What will be discussed during this consultation?">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What will you be discussing? e.g., Full vehicle wrap options, PPF coverage zones, Detailing packages..."
                rows={3}
                style={textareaStyle}
              />
            </FormField>

            <FormField label="Internal Notes">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes visible only to your team..."
                rows={2}
                style={textareaStyle}
              />
            </FormField>

            {/* Error display */}
            {error && (
              <div style={{
                marginTop: SPACING.md,
                padding: `${SPACING.md}px ${SPACING.lg}px`,
                background: COLORS.dangerBg,
                border: `1px solid ${COLORS.danger}`,
                borderRadius: RADIUS.md,
                fontSize: FONT.sizeSm,
                color: COLORS.danger,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <div style={{
              marginTop: SPACING.xxl,
              display: 'flex',
              gap: SPACING.md,
            }}>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                <span style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {submitting ? 'Scheduling...' : 'Schedule Consultation'}
                </span>
              </Button>
            </div>

          </div>
        </DashboardCard>
      )}
    </div>
  )
}
