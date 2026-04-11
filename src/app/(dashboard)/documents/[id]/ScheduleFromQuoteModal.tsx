'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Modal, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard'
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme'
import MiniTimeline from '@/app/components/dashboard/MiniTimeline'

// ============================================================================
// SCHEDULE FROM QUOTE MODAL
// Groups document line items by module, lets the team schedule linked
// appointment slots (sequential or parallel) from an approved document.
// ============================================================================

interface ScheduleFromQuoteModalProps {
  isOpen: boolean
  onClose: () => void
  document: {
    id: string
    customer_name: string
    vehicle_year: number | null
    vehicle_make: string | null
    vehicle_model: string | null
  }
  lineItems: Array<{
    module: string
    description: string
    quantity: number
    unit_price: number
    line_total: number
    custom_fields: Record<string, unknown>
  }>
  shopModules: Array<{
    service_modules: {
      module_key: string
      label: string
      color: string
    }
  }>
  onScheduled: () => void
}

type AppointmentType = 'dropoff' | 'waiting' | 'headsup_30' | 'headsup_60'

interface SlotConfig {
  moduleKey: string
  label: string
  color: string
  duration: number
  date: string
  time: string
  appointmentType: AppointmentType
}

const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'dropoff', label: 'Drop-Off' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'headsup_30', label: 'Flex-Wait (30 min)' },
  { value: 'headsup_60', label: 'Flex-Wait (60 min)' },
]

const DEFAULT_START_TIME = '09:00'

function getNextBusinessDay(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  // Skip Saturday (6) and Sunday (0)
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() + 1)
  if (day === 6) d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + minutes
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function formatTimeDisplay(time: string): string {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function ScheduleFromQuoteModal({
  isOpen,
  onClose,
  document: doc,
  lineItems,
  shopModules,
  onScheduled,
}: ScheduleFromQuoteModalProps) {
  const [isSequential, setIsSequential] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build module lookup
  const moduleMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>()
    for (const sm of shopModules) {
      map.set(sm.service_modules.module_key, {
        label: sm.service_modules.label,
        color: sm.service_modules.color,
      })
    }
    return map
  }, [shopModules])

  // Group line items by module, compute durations
  const moduleGroups = useMemo(() => {
    const groups = new Map<string, { items: typeof lineItems; totalDuration: number }>()
    for (const item of lineItems) {
      const key = item.module || 'general'
      if (!groups.has(key)) groups.set(key, { items: [], totalDuration: 0 })
      const g = groups.get(key)!
      g.items.push(item)
      const cf = item.custom_fields || {};
      const dur = typeof cf.duration_minutes === 'number'
        ? cf.duration_minutes as number
        : typeof cf.duration === 'number'
          ? cf.duration as number
          : 0
      g.totalDuration += dur * item.quantity
    }
    return groups
  }, [lineItems])

  // Initialize slot configs from grouped modules
  const [slots, setSlots] = useState<SlotConfig[]>([])

  useEffect(() => {
    if (!isOpen) return
    const defaultDate = getNextBusinessDay()
    const initial: SlotConfig[] = []
    let offset = 0
    for (const [moduleKey, group] of moduleGroups) {
      const mod = moduleMap.get(moduleKey)
      const duration = group.totalDuration || 60
      initial.push({
        moduleKey,
        label: mod?.label || moduleKey,
        color: mod?.color || '#6b7280',
        duration,
        date: defaultDate,
        time: addMinutesToTime(DEFAULT_START_TIME, offset),
        appointmentType: 'dropoff',
      })
      offset += duration
    }
    setSlots(initial)
    setError(null)
    setSubmitting(false)
  }, [isOpen, moduleGroups, moduleMap])

  // Recalculate sequential times when toggling mode or changing durations/times
  const recalcSequentialTimes = useCallback((currentSlots: SlotConfig[], startIndex: number = 1): SlotConfig[] => {
    if (!isSequential || currentSlots.length <= 1) return currentSlots
    const updated = [...currentSlots]
    for (let i = startIndex; i < updated.length; i++) {
      const prev = updated[i - 1]
      updated[i] = {
        ...updated[i],
        date: prev.date,
        time: addMinutesToTime(prev.time, prev.duration),
      }
    }
    return updated
  }, [isSequential])

  const updateSlot = useCallback((index: number, patch: Partial<SlotConfig>) => {
    setSlots(prev => {
      const updated = prev.map((s, i) => i === index ? { ...s, ...patch } : s)
      if (isSequential) {
        // When changing time/date of first slot or duration of any, recalc downstream
        const recalcFrom = patch.time !== undefined || patch.date !== undefined ? index + 1 : index + 1
        return recalcSequentialTimes(updated, recalcFrom)
      }
      return updated
    })
  }, [isSequential, recalcSequentialTimes])

  // Toggle sequential/parallel
  const handleModeToggle = useCallback((seq: boolean) => {
    setIsSequential(seq)
    if (seq) {
      setSlots(prev => recalcSequentialTimes(prev, 1))
    }
  }, [recalcSequentialTimes])

  // Build timeline preview appointments from slots
  const previewAppointments = useMemo(() => {
    return slots.map(slot => ({
      customer_name: doc.customer_name,
      appointment_time: slot.time,
      appointment_type: slot.appointmentType,
      vehicle_year: doc.vehicle_year,
      vehicle_make: doc.vehicle_make,
      vehicle_model: doc.vehicle_model,
      duration_minutes: slot.duration,
      status: 'scheduled',
      services_json: [{ label: slot.label }],
    }))
  }, [slots, doc])

  const handleSchedule = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: slots.map(s => ({
            module: s.moduleKey,
            date: s.date,
            time: s.time,
            duration_minutes: s.duration,
            appointment_type: s.appointmentType,
          })),
          scheduling_mode: isSequential ? 'sequential' : 'parallel',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to schedule (${res.status})`)
      }
      onScheduled()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to schedule')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const vehicleLabel = [doc.vehicle_year, doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ')
  const allSameDate = slots.length > 0 && slots.every(s => s.date === slots[0].date)
  const previewDate = allSameDate ? formatDateDisplay(slots[0].date) : 'Multiple dates'

  return (
    <Modal
      title="Schedule Appointments"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSchedule} disabled={submitting || slots.length === 0}>
            {submitting ? 'Scheduling...' : `Schedule ${slots.length > 1 ? `All (${slots.length})` : ''}`}
          </Button>
        </>
      }
    >
      {/* Customer + Vehicle summary */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        marginBottom: SPACING.xl,
        padding: `${SPACING.md}px ${SPACING.lg}px`,
        background: COLORS.activeBg,
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="5" r="3" />
          <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
        </svg>
        <div>
          <span style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
            {doc.customer_name}
          </span>
          {vehicleLabel && (
            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginLeft: SPACING.sm }}>
              {vehicleLabel}
            </span>
          )}
        </div>
      </div>

      {/* Mode toggle -- only show when multiple modules */}
      {slots.length > 1 && <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        marginBottom: SPACING.xl,
      }}>
        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textTertiary, fontWeight: FONT.weightMedium, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Mode
        </span>
        <div style={{
          display: 'flex',
          background: COLORS.inputBg,
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.borderInput}`,
          overflow: 'hidden',
        }}>
          {(['sequential', 'parallel'] as const).map(mode => {
            const active = mode === 'sequential' ? isSequential : !isSequential
            return (
              <button
                key={mode}
                onClick={() => handleModeToggle(mode === 'sequential')}
                style={{
                  padding: `${SPACING.sm}px ${SPACING.lg}px`,
                  fontSize: FONT.sizeSm,
                  fontWeight: active ? FONT.weightSemibold : FONT.weightNormal,
                  color: active ? COLORS.textPrimary : COLORS.textMuted,
                  background: active ? COLORS.cardBg : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: SPACING.xs }}>
          {isSequential
            ? 'Slots run back-to-back on the same day'
            : 'Each slot scheduled independently'}
        </span>
      </div>}

      {/* Slot rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
        {slots.map((slot, i) => (
          <div
            key={slot.moduleKey}
            style={{
              padding: SPACING.lg,
              background: COLORS.cardBg,
              borderRadius: RADIUS.lg,
              border: `1px solid ${COLORS.border}`,
              borderLeft: `3px solid ${slot.color}`,
            }}
          >
            {/* Module header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: SPACING.sm,
              marginBottom: SPACING.md,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: slot.color,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold,
                color: COLORS.textPrimary,
              }}>
                {slot.label}
              </span>
              <span style={{
                fontSize: FONT.sizeXs, color: COLORS.textMuted,
                marginLeft: 'auto',
              }}>
                {moduleGroups.get(slot.moduleKey)?.items.length || 0} line item{(moduleGroups.get(slot.moduleKey)?.items.length || 0) !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Config row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 80px 1fr',
              gap: SPACING.md,
              alignItems: 'end',
            }}>
              {/* Date */}
              <FormField label="Date">
                <TextInput
                  type="date"
                  value={slot.date}
                  onChange={e => updateSlot(i, { date: e.target.value })}
                  disabled={isSequential && i > 0}
                  style={isSequential && i > 0 ? { opacity: 0.5 } : undefined}
                />
              </FormField>

              {/* Time */}
              <FormField label="Time">
                <TextInput
                  type="time"
                  value={slot.time}
                  onChange={e => updateSlot(i, { time: e.target.value })}
                  disabled={isSequential && i > 0}
                  style={isSequential && i > 0 ? { opacity: 0.5 } : undefined}
                />
              </FormField>

              {/* Duration */}
              <FormField label="Min">
                <TextInput
                  type="number"
                  min={15}
                  step={15}
                  value={slot.duration}
                  onChange={e => updateSlot(i, { duration: Math.max(15, parseInt(e.target.value) || 15) })}
                  style={{ textAlign: 'center', paddingLeft: SPACING.sm, paddingRight: SPACING.sm }}
                />
              </FormField>

              {/* Type */}
              <FormField label="Type">
                <SelectInput
                  value={slot.appointmentType}
                  onChange={e => updateSlot(i, { appointmentType: e.target.value as AppointmentType })}
                >
                  {APPOINTMENT_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </SelectInput>
              </FormField>
            </div>

            {/* Computed time display for sequential locked slots */}
            {isSequential && i > 0 && (
              <div style={{
                marginTop: SPACING.sm,
                fontSize: FONT.sizeXs,
                color: COLORS.textMuted,
              }}>
                Auto-scheduled: {formatTimeDisplay(slot.time)} - {formatTimeDisplay(addMinutesToTime(slot.time, slot.duration))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Timeline preview for sequential mode */}
      {isSequential && slots.length > 1 && (
        <div style={{ marginTop: SPACING.xl }}>
          <div style={{
            fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium,
            color: COLORS.textTertiary, textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: SPACING.sm,
          }}>
            Timeline Preview
          </div>
          <MiniTimeline
            appointments={previewAppointments}
            dateLabel={previewDate}
            height={280}
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          marginTop: SPACING.lg,
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
    </Modal>
  )
}
