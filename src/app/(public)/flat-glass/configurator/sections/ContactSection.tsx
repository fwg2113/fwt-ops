'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { ContactInfo } from '@/app/lib/flat-glass-state'

interface Props {
  contact: ContactInfo
  propertyType: 'residential' | 'commercial' | null
  isComeMode: boolean
  windowCountEstimate: string | null
  onUpdateContact: (updates: Partial<ContactInfo>) => void
  onWindowCountChange: (v: string) => void
  onContinue: () => void
  onBack: () => void
}

const WINDOW_COUNT_OPTIONS = [
  { value: '1-5', label: '1-5 windows' },
  { value: '6-10', label: '6-10 windows' },
  { value: '11-24', label: '11-24 windows' },
  { value: '25+', label: '25+ windows' },
]

// Load the Google Maps script once globally
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

export default function ContactSection({
  contact,
  propertyType,
  isComeMode,
  windowCountEstimate,
  onUpdateContact,
  onWindowCountChange,
  onContinue,
  onBack,
}: Props) {
  const isCommercial = propertyType === 'commercial'
  const streetInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  const onUpdateContactRef = useRef(onUpdateContact)
  onUpdateContactRef.current = onUpdateContact

  const initAutocomplete = useCallback(() => {
    if (!streetInputRef.current) return
    if (autocompleteRef.current) return

    try {
      if (!window.google?.maps?.places?.Autocomplete) return

      const ac = new google.maps.places.Autocomplete(streetInputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address'],
        types: ['address'],
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place.address_components) return

        let streetNumber = ''
        let route = ''
        let city = ''
        let state = ''
        let zip = ''

        for (const comp of place.address_components) {
          const type = comp.types[0]
          if (type === 'street_number') streetNumber = comp.long_name
          else if (type === 'route') route = comp.long_name
          else if (type === 'locality') city = comp.long_name
          else if (type === 'administrative_area_level_1') state = comp.short_name
          else if (type === 'postal_code') zip = comp.long_name
        }

        onUpdateContactRef.current({
          street: `${streetNumber} ${route}`.trim(),
          city,
          state,
          zip,
        })
      })

      autocompleteRef.current = ac
    } catch {
      // Google Maps not available — manual entry still works
    }
  }, [])

  useEffect(() => {
    loadGoogleMaps(() => {
      setTimeout(initAutocomplete, 100)
    })
  }, [initAutocomplete])

  const isComplete = () => {
    const base = contact.name && contact.email && contact.phone && contact.street && contact.city && contact.state && contact.zip
    if (isCommercial) return base && contact.pointOfContact
    if (isComeMode) return base && windowCountEstimate
    return base
  }

  return (
    <div className="fwt-container centered-page">
      <div className="fwt-header">
        <h2>{isComeMode ? 'Schedule a Measurement Visit' : 'Your Contact Information'}</h2>
        <p>
          {isComeMode
            ? "Tell us where to come and how to reach you"
            : "We'll need this to prepare your quote and schedule any visits."}
        </p>
      </div>

      <div className="contact-form-container">
        <div className="contact-form">
          <h3>Contact Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={contact.name}
                onChange={(e) => onUpdateContact({ name: e.target.value })}
                placeholder="Your name"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={contact.email}
                onChange={(e) => onUpdateContact({ email: e.target.value })}
                placeholder="your@email.com"
              />
            </div>
            <div className="form-group">
              <label>Phone *</label>
              <input
                type="tel"
                value={contact.phone}
                onChange={(e) => onUpdateContact({ phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <h3>Service Address</h3>
          <div className="form-row">
            <div className="form-group full-width">
              <label>Street Address *</label>
              <input
                ref={streetInputRef}
                type="text"
                value={contact.street}
                onChange={(e) => onUpdateContact({ street: e.target.value })}
                placeholder="Start typing your address..."
                autoComplete="off"
              />
              <span className="form-hint">Used to calculate distance for any site visits</span>
            </div>
          </div>
          <div className="address-row">
            <div className="form-group city-field">
              <label>City *</label>
              <input
                type="text"
                value={contact.city}
                onChange={(e) => onUpdateContact({ city: e.target.value })}
                placeholder="Frederick"
              />
            </div>
            <div className="form-group state-field">
              <label>State *</label>
              <input
                type="text"
                value={contact.state}
                onChange={(e) => onUpdateContact({ state: e.target.value.toUpperCase() })}
                placeholder="MD"
                maxLength={2}
              />
            </div>
            <div className="form-group zip-field">
              <label>Zip *</label>
              <input
                type="text"
                value={contact.zip}
                onChange={(e) => onUpdateContact({ zip: e.target.value })}
                placeholder="21701"
                maxLength={10}
              />
            </div>
          </div>

          {(isCommercial || !isComeMode) && (
            <div className="form-group">
              <label>
                Point of Contact / Ask for Upon Arrival{' '}
                {isCommercial ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                value={contact.pointOfContact}
                onChange={(e) => onUpdateContact({ pointOfContact: e.target.value })}
                placeholder={
                  isCommercial
                    ? 'e.g., Jane in Facilities'
                    : 'e.g., Homeowner name if different'
                }
              />
              <span className="form-hint">
                {isCommercial
                  ? 'Required: Who should we ask for when we arrive?'
                  : 'Optional: Let us know who to expect'}
              </span>
            </div>
          )}

          {isComeMode && (
            <>
              <h3>Approximate Window Count</h3>
              <div className="window-count-options">
                {WINDOW_COUNT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`window-count-btn ${windowCountEstimate === opt.value ? 'active' : ''}`}
                    onClick={() => onWindowCountChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <button className="btn btn-primary" onClick={onContinue} disabled={!isComplete()}>
          See My Options
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  )
}
