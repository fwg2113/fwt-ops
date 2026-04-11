'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard'
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme'
import { MODULE_LABELS, MODULE_COLORS } from './AppointmentCard'

// ============================================================================
// CREATE APPOINTMENT MODAL
// Generic modal for creating appointments from the dashboard.
// Supports any service module and optional linking to an existing group.
// ============================================================================

type AppointmentType = 'dropoff' | 'waiting' | 'headsup_30' | 'headsup_60'

const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'dropoff', label: 'Drop-Off' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'headsup_30', label: 'Flex-Wait (30 min)' },
  { value: 'headsup_60', label: 'Flex-Wait (60 min)' },
]

interface CreateAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  linkedGroupId?: string | null
  prefillCustomer?: { name: string; phone: string; email: string } | null
  prefillVehicle?: { year: number | null; make: string | null; model: string | null } | null
  prefillDate?: string | null
  shopModules: Array<{
    service_modules: {
      module_key: string
      label: string
      color: string
    }
  }>
  teamMembers?: Array<{ id: string; name: string; module_permissions: string[] }>
}

function getTodayString(): string {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export default function CreateAppointmentModal({
  isOpen,
  onClose,
  onCreated,
  linkedGroupId,
  prefillCustomer,
  prefillVehicle,
  prefillDate,
  shopModules,
  teamMembers,
}: CreateAppointmentModalProps) {
  const isLinking = !!linkedGroupId

  // Form state
  const [module, setModule] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('dropoff')
  const [serviceDescription, setServiceDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [assignedTeamMemberId, setAssignedTeamMemberId] = useState<string>('')
  const [schedulingMode, setSchedulingMode] = useState<'sequential' | 'parallel'>('sequential')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Module options for dropdown
  const moduleOptions = useMemo(() => {
    return shopModules.map(sm => ({
      key: sm.service_modules.module_key,
      label: sm.service_modules.label,
      color: sm.service_modules.color,
    }))
  }, [shopModules])

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) return
    setModule(moduleOptions.length > 0 ? moduleOptions[0].key : '')
    setCustomerName(prefillCustomer?.name || '')
    setCustomerPhone(prefillCustomer?.phone || '')
    setCustomerEmail(prefillCustomer?.email || '')
    setVehicleYear(prefillVehicle?.year ? String(prefillVehicle.year) : '')
    setVehicleMake(prefillVehicle?.make || '')
    setVehicleModel(prefillVehicle?.model || '')
    setDate(prefillDate || getTodayString())
    setTime('09:00')
    setDuration(60)
    setAppointmentType('dropoff')
    setServiceDescription('')
    setNotes('')
    setAssignedTeamMemberId('')
    setSchedulingMode('sequential')
    setError(null)
    setSubmitting(false)
  }, [isOpen, prefillCustomer, prefillVehicle, prefillDate, moduleOptions])

  const handleSubmit = async () => {
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
          appointment_type: appointmentType,
          notes: notes.trim() || null,
          calendar_title: serviceDescription.trim() || null,
          services_json: serviceDescription.trim() ? [{ label: serviceDescription.trim() }] : null,
          assigned_team_member_id: assignedTeamMemberId || null,
          linked_group_id: linkedGroupId || null,
          scheduling_mode: isLinking ? schedulingMode : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to create appointment (${res.status})`)
      }

      onCreated()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create appointment')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const selectedModuleColor = MODULE_COLORS[module] ||
    moduleOptions.find(m => m.key === module)?.color || '#6b7280'
  const selectedModuleLabel = MODULE_LABELS[module] ||
    moduleOptions.find(m => m.key === module)?.label || module

  return (
    <Modal
      title={isLinking ? 'Add Linked Appointment' : 'Create Appointment'}
      onClose={onClose}
      width={580}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : isLinking ? 'Add to Group' : 'Create Appointment'}
          </Button>
        </>
      }
    >
      {/* Linking banner */}
      {isLinking && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACING.md,
          padding: `${SPACING.md}px ${SPACING.lg}px`,
          marginBottom: SPACING.xl,
          background: `${COLORS.info}15`,
          border: `1px solid ${COLORS.info}40`,
          borderRadius: RADIUS.md,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.info} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
            <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
          </svg>
          <span style={{ fontSize: FONT.sizeSm, color: COLORS.info, fontWeight: FONT.weightMedium }}>
            Adding linked slot to existing appointment group
          </span>
        </div>
      )}

      {/* Module selector */}
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
      {module && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACING.sm,
          marginTop: -SPACING.md, marginBottom: SPACING.lg,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: selectedModuleColor,
          }} />
          <span style={{
            fontSize: FONT.sizeXs, color: COLORS.textMuted,
          }}>
            {selectedModuleLabel}
          </span>
        </div>
      )}

      {/* Customer section */}
      <div style={{
        fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium,
        color: COLORS.textTertiary, textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: SPACING.md,
      }}>
        Customer
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: SPACING.md,
      }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Name" required>
            <TextInput
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name"
              readOnly={isLinking && !!prefillCustomer}
              style={isLinking && prefillCustomer ? { opacity: 0.6 } : undefined}
            />
          </FormField>
        </div>
        <FormField label="Phone">
          <TextInput
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="(555) 123-4567"
            readOnly={isLinking && !!prefillCustomer}
            style={isLinking && prefillCustomer ? { opacity: 0.6 } : undefined}
          />
        </FormField>
        <FormField label="Email">
          <TextInput
            type="email"
            value={customerEmail}
            onChange={e => setCustomerEmail(e.target.value)}
            placeholder="email@example.com"
            readOnly={isLinking && !!prefillCustomer}
            style={isLinking && prefillCustomer ? { opacity: 0.6 } : undefined}
          />
        </FormField>
      </div>

      {/* Vehicle section */}
      <div style={{
        fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium,
        color: COLORS.textTertiary, textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: SPACING.md,
      }}>
        Vehicle
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '80px 1fr 1fr',
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
            readOnly={isLinking && !!prefillVehicle}
            style={isLinking && prefillVehicle ? { opacity: 0.6 } : undefined}
          />
        </FormField>
        <FormField label="Make">
          <TextInput
            value={vehicleMake}
            onChange={e => setVehicleMake(e.target.value)}
            placeholder="BMW"
            readOnly={isLinking && !!prefillVehicle}
            style={isLinking && prefillVehicle ? { opacity: 0.6 } : undefined}
          />
        </FormField>
        <FormField label="Model">
          <TextInput
            value={vehicleModel}
            onChange={e => setVehicleModel(e.target.value)}
            placeholder="M3"
            readOnly={isLinking && !!prefillVehicle}
            style={isLinking && prefillVehicle ? { opacity: 0.6 } : undefined}
          />
        </FormField>
      </div>

      {/* Scheduling section */}
      <div style={{
        fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium,
        color: COLORS.textTertiary, textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: SPACING.md,
      }}>
        Schedule
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 80px',
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
          <TextInput
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </FormField>
        <FormField label="Minutes">
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

      <FormField label="Appointment Type">
        <SelectInput value={appointmentType} onChange={e => setAppointmentType(e.target.value as AppointmentType)}>
          {APPOINTMENT_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </SelectInput>
      </FormField>

      {/* Assign To */}
      {teamMembers && teamMembers.length > 0 && (() => {
        const filteredTeam = module
          ? teamMembers.filter(tm => tm.module_permissions.includes(module))
          : teamMembers
        if (filteredTeam.length === 0) return null
        return (
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
        )
      })()}

      {/* Service Description */}
      <FormField label="Service Description" hint="What work is being done? Shows on the appointment card.">
        <TextInput
          value={serviceDescription}
          onChange={e => setServiceDescription(e.target.value)}
          placeholder="e.g., Hood Wrap - Satin Black, Consultation, Full Detail..."
        />
      </FormField>

      {/* Notes */}
      <FormField label="Notes">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={3}
          style={{
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
          }}
        />
      </FormField>

      {/* Scheduling mode -- only when linking */}
      {isLinking && (
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACING.md,
          }}>
            <span style={{
              fontSize: FONT.sizeSm, color: COLORS.textTertiary,
              fontWeight: FONT.weightMedium, textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
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
                const active = schedulingMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => setSchedulingMode(mode)}
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
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              {schedulingMode === 'sequential'
                ? 'Runs after existing slots'
                : 'Scheduled independently'}
            </span>
          </div>
        </div>
      )}

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
    </Modal>
  )
}
