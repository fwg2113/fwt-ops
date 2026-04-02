'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme'
import { MODULE_LABELS, MODULE_COLORS } from '@/app/components/booking/types'
import ServiceLineEditor, { type ServiceLine } from '@/app/(dashboard)/invoicing/checkout/ServiceLineEditor'
import ScheduleFromQuoteModal from './ScheduleFromQuoteModal'

// ============================================================================
// DOCUMENT DETAIL — Ported from FWG-ops DocumentDetail.tsx
// Full quote/invoice editor with line items, fees, payments, communication.
// Stripped of apparel-specific features (DTF, embroidery, mockups).
// SaaS-ready: all operations scoped by document, no hardcoded values.
// ============================================================================

const buttonStyles = `
  .action-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 10px 16px; border-radius: 8px; font-size: 14px;
    cursor: pointer; transition: all 0.15s ease; font-family: inherit;
  }
  .action-btn:hover:not(:disabled) { transform: translateY(-2px); }
  .action-btn:active:not(:disabled) { transform: translateY(0); }
  .action-btn-secondary {
    background: ${COLORS.cardBg}; border: 1px solid ${COLORS.border}; color: ${COLORS.textMuted};
  }
  .action-btn-primary {
    background: ${COLORS.red}; border: none; color: white; font-weight: 600;
  }
  .action-btn-success {
    background: #22c55e; border: none; color: white; font-weight: 600;
  }
  .action-btn-warning {
    background: #f59e0b; border: none; color: white; font-weight: 600;
  }
  .action-btn-danger {
    background: #ef4444; border: none; color: white; font-weight: 600;
  }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`

const ActionButton = ({ onClick, disabled, variant = 'secondary', children, style = {} }: {
  onClick?: () => void; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  children: React.ReactNode; style?: React.CSSProperties;
}) => (
  <button onClick={onClick} disabled={disabled} className={`action-btn action-btn-${variant}`} style={style}>
    {children}
  </button>
)

// ============================================================================
// TYPES
// ============================================================================
type Customer = { id: string; first_name: string; last_name: string; email: string | null; phone: string; company_name: string | null }
type ServiceModule = { id: number; module_key: string; label: string; color: string; parent_category: string }
type Payment = { id: string; amount: number; processing_fee: number; payment_method: string; processor: string | null; status: string; created_at: string; notes: string | null }
type Brand = { id: number; name: string; active: boolean }

type LineItem = {
  id: string; document_id: string; module: string; group_id: string | null; category: string | null
  description: string; quantity: number; unit_price: number; line_total: number; sort_order: number
  custom_fields: Record<string, any>; taxable: boolean; created_at: string
}

type DocumentData = {
  id: string; shop_id: number; doc_type: string; doc_number: string; status: string; public_token: string
  booking_id: string | null; customer_id: string | null
  customer_name: string; customer_email: string | null; customer_phone: string | null
  vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null; class_keys: string | null
  subtotal: number; discount_amount: number; discount_percent: number; deposit_paid: number; deposit_required: number
  balance_due: number; total_paid: number; cc_fee_percent: number; cc_fee_flat: number
  payment_method: string | null; payment_confirmed_at: string | null
  notes: string | null; project_description: string | null
  created_at: string; sent_at: string | null; viewed_at: string | null; approved_at: string | null; paid_at: string | null
  warranty_content_snapshot: any; applied_discounts: any; applied_warranty: any
  options_mode: boolean; options_json: any
  tip_amount: number; discount_note: string | null; starting_total: number | null; upsell_amount: number | null
  brand_display_mode: string | null; brand_display_ids: number[] | null
  approval_mode: string | null; available_slots: Array<{ date: string; time: string }> | null
  customer_requested_dates: Array<{ date: string; preference?: string }> | null
}

interface ShopModuleWithDetails {
  id: number;
  enabled: boolean;
  service_modules: { module_key: string; label: string; color: string };
}

type Props = {
  document: DocumentData
  lineItems: LineItem[]
  customers: Customer[]
  modules: ServiceModule[]
  payments: Payment[]
  shopConfig: any
  brands: Brand[]
  shopModules?: ShopModuleWithDetails[]
}

// ============================================================================
// HELPERS
// ============================================================================
const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'

const getStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'draft': return { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
    case 'sent': return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
    case 'viewed': return { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' }
    case 'approved': return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
    case 'revision_requested': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
    case 'paid': return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
    case 'partial': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
    case 'void': return { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
    default: return { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DocumentDetail({
  document: initialDoc,
  lineItems: initialLineItems,
  customers = [],
  modules = [],
  payments: initialPayments = [],
  shopConfig,
  brands = [],
  shopModules = [],
}: Props) {
  const router = useRouter()

  // Document state
  const [doc, setDoc] = useState(initialDoc)
  const [lineItems, setLineItems] = useState<LineItem[]>(initialLineItems)
  const [payments, setPayments] = useState<Payment[]>(initialPayments)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  // Customer editing
  const [customerName, setCustomerName] = useState(doc.customer_name || '')
  const [customerEmail, setCustomerEmail] = useState(doc.customer_email || '')
  const [customerPhone, setCustomerPhone] = useState(doc.customer_phone || '')
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([])

  // Project / vehicle
  const [projectDescription, setProjectDescription] = useState(doc.project_description || '')
  const [notes, setNotes] = useState(doc.notes || '')

  // Financial
  const [discountAmount, setDiscountAmount] = useState(doc.discount_amount || 0)
  const [discountPercent, setDiscountPercent] = useState(doc.discount_percent || 0)
  const [depositRequired, setDepositRequired] = useState(doc.deposit_required || 0)

  // Tint service editor (structured input for auto_tint module)
  const [showTintEditor, setShowTintEditor] = useState(false)
  const [tintEditorGroupId, setTintEditorGroupId] = useState<string | null>(null)
  const [showVehiclePicker, setShowVehiclePicker] = useState(false)

  // YMM vehicle picker state (used when document has no vehicle data)
  const [autoConfig, setAutoConfig] = useState<any>(null)
  const [pickYear, setPickYear] = useState(doc.vehicle_year ? String(doc.vehicle_year) : '')
  const [pickMake, setPickMake] = useState(doc.vehicle_make || '')
  const [pickModel, setPickModel] = useState(doc.vehicle_model || '')
  const [pickedClassKeys, setPickedClassKeys] = useState(doc.class_keys || '')

  // Section / group management (FWG pattern)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [sectionModalTab, setSectionModalTab] = useState<string>('AUTOMOTIVE')
  type LineItemGroup = { group_id: string; module_key: string }
  const [lineItemGroups, setLineItemGroups] = useState<LineItemGroup[]>(() => {
    const groups: LineItemGroup[] = []
    const seen = new Set<string>()
    initialLineItems.forEach(li => {
      const gid = li.group_id || li.module || 'auto_tint'
      if (!seen.has(gid)) {
        seen.add(gid)
        groups.push({ group_id: gid, module_key: li.module || 'auto_tint' })
      }
    })
    return groups
  })

  // Line item editing
  const [addingItem, setAddingItem] = useState(false)
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemDesc, setEditItemDesc] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemQty, setEditItemQty] = useState('1')
  const [newItemModule, setNewItemModule] = useState('auto_tint')
  const [newItemDesc, setNewItemDesc] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemQty, setNewItemQty] = useState('1')

  // Modals
  const [showSendModal, setShowSendModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [sendMethod, setSendMethod] = useState<'sms' | 'email'>('sms')
  const [sending, setSending] = useState(false)

  // Quote approval mode (for send modal)
  const approvalModes = (shopConfig?.quote_approval_modes || {}) as Record<string, boolean>
  const defaultApprovalMode = (shopConfig?.quote_default_approval_mode || 'just_approve') as string
  const [selectedApprovalMode, setSelectedApprovalMode] = useState(defaultApprovalMode)
  const [availableSlots, setAvailableSlots] = useState<{ date: string; time: string }[]>(() => {
    // Default first slot to next business day, 09:00
    const today = new Date()
    const next = new Date(today)
    next.setDate(next.getDate() + 1)
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1)
    }
    const dateStr = next.toISOString().split('T')[0]
    return [
      { date: dateStr, time: '09:00' },
      { date: '', time: '' },
    ]
  })

  // Payment recording
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Follow-up
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpMessage, setFollowUpMessage] = useState('')
  const [followUpIncentive, setFollowUpIncentive] = useState(false)
  const [followUpDiscountType, setFollowUpDiscountType] = useState<'percent' | 'dollar'>('percent')
  const [followUpDiscountValue, setFollowUpDiscountValue] = useState('10')
  const [sendingFollowUp, setSendingFollowUp] = useState(false)

  // Attachments
  const [attachments, setAttachments] = useState<Array<{ key: string; url: string; filename: string; contentType: string; size: number; uploadedAt: string }>>(
    Array.isArray((initialDoc as any).attachments) ? (initialDoc as any).attachments : []
  )
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Options mode
  const [optionsMode, setOptionsMode] = useState(doc.options_mode || false)
  // Option titles: { group_id: "Custom Title" } -- stored in options_json on save
  const [optionTitles, setOptionTitles] = useState<Record<string, string>>(() => {
    // Load from options_json if it has title data
    const stored = doc.options_json as any
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored
    return {}
  })
  const [editingOptionTitle, setEditingOptionTitle] = useState<string | null>(null)

  // Brand display
  const [brandDisplayMode, setBrandDisplayMode] = useState<string | null>(doc.brand_display_mode || null)
  const [brandDisplayIds, setBrandDisplayIds] = useState<number[]>(doc.brand_display_ids || [])

  const isQuote = doc.doc_type === 'quote'
  const isInvoice = doc.doc_type === 'invoice'
  const isPaid = doc.status === 'paid'
  const vehicleStr = [doc.vehicle_year, doc.vehicle_make, doc.vehicle_model].filter(Boolean).join(' ')
  const statusStyle = getStatusStyle(doc.status)

  // Computed totals
  const subtotal = lineItems.reduce((sum, li) => sum + (li.line_total || 0), 0)
  const discountTotal = discountPercent > 0 ? subtotal * discountPercent / 100 : discountAmount
  const total = subtotal - discountTotal
  const amountPaid = payments.filter(p => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0) + (doc.deposit_paid || 0)
  const balanceDue = total - amountPaid

  // Load auto config for YMM picker (on demand)
  useEffect(() => {
    if (showVehiclePicker && !autoConfig) {
      fetch('/api/auto/config').then(r => r.json()).then(setAutoConfig).catch(() => {})
    }
  }, [showVehiclePicker, autoConfig])

  // YMM cascade computed values
  const ymmYears = useMemo(() => {
    if (!autoConfig?.vehicles) return []
    const currentYear = new Date().getFullYear() + 1
    const allYears = new Set<number>()
    autoConfig.vehicles.forEach((v: any) => {
      for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) allYears.add(y)
    })
    return Array.from(allYears).sort((a: number, b: number) => b - a)
  }, [autoConfig])

  const ymmMakes = useMemo(() => {
    if (!autoConfig?.vehicles || !pickYear) return []
    const year = parseInt(pickYear)
    const makes = new Set<string>()
    autoConfig.vehicles.forEach((v: any) => { if (year >= v.year_start && year <= v.year_end) makes.add(v.make) })
    return Array.from(makes).sort()
  }, [autoConfig, pickYear])

  const ymmModels = useMemo(() => {
    if (!autoConfig?.vehicles || !pickYear || !pickMake) return []
    const year = parseInt(pickYear)
    const models = new Set<string>()
    autoConfig.vehicles.forEach((v: any) => {
      if (year >= v.year_start && year <= v.year_end && v.make === pickMake) models.add(v.model)
    })
    return Array.from(models).sort()
  }, [autoConfig, pickYear, pickMake])

  const pickedVehicle = useMemo(() => {
    if (!autoConfig?.vehicles || !pickYear || !pickMake || !pickModel) return null
    const year = parseInt(pickYear)
    return autoConfig.vehicles.find((v: any) =>
      v.make === pickMake && v.model === pickModel && year >= v.year_start && year <= v.year_end
    ) || null
  }, [autoConfig, pickYear, pickMake, pickModel])

  // When vehicle is picked, update class keys
  useEffect(() => {
    if (pickedVehicle) {
      setPickedClassKeys(pickedVehicle.class_keys?.join('|') || '')
    }
  }, [pickedVehicle])

  // Customer search
  useEffect(() => {
    if (customerSearchTerm.length >= 1) {
      const term = customerSearchTerm.toLowerCase()
      const filtered = customers.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.includes(term) ||
        c.company_name?.toLowerCase().includes(term)
      ).slice(0, 8)
      setFilteredCustomers(filtered)
      setShowCustomerDropdown(filtered.length > 0)
    } else {
      setFilteredCustomers([])
      setShowCustomerDropdown(false)
    }
  }, [customerSearchTerm, customers])

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async function handleSaveAll() {
    setIsSaving(true)
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        project_description: projectDescription || null,
        notes: notes || null,
        subtotal,
        discount_amount: discountAmount,
        discount_percent: discountPercent,
        deposit_required: depositRequired,
        balance_due: balanceDue,
        options_json: Object.keys(optionTitles).length > 0 ? optionTitles : null,
        brand_display_mode: brandDisplayMode,
        brand_display_ids: brandDisplayMode === 'fixed' ? brandDisplayIds : null,
      }),
    })
    setIsDirty(false)
    setIsSaving(false)
  }

  async function handleSendDocument() {
    setSending(true)

    // For quotes, patch approval_mode and available_slots before sending
    if (isQuote) {
      const patchData: Record<string, unknown> = { approval_mode: selectedApprovalMode }
      if (selectedApprovalMode === 'schedule_approve') {
        const filledSlots = availableSlots.filter(s => s.date && s.time)
        patchData.available_slots = filledSlots
      } else {
        patchData.available_slots = null
      }
      // If re-sending an approved quote, reset status and cancel old appointments
      if (doc.status === 'approved') {
        patchData.status = 'sent'
        patchData.approved_at = null
        patchData.booking_id = null
        // Cancel any appointments from the previous approval
        await fetch(`/api/documents/${doc.id}/undo-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      }
      await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      })
    }

    await fetch('/api/auto/invoices/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: doc.id, method: sendMethod }),
    })
    setDoc(prev => ({ ...prev, status: 'sent', sent_at: new Date().toISOString() }))
    setShowSendModal(false)
    setSending(false)
  }

  async function handleDelete() {
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'void' }),
    })
    router.push(isQuote ? '/quotes' : '/invoicing')
  }

  async function handleMarkApproved() {
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() }),
    })
    setDoc(prev => ({ ...prev, status: 'approved', approved_at: new Date().toISOString() }))
  }

  async function handleConvertToInvoice() {
    const res = await fetch(`/api/documents/${doc.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convertToInvoice: true }),
    })
    const data = await res.json()
    if (data.success) {
      router.refresh()
    }
  }

  async function handleAddLineItem(groupId?: string) {
    if (!newItemDesc.trim() || !newItemPrice) return
    const price = parseFloat(newItemPrice) || 0
    const qty = parseInt(newItemQty) || 1
    const targetGroup = groupId || addingToGroup
    const targetModule = targetGroup
      ? (lineItemGroups.find(g => g.group_id === targetGroup)?.module_key || newItemModule)
      : newItemModule

    const res = await fetch(`/api/documents/${doc.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: targetModule,
        group_id: targetGroup || null,
        description: newItemDesc.trim(),
        quantity: qty,
        unit_price: price,
        line_total: price * qty,
        sort_order: lineItems.length,
        custom_fields: {},
      }),
    })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      setLineItems(prev => [...prev, ...data])
    }
    setNewItemDesc('')
    setNewItemPrice('')
    setNewItemQty('1')
    setAddingItem(false)
    setAddingToGroup(null)
  }

  async function handleDeleteLineItem(itemId: string) {
    await fetch(`/api/documents/${doc.id}/line-items?itemId=${itemId}`, { method: 'DELETE' })
    setLineItems(prev => prev.filter(li => li.id !== itemId))
  }

  function startEditLineItem(li: LineItem) {
    setEditingItemId(li.id)
    setEditItemDesc(li.description)
    setEditItemPrice(String(li.unit_price))
    setEditItemQty(String(li.quantity))
  }

  async function handleSaveLineItem() {
    if (!editingItemId) return
    const price = parseFloat(editItemPrice) || 0
    const qty = parseInt(editItemQty) || 1
    await fetch(`/api/documents/${doc.id}/line-items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingItemId,
        description: editItemDesc.trim(),
        quantity: qty,
        unit_price: price,
        line_total: price * qty,
      }),
    })
    setLineItems(prev => prev.map(li =>
      li.id === editingItemId ? { ...li, description: editItemDesc.trim(), quantity: qty, unit_price: price, line_total: price * qty } : li
    ))
    setEditingItemId(null)
  }

  async function handleRecordPayment() {
    if (!paymentAmount) return
    setRecordingPayment(true)
    const res = await fetch(`/api/documents/${doc.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        processor: 'manual',
      }),
    })
    const data = await res.json()
    if (data.payment) {
      setPayments(prev => [data.payment, ...prev])
      if (data.document) {
        setDoc(prev => ({ ...prev, ...data.document }))
      }
    }
    setPaymentAmount('')
    setShowPaymentModal(false)
    setRecordingPayment(false)
  }

  async function addSection(moduleKey: string) {
    setShowSectionModal(false)

    // Auto Tint: always show YMM picker for each new tint section
    // This supports multi-vehicle quotes (his & hers on one quote)
    if (moduleKey === 'auto_tint') {
      const groupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      setTintEditorGroupId(groupId)
      // Reset YMM for fresh selection
      setPickYear('')
      setPickMake('')
      setPickModel('')
      setPickedClassKeys('')
      setShowVehiclePicker(true)
      return
    }

    const groupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    setLineItemGroups(prev => [...prev, { group_id: groupId, module_key: moduleKey }])

    // Open the add-item UI for this new section immediately (no blank DB row)
    setAddingToGroup(groupId)
    setNewItemDesc('')
    setNewItemPrice('')
    setNewItemQty('1')
  }

  // Confirm vehicle selection and proceed to tint editor
  // Vehicle data is stored per-group (in line item custom_fields), NOT on the document
  // This supports multi-vehicle quotes (his & hers)
  async function handleVehicleConfirmed() {
    if (!pickYear || !pickMake || !pickModel || !pickedVehicle) return
    // Vehicle data will be passed to ServiceLineEditor and saved to each line item's custom_fields
    // Also save to document if it doesn't have a vehicle yet (for display purposes)
    if (!doc.vehicle_year) {
      const vehicleUpdate = {
        vehicle_year: parseInt(pickYear),
        vehicle_make: pickMake,
        vehicle_model: pickModel,
        class_keys: pickedVehicle.class_keys?.join('|') || '',
      }
      await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleUpdate),
      })
      setDoc(prev => ({ ...prev, ...vehicleUpdate }))
    }
    setPickedClassKeys(pickedVehicle.class_keys?.join('|') || '')
    setShowVehiclePicker(false)
    setShowTintEditor(true)
  }

  // Handle save from the Tint ServiceLineEditor
  async function handleTintEditorSave(lines: ServiceLine[], subtotalFromEditor: number) {
    const groupId = tintEditorGroupId || 'grp_' + Date.now()

    // Add the group
    setLineItemGroups(prev => [...prev, { group_id: groupId, module_key: 'auto_tint' }])

    // Vehicle data for this group (stored per line item for multi-vehicle support)
    const vehicleData = {
      vehicleYear: pickYear ? parseInt(pickYear) : doc.vehicle_year,
      vehicleMake: pickMake || doc.vehicle_make,
      vehicleModel: pickModel || doc.vehicle_model,
      classKeys: pickedClassKeys || doc.class_keys,
    }

    // Create document_line_items from the ServiceLine results
    const lineItemRows = lines.map((svc, idx) => ({
      module: 'auto_tint',
      group_id: groupId,
      description: svc.label || '',
      quantity: 1,
      unit_price: svc.price || 0,
      line_total: svc.price || 0,
      sort_order: lineItems.length + idx,
      custom_fields: {
        serviceKey: svc.serviceKey,
        filmId: svc.filmId,
        filmName: svc.filmName,
        filmAbbrev: svc.filmAbbrev,
        shade: svc.shade,
        shadeFront: svc.shadeFront,
        shadeRear: svc.shadeRear,
        discountAmount: svc.discountAmount,
        duration: svc.duration,
        ...vehicleData,
      },
    }))

    const res = await fetch(`/api/documents/${doc.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lineItemRows),
    })
    const data = await res.json()
    if (Array.isArray(data)) {
      setLineItems(prev => [...prev, ...data])
    }

    // Auto-set option title with vehicle info if in options mode
    if (optionsMode && vehicleData.vehicleYear) {
      setOptionTitles(prev => ({
        ...prev,
        [groupId]: `Window Tint -- ${vehicleData.vehicleYear} ${vehicleData.vehicleMake} ${vehicleData.vehicleModel}`,
      }))
      setIsDirty(true)
    }

    setShowTintEditor(false)
    setTintEditorGroupId(null)
  }

  async function deleteGroup(groupId: string) {
    // Delete all line items in this group
    const groupItems = lineItems.filter(li => (li.group_id || li.module) === groupId)
    for (const li of groupItems) {
      await fetch(`/api/documents/${doc.id}/line-items?itemId=${li.id}`, { method: 'DELETE' })
    }
    setLineItems(prev => prev.filter(li => (li.group_id || li.module) !== groupId))
    setLineItemGroups(prev => prev.filter(g => g.group_id !== groupId))
  }

  async function handleToggleOptionsMode() {
    const newMode = !optionsMode
    setOptionsMode(newMode)
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options_mode: newMode }),
    })
    // If turning on options mode and items don't have group_ids, assign them to Option 1
    if (newMode) {
      const ungrouped = lineItems.filter(li => !li.group_id)
      if (ungrouped.length > 0) {
        const groupId = 'opt_' + Date.now()
        for (const li of ungrouped) {
          await fetch(`/api/documents/${doc.id}/line-items`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: li.id, group_id: groupId }),
          })
        }
        setLineItems(prev => prev.map(li => !li.group_id ? { ...li, group_id: groupId } : li))
      }
    }
  }

  function addOptionGroup() {
    const groupId = 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    // Create a placeholder item in the new group
    setAddingItem(true)
    setNewItemModule('auto_tint')
    // The new item will be assigned to this group when added
    // For now, store the pending group_id
    ;(window as any).__pendingGroupId = groupId
  }

  async function handleSendFollowUp() {
    if (!followUpMessage.trim()) return
    setSendingFollowUp(true)
    try {
      const link = `${window.location.origin}/invoice/${doc.public_token}`
      const firstName = (customerName || 'there').split(' ')[0]
      let fullMessage = followUpMessage
      if (followUpIncentive) {
        const val = parseFloat(followUpDiscountValue) || 0
        const discountText = followUpDiscountType === 'percent' ? `${val}% off` : `$${val.toFixed(2)} off`
        fullMessage += `\n\nSpecial offer: ${discountText}!`
      }
      fullMessage += `\n\nView your ${isQuote ? 'quote' : 'invoice'}: ${link}`

      // Send via the existing send infrastructure
      if (customerPhone) {
        await fetch('/api/auto/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: customerPhone, message: fullMessage }),
        }).catch(() => {})
      }

      // Update follow-up tracking on document
      const updates: Record<string, any> = {
        followup_count: ((doc as any).followup_count || 0) + 1,
        last_followup_at: new Date().toISOString(),
      }
      if (followUpIncentive) {
        const val = parseFloat(followUpDiscountValue) || 0
        if (followUpDiscountType === 'percent') {
          updates.discount_percent = val
          updates.discount_amount = 0
        } else {
          updates.discount_amount = val
          updates.discount_percent = 0
        }
      }

      await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      setDoc(prev => ({ ...prev, ...updates }))
      if (followUpIncentive) {
        const val = parseFloat(followUpDiscountValue) || 0
        if (followUpDiscountType === 'percent') setDiscountPercent(val)
        else setDiscountAmount(val)
      }
      setShowFollowUpModal(false)
      setFollowUpMessage('')
    } catch (err) {
      console.error('Follow-up error:', err)
    }
    setSendingFollowUp(false)
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const formData = new FormData()
      formData.append('file', file)
      formData.append('target', 'project')
      const res = await fetch(`/api/documents/${doc.id}/attachments`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.attachment) {
        setAttachments(prev => [...prev, data.attachment])
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDeleteAttachment(key: string) {
    await fetch(`/api/documents/${doc.id}/attachments?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    setAttachments(prev => prev.filter(a => a.key !== key))
  }

  function handleCustomerSelect(customerId: string) {
    const customer = customers.find(c => c.id === customerId)
    if (customer) {
      setCustomerName(`${customer.first_name} ${customer.last_name}`.trim())
      setCustomerEmail(customer.email || '')
      setCustomerPhone(customer.phone || '')
      setIsDirty(true)
    }
    setShowCustomerDropdown(false)
    setCustomerSearchTerm('')
  }

  // Input style
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: COLORS.inputBg,
    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
    color: COLORS.textPrimary, fontSize: FONT.sizeSm, boxSizing: 'border-box' as const,
    outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', color: COLORS.textMuted, fontSize: '11px', fontWeight: 600,
    marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  }

  // Group modules by parent_category for the section modal tabs
  // Filter out Apparel modules -- not used in this SaaS platform
  const filteredModules = modules.filter(m => m.parent_category !== 'APPAREL')
  const parentCategories = [...new Set(filteredModules.map(m => m.parent_category))].sort()
  const modulesByParent: Record<string, ServiceModule[]> = {}
  filteredModules.forEach(m => {
    if (!modulesByParent[m.parent_category]) modulesByParent[m.parent_category] = []
    modulesByParent[m.parent_category].push(m)
  })

  // Get line items for each group
  function getGroupItems(groupId: string): LineItem[] {
    return lineItems.filter(li => (li.group_id || li.module) === groupId)
  }

  // Get display title for an option group
  function getOptionTitle(group: LineItemGroup, items: LineItem[]): string {
    // Use custom title if set
    if (optionTitles[group.group_id]) return optionTitles[group.group_id]
    // Auto-generate: Module Label + Vehicle (if tint)
    const mod = modules.find(m => m.module_key === group.module_key)
    const modLabel = mod?.label || MODULE_LABELS[group.module_key] || group.module_key
    if (group.module_key === 'auto_tint' && items[0]?.custom_fields?.vehicleYear) {
      const cf = items[0].custom_fields
      return `${modLabel} -- ${cf.vehicleYear} ${cf.vehicleMake} ${cf.vehicleModel}`
    }
    return modLabel
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <style>{buttonStyles}</style>

      {/* ================================================================ */}
      {/* HEADER */}
      {/* ================================================================ */}
      <div style={{
        padding: `${SPACING.lg}px ${SPACING.xl}px`,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
          <button onClick={() => router.push(isQuote ? '/quotes' : '/invoicing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
              <span style={{ fontSize: FONT.sizeLg, fontWeight: 700, color: COLORS.textPrimary }}>
                {doc.doc_number || (isQuote ? 'Quote' : 'Invoice')}
              </span>
              <span style={{
                display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500,
                background: statusStyle.bg, color: statusStyle.color, textTransform: 'capitalize',
              }}>
                {doc.status === 'revision_requested' ? 'Changes Requested' : doc.status}
              </span>
              {doc.viewed_at && !['approved', 'paid'].includes(doc.status) && (
                <span style={{ padding: '2px 6px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', fontSize: '10px', fontWeight: 600, borderRadius: '4px', textTransform: 'uppercase' }}>
                  VIEWED {formatDateTime(doc.viewed_at)}
                </span>
              )}
            </div>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
              {isQuote ? 'Quote' : 'Invoice'} -- Created {formatDate(doc.created_at)}
              {doc.sent_at && ` -- Sent ${formatDate(doc.sent_at)}`}
              {doc.approved_at && ` -- Approved ${formatDate(doc.approved_at)}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: SPACING.sm }}>
          {doc.status === 'draft' && (
            <ActionButton variant="primary" onClick={() => setShowSendModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send {isQuote ? 'Quote' : 'Invoice'}
            </ActionButton>
          )}
          {isQuote && ['sent', 'viewed'].includes(doc.status) && (
            <ActionButton variant="success" onClick={handleMarkApproved}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Mark Approved
            </ActionButton>
          )}
          {isQuote && doc.status === 'approved' && (
            <>
              <ActionButton variant="success" onClick={() => setShowScheduleModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Schedule
              </ActionButton>
              <ActionButton variant="success" onClick={handleConvertToInvoice}>
                Convert to Invoice
              </ActionButton>
            </>
          )}
          {['sent', 'viewed'].includes(doc.status) && (
            <ActionButton onClick={() => {
              setFollowUpMessage(`Hi ${(customerName || '').split(' ')[0] || 'there'}, just following up on your ${isQuote ? 'quote' : 'invoice'}. Let us know if you have any questions!`)
              setShowFollowUpModal(true)
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              Follow Up{(doc as any).followup_count ? ` (${(doc as any).followup_count})` : ''}
            </ActionButton>
          )}
          <ActionButton onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </ActionButton>
          <ActionButton onClick={() => window.open(`/invoice/${doc.public_token}`, '_blank')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Preview
          </ActionButton>
          <ActionButton variant="danger" onClick={() => setShowDeleteModal(true)} style={{ padding: '10px 12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </ActionButton>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT — two column layout */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', height: 'calc(100vh - 130px)' }}>

        {/* LEFT COLUMN — document content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: SPACING.xl }}>

          {/* Customer Info */}
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <h3 style={{ margin: 0, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Customer</h3>
              {/* Customer search */}
              <div style={{ position: 'relative', width: 250 }}>
                <input
                  type="text" value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  onFocus={() => customerSearchTerm.length >= 1 && setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  placeholder="Search customers..."
                  style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm,
                    maxHeight: 200, overflowY: 'auto', marginTop: 4,
                  }}>
                    {filteredCustomers.map(c => (
                      <div key={c.id}
                        onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(c.id) }}
                        style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${COLORS.border}` }}
                        onMouseEnter={(e) => e.currentTarget.style.background = COLORS.hoverBg}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontSize: '13px', color: COLORS.textPrimary }}>{c.first_name} {c.last_name}</div>
                        {c.phone && <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{c.phone}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setIsDirty(true) }} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setIsDirty(true) }} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Email</label>
                <input value={customerEmail} onChange={(e) => { setCustomerEmail(e.target.value); setIsDirty(true) }} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Vehicle / Project */}
          {vehicleStr && (
            <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
              <h3 style={{ margin: `0 0 ${SPACING.sm}px`, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Vehicle</h3>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>{vehicleStr}</div>
            </div>
          )}

          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
            <h3 style={{ margin: `0 0 ${SPACING.sm}px`, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Project Description</h3>
            <textarea value={projectDescription} onChange={(e) => { setProjectDescription(e.target.value); setIsDirty(true) }}
              rows={3} placeholder="Describe the project scope..."
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          {/* Brand Display — only show when shop has multiple brands */}
          {brands.length > 1 && (
            <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
              <h3 style={{ margin: `0 0 ${SPACING.sm}px`, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Brand Display</h3>
              <select
                value={brandDisplayMode || ''}
                onChange={(e) => {
                  const val = e.target.value || null
                  setBrandDisplayMode(val)
                  if (val !== 'fixed') setBrandDisplayIds([])
                  setIsDirty(true)
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Shop Default</option>
                <option value="auto">Auto (from services)</option>
                <option value="fixed">Choose brand(s)</option>
              </select>
              {brandDisplayMode === 'fixed' && (
                <div style={{ marginTop: SPACING.sm, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {brands.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>
                      <input
                        type="checkbox"
                        checked={brandDisplayIds.includes(b.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...brandDisplayIds, b.id]
                            : brandDisplayIds.filter(id => id !== b.id)
                          setBrandDisplayIds(next)
                          setIsDirty(true)
                        }}
                        style={{ accentColor: COLORS.borderAccentSolid }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* PROJECT FILES / ATTACHMENTS */}
          {/* ============================================================ */}
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
            <h3 style={{ margin: `0 0 ${SPACING.sm}px`, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Project Files</h3>

            {/* Existing attachments */}
            {attachments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: SPACING.sm, marginBottom: SPACING.md }}>
                {attachments.map((att) => {
                  const isImage = att.contentType?.startsWith('image/')
                  return (
                    <div key={att.key} style={{ position: 'relative', borderRadius: RADIUS.sm, overflow: 'hidden', border: `1px solid ${COLORS.border}`, background: COLORS.inputBg }}>
                      {isImage ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                          <img src={att.url} alt={att.filename} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                        </a>
                      ) : (
                        <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 90, color: COLORS.textMuted, textDecoration: 'none' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </a>
                      )}
                      <div style={{ padding: '4px 6px', fontSize: '10px', color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.filename}
                      </div>
                      <button onClick={() => handleDeleteAttachment(att.key)} style={{
                        position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? COLORS.borderAccentSolid : COLORS.border}`,
                borderRadius: RADIUS.sm,
                padding: `${SPACING.lg}px`,
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? `${COLORS.borderAccentSolid}10` : 'transparent',
                transition: 'all 0.2s ease',
              }}
            >
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.mp4,.mov" style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files)} />
              {uploading ? (
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Uploading...</div>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" style={{ marginBottom: 4 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Drop files here or click to upload
                  </div>
                  <div style={{ fontSize: '11px', color: COLORS.textPlaceholder, marginTop: 2 }}>
                    Images, PDFs, Videos
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* LINE ITEMS — grouped by module */}
          {/* ============================================================ */}
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                <h3 style={{ margin: 0, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Services</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                {isQuote && !isPaid && (
                  <button
                    onClick={handleToggleOptionsMode}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 14px', borderRadius: RADIUS.sm, cursor: 'pointer',
                      background: optionsMode ? `${COLORS.borderAccentSolid}20` : 'transparent',
                      border: `1px solid ${optionsMode ? COLORS.borderAccentSolid : COLORS.borderInput}`,
                      color: optionsMode ? COLORS.borderAccentSolid : COLORS.textMuted,
                      fontSize: FONT.sizeXs, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 32, height: 18, borderRadius: 9, position: 'relative',
                      background: optionsMode ? COLORS.borderAccentSolid : COLORS.borderInput,
                      transition: 'background 0.15s',
                    }}>
                      <span style={{
                        position: 'absolute', top: 2, left: optionsMode ? 16 : 2,
                        width: 14, height: 14, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.15s',
                      }} />
                    </span>
                    Options Mode
                  </button>
                )}
                <button onClick={() => setShowSectionModal(true)} style={{
                  padding: '6px 14px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  background: COLORS.red, border: 'none',
                  borderRadius: RADIUS.sm, color: '#fff', cursor: 'pointer',
                }}>
                  + {optionsMode ? 'Add Option' : 'Add Section'}
                </button>
              </div>
            </div>

            {/* Section groups (FWG pattern) */}
            {lineItemGroups.map((group, groupIdx) => {
              const items = getGroupItems(group.group_id)
              const mod = modules.find(m => m.module_key === group.module_key)
              const modColor = mod?.color || MODULE_COLORS[group.module_key] || '#6b7280'
              const modLabel = mod?.label || MODULE_LABELS[group.module_key] || group.module_key
              const groupTotal = items.reduce((sum, li) => sum + (li.line_total || 0), 0)

              return (
                <div key={group.group_id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACING.sm }}>
                  {/* Section Header (FWG style) */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', background: COLORS.cardBg,
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    {optionsMode && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: COLORS.borderAccentSolid,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: '13px', flexShrink: 0,
                      }}>
                        {groupIdx + 1}
                      </div>
                    )}
                    <div style={{ width: 4, height: 24, borderRadius: 2, background: modColor }} />
                    <div style={{ flex: 1 }}>
                      {optionsMode ? (
                        /* Editable option title */
                        editingOptionTitle === group.group_id ? (
                          <input
                            value={optionTitles[group.group_id] || getOptionTitle(group, items)}
                            onChange={(e) => setOptionTitles(prev => ({ ...prev, [group.group_id]: e.target.value }))}
                            onBlur={() => { setEditingOptionTitle(null); setIsDirty(true) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { setEditingOptionTitle(null); setIsDirty(true) } }}
                            autoFocus
                            style={{ ...inputStyle, padding: '4px 8px', fontSize: '14px', fontWeight: 600 }}
                          />
                        ) : (
                          <div
                            onClick={() => !isPaid && setEditingOptionTitle(group.group_id)}
                            style={{ fontWeight: 600, fontSize: '14px', color: COLORS.textPrimary, cursor: isPaid ? 'default' : 'pointer' }}
                            title={isPaid ? undefined : 'Click to edit title'}
                          >
                            Option {groupIdx + 1} -- {getOptionTitle(group, items)}
                          </div>
                        )
                      ) : (
                        /* Standard mode: module label + vehicle */
                        <>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: COLORS.textPrimary }}>{modLabel}</div>
                          {group.module_key === 'auto_tint' && items[0]?.custom_fields?.vehicleYear && (
                            <div style={{ fontSize: '12px', color: COLORS.textMuted, marginTop: 2 }}>
                              {items[0].custom_fields.vehicleYear} {items[0].custom_fields.vehicleMake} {items[0].custom_fields.vehicleModel}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, background: COLORS.inputBg, padding: '2px 8px', borderRadius: '10px' }}>
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#22c55e' }}>{formatCurrency(groupTotal)}</div>
                    {!isPaid && (
                      <button onClick={() => deleteGroup(group.group_id)} style={{
                        background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: '4px',
                      }} title="Delete section">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>

                  {/* Line items within this section */}
                  <div style={{ padding: '0 16px' }}>
                  {/* Non-tint modules: inline-editable table (FWG pattern) */}
                  {group.module_key !== 'auto_tint' && items.filter(li => li.description).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 -16px', maxWidth: 'calc(100% + 32px)' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: COLORS.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: COLORS.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '70px' }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: COLORS.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '90px' }}>Rate</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: COLORS.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '100px' }}>Total</th>
                          <th style={{ width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.filter(li => li.description).map(li => (
                          <tr key={li.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: '8px 12px' }}>
                              <input type="text" value={li.description} onChange={(e) => {
                                setLineItems(prev => prev.map(l => l.id === li.id ? { ...l, description: e.target.value } : l))
                                setIsDirty(true)
                              }} style={{ ...inputStyle, padding: '8px', fontSize: '13px' }} />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <input type="number" value={li.quantity || ''} onChange={(e) => {
                                const qty = parseInt(e.target.value) || 0
                                setLineItems(prev => prev.map(l => l.id === li.id ? { ...l, quantity: qty, line_total: qty * l.unit_price } : l))
                                setIsDirty(true)
                              }} style={{ ...inputStyle, padding: '8px', fontSize: '13px', textAlign: 'right' as const }} />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <input type="number" step="0.01" value={li.unit_price || ''} onChange={(e) => {
                                const rate = parseFloat(e.target.value) || 0
                                setLineItems(prev => prev.map(l => l.id === li.id ? { ...l, unit_price: rate, line_total: l.quantity * rate } : l))
                                setIsDirty(true)
                              }} style={{ ...inputStyle, padding: '8px', fontSize: '13px', textAlign: 'right' as const }} />
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 500, fontSize: '14px' }}>
                              {formatCurrency(li.line_total)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              {!isPaid && (
                                <button onClick={() => handleDeleteLineItem(li.id)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4 }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {/* Auto Tint: card-style read-only items */}
                  {group.module_key === 'auto_tint' && (<>
                  {items.map((li, idx) => {
                    const cf = li.custom_fields || {}
                    const isEditing = editingItemId === li.id

                    if (isEditing) {
                      return (
                        <div key={li.id} style={{
                          display: 'flex', alignItems: 'flex-end', gap: SPACING.xs,
                          padding: `${SPACING.sm}px 0`,
                          borderBottom: idx < items.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                        }}>
                          <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Description</label>
                            <input value={editItemDesc} onChange={(e) => setEditItemDesc(e.target.value)} style={inputStyle}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLineItem(); if (e.key === 'Escape') setEditingItemId(null) }}
                              autoFocus />
                          </div>
                          <div style={{ width: 60 }}>
                            <label style={labelStyle}>Qty</label>
                            <input type="number" value={editItemQty} onChange={(e) => setEditItemQty(e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ width: 90 }}>
                            <label style={labelStyle}>Price</label>
                            <input type="number" value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)} style={inputStyle}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLineItem() }} />
                          </div>
                          <ActionButton variant="success" onClick={handleSaveLineItem} style={{ padding: '10px 12px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          </ActionButton>
                          <button onClick={() => setEditingItemId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      )
                    }

                    return (
                      <div key={li.id} style={{
                        display: 'flex', alignItems: 'center', gap: SPACING.sm,
                        padding: `${SPACING.sm}px 0`,
                        borderBottom: idx < items.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                        cursor: !isPaid ? 'pointer' : 'default',
                      }}
                        onDoubleClick={() => !isPaid && startEditLineItem(li)}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: modColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{li.description}</div>
                          {(cf.filmName || cf.shade) && (
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {cf.filmName}{cf.shade ? ` ${cf.shade}` : ''}
                              {cf.rollId && ` -- Roll: ${cf.rollId}`}
                            </div>
                          )}
                        </div>
                        {li.quantity > 1 && (
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>x{li.quantity}</div>
                        )}
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: '#22c55e', whiteSpace: 'nowrap' }}>
                          {formatCurrency(li.line_total)}
                        </div>
                        {!isPaid && (
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button onClick={(e) => { e.stopPropagation(); startEditLineItem(li) }} style={{
                              background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteLineItem(li.id) }} style={{
                              background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </>)}
                  </div>

                  {/* Add item to this section button */}
                  {!isPaid && (
                    <div style={{ padding: '8px 0' }}>
                      {addingToGroup === group.group_id ? (
                        <div style={{ display: 'flex', gap: SPACING.xs, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <input value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} placeholder="Description"
                              style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(group.group_id); if (e.key === 'Escape') setAddingToGroup(null) }}
                              autoFocus />
                          </div>
                          <div style={{ width: 60 }}>
                            <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} placeholder="Qty"
                              style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          </div>
                          <div style={{ width: 80 }}>
                            <input type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} placeholder="Price"
                              style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(group.group_id) }} />
                          </div>
                          <ActionButton variant="success" onClick={() => handleAddLineItem(group.group_id)} disabled={!newItemDesc.trim() || !newItemPrice}
                            style={{ padding: '6px 10px', fontSize: '12px' }}>Add</ActionButton>
                          <button onClick={() => setAddingToGroup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingToGroup(group.group_id); setNewItemDesc(''); setNewItemPrice(''); setNewItemQty('1') }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                            color: COLORS.textMuted, fontSize: '12px', cursor: 'pointer', padding: '4px 0',
                          }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Add item
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {lineItemGroups.length === 0 && !showTintEditor && (
              <div style={{ padding: `${SPACING.xl}px 0`, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                No sections added yet. Click "+ Add Section" to begin.
              </div>
            )}

            {/* YMM Vehicle Picker -- shown before tint editor when document has no vehicle */}
            {showVehiclePicker && (
              <div style={{ border: `2px solid ${MODULE_COLORS.auto_tint}`, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACING.sm }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', background: `${MODULE_COLORS.auto_tint}15`,
                  borderBottom: `1px solid ${MODULE_COLORS.auto_tint}40`,
                }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: MODULE_COLORS.auto_tint }} />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: COLORS.textPrimary }}>Select Vehicle</span>
                  <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Required for tint pricing</span>
                </div>
                <div style={{ padding: '20px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: SPACING.sm, marginBottom: SPACING.md }}>
                    {/* Year */}
                    <div>
                      <label style={labelStyle}>Year</label>
                      <select value={pickYear} onChange={(e) => { setPickYear(e.target.value); setPickMake(''); setPickModel('') }}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Year...</option>
                        {ymmYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    {/* Make */}
                    <div>
                      <label style={labelStyle}>Make</label>
                      <select value={pickMake} onChange={(e) => { setPickMake(e.target.value); setPickModel('') }}
                        disabled={!pickYear} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Make...</option>
                        {ymmMakes.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    {/* Model */}
                    <div>
                      <label style={labelStyle}>Model</label>
                      <select value={pickModel} onChange={(e) => setPickModel(e.target.value)}
                        disabled={!pickMake} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Model...</option>
                        {ymmModels.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  {pickedVehicle && (
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
                      Class: {pickedVehicle.class_keys?.join(', ') || 'Standard'}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: SPACING.sm }}>
                    <ActionButton variant="success" onClick={handleVehicleConfirmed}
                      disabled={!pickedVehicle}
                      style={{ flex: 1, justifyContent: 'center' }}>
                      Continue to Service Selection
                    </ActionButton>
                    <ActionButton onClick={() => { setShowVehiclePicker(false); setTintEditorGroupId(null) }}>
                      Cancel
                    </ActionButton>
                  </div>
                </div>
              </div>
            )}

            {/* Tint ServiceLineEditor -- shown when adding an Auto Tint section */}
            {showTintEditor && (
              <div style={{ border: `2px solid ${MODULE_COLORS.auto_tint}`, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACING.sm }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', background: `${MODULE_COLORS.auto_tint}15`,
                  borderBottom: `1px solid ${MODULE_COLORS.auto_tint}40`,
                }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: MODULE_COLORS.auto_tint }} />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: COLORS.textPrimary }}>Window Tint</span>
                  <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Select services for {vehicleStr || 'vehicle'}</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <ServiceLineEditor
                    initialLines={[]}
                    vehicleYear={doc.vehicle_year || (pickYear ? parseInt(pickYear) : null)}
                    vehicleMake={doc.vehicle_make || pickMake || null}
                    vehicleModel={doc.vehicle_model || pickModel || null}
                    classKeys={doc.class_keys || pickedClassKeys || null}
                    module="auto_tint"
                    onSave={handleTintEditorSave}
                    onCancel={() => { setShowTintEditor(false); setTintEditorGroupId(null) }}
                  />
                </div>
              </div>
            )}

            {/* Totals + Discount Editing */}
            <div style={{ marginTop: SPACING.lg, paddingTop: SPACING.md, borderTop: `2px solid ${COLORS.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Subtotal</span>
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{formatCurrency(subtotal)}</span>
              </div>

              {/* Discount row — editable */}
              {!isPaid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: FONT.sizeSm, color: '#22c55e' }}>Discount</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      value={discountPercent || ''}
                      onChange={(e) => { setDiscountPercent(parseFloat(e.target.value) || 0); setDiscountAmount(0); setIsDirty(true) }}
                      placeholder="%"
                      style={{ ...inputStyle, width: 50, textAlign: 'right' as const, padding: '4px 6px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '11px', color: COLORS.textMuted }}>% or $</span>
                    <input
                      type="number"
                      value={discountAmount || ''}
                      onChange={(e) => { setDiscountAmount(parseFloat(e.target.value) || 0); setDiscountPercent(0); setIsDirty(true) }}
                      placeholder="$0"
                      style={{ ...inputStyle, width: 70, textAlign: 'right' as const, padding: '4px 6px', fontSize: '12px' }}
                    />
                    {discountTotal > 0 && (
                      <span style={{ fontSize: FONT.sizeSm, color: '#22c55e', fontWeight: 600 }}>-{formatCurrency(discountTotal)}</span>
                    )}
                  </div>
                </div>
              )}
              {isPaid && discountTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: FONT.sizeSm, color: '#22c55e' }}>Discount</span>
                  <span style={{ fontSize: FONT.sizeSm, color: '#22c55e' }}>-{formatCurrency(discountTotal)}</span>
                </div>
              )}
              {doc.deposit_paid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Deposit Paid</span>
                  <span style={{ fontSize: FONT.sizeSm, color: '#22c55e' }}>-{formatCurrency(doc.deposit_paid)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTop: `1px solid ${COLORS.border}` }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: COLORS.textPrimary }}>
                  {isPaid ? 'Paid' : 'Balance Due'}
                </span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: isPaid ? '#22c55e' : '#ef4444' }}>
                  {formatCurrency(isPaid ? 0 : balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: COLORS.cardBg, borderRadius: RADIUS.md, padding: SPACING.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
            <h3 style={{ margin: `0 0 ${SPACING.sm}px`, fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>Internal Notes</h3>
            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setIsDirty(true) }}
              rows={3} placeholder="Notes visible only to your team..."
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>
        </div>

        {/* RIGHT COLUMN — payments, history, quick actions */}
        <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${COLORS.border}`, overflowY: 'auto', padding: SPACING.lg }}>

          {/* Quick Info */}
          <div style={{ marginBottom: SPACING.lg }}>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
              {!isPaid && doc.status !== 'void' && (
                <ActionButton onClick={() => setShowSendModal(true)} style={{ width: '100%', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Send to Customer
                </ActionButton>
              )}
              <ActionButton onClick={() => {
                const link = `${window.location.origin}/invoice/${doc.public_token}`
                navigator.clipboard.writeText(link)
              }} style={{ width: '100%', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy Link
              </ActionButton>
            </div>
          </div>

          {/* Payments */}
          <div style={{ marginBottom: SPACING.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
              <span style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payments</span>
              {!isPaid && (
                <button onClick={() => setShowPaymentModal(true)} style={{
                  background: 'none', border: 'none', color: COLORS.borderAccentSolid, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}>+ Record</button>
              )}
            </div>
            {payments.length > 0 ? payments.map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: `${SPACING.xs}px 0`, borderBottom: `1px solid ${COLORS.border}`,
              }}>
                <div>
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{formatCurrency(p.amount)}</div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{p.payment_method} -- {formatDate(p.created_at)}</div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
                  background: p.status === 'confirmed' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                  color: p.status === 'confirmed' ? '#22c55e' : '#f59e0b',
                }}>{p.status}</span>
              </div>
            )) : (
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>No payments recorded</div>
            )}
          </div>

          {/* Revision History / Change Requests */}
          {doc.status === 'revision_requested' && notes && notes.includes('CHANGE REQUEST') && (
            <div style={{ marginBottom: SPACING.lg }}>
              <div style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
                Change Requests
              </div>
              <div style={{
                background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: RADIUS.sm, padding: SPACING.md,
              }}>
                {notes.split('--- CHANGE REQUEST').filter((_: string, i: number) => i > 0).map((block: string, i: number) => {
                  const lines = block.trim().split('\n').filter(Boolean)
                  const dateLine = lines[0]?.replace(/[()]/g, '').replace('---', '').trim()
                  const message = lines.slice(1).filter(l => !l.startsWith('Preferred contact:')).join('\n').trim()
                  const contactPref = lines.find(l => l.startsWith('Preferred contact:'))?.replace('Preferred contact:', '').trim()
                  return (
                    <div key={i} style={{ marginBottom: i < notes.split('--- CHANGE REQUEST').length - 2 ? SPACING.md : 0 }}>
                      <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>
                        {dateLine}
                        {contactPref && <span style={{ color: COLORS.textMuted, fontWeight: 400 }}> -- prefers {contactPref}</span>}
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {message}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Quick action: re-send after revisions */}
              <div style={{ marginTop: SPACING.sm }}>
                <ActionButton variant="primary" onClick={() => {
                  // Reset to draft so it can be re-sent
                  fetch(`/api/documents/${doc.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'draft' }),
                  }).then(() => setDoc(prev => ({ ...prev, status: 'draft' })))
                }} style={{ width: '100%', justifyContent: 'center', fontSize: '13px' }}>
                  Mark as Revised (Back to Draft)
                </ActionButton>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>
              Timeline
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
              {doc.created_at && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.textMuted, marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>Created</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateTime(doc.created_at)}</div>
                  </div>
                </div>
              )}
              {doc.sent_at && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>Sent</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateTime(doc.sent_at)}</div>
                  </div>
                </div>
              )}
              {doc.viewed_at && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>Viewed by Customer</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateTime(doc.viewed_at)}</div>
                  </div>
                </div>
              )}
              {doc.approved_at && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>Approved</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateTime(doc.approved_at)}</div>
                  </div>
                </div>
              )}
              {doc.paid_at && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPrimary }}>Paid</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateTime(doc.paid_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SEND MODAL */}
      {/* ================================================================ */}
      {showSendModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: SPACING.xl, width: 400 }}>
            <h3 style={{ margin: `0 0 ${SPACING.md}px`, color: COLORS.textPrimary, fontSize: '18px', fontWeight: 600 }}>
              Send {isQuote ? 'Quote' : 'Invoice'}
            </h3>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              Send to {customerName}{customerPhone ? ` at ${customerPhone}` : ''}{customerEmail ? ` / ${customerEmail}` : ''}
            </p>
            <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              <button onClick={() => setSendMethod('sms')} style={{
                flex: 1, padding: SPACING.md, borderRadius: RADIUS.sm, cursor: 'pointer',
                background: sendMethod === 'sms' ? `${COLORS.borderAccentSolid}20` : 'transparent',
                border: sendMethod === 'sms' ? `2px solid ${COLORS.borderAccentSolid}` : `1px solid ${COLORS.border}`,
                color: sendMethod === 'sms' ? COLORS.borderAccentSolid : COLORS.textMuted,
                fontSize: FONT.sizeSm, fontWeight: 600,
              }}>SMS</button>
              <button onClick={() => setSendMethod('email')} style={{
                flex: 1, padding: SPACING.md, borderRadius: RADIUS.sm, cursor: 'pointer',
                background: sendMethod === 'email' ? `${COLORS.borderAccentSolid}20` : 'transparent',
                border: sendMethod === 'email' ? `2px solid ${COLORS.borderAccentSolid}` : `1px solid ${COLORS.border}`,
                color: sendMethod === 'email' ? COLORS.borderAccentSolid : COLORS.textMuted,
                fontSize: FONT.sizeSm, fontWeight: 600,
              }}>Email</button>
            </div>

            {/* Quote Approval Mode (only for quotes) */}
            {isQuote && (() => {
              const enabledModes: { value: string; label: string; desc: string }[] = []
              if (approvalModes.schedule_approve) enabledModes.push({ value: 'schedule_approve', label: 'Schedule + Approve', desc: 'Customer picks a time slot, then approves' })
              if (approvalModes.just_approve) enabledModes.push({ value: 'just_approve', label: 'Just Approve', desc: 'Customer approves; you schedule later' })
              if (enabledModes.length === 0) return null
              return (
                <div style={{ marginBottom: SPACING.lg }}>
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>Approval Mode</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
                    {enabledModes.map(mode => (
                      <label key={mode.value} onClick={() => setSelectedApprovalMode(mode.value)} style={{
                        display: 'flex', alignItems: 'flex-start', gap: SPACING.sm, cursor: 'pointer',
                        padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                        background: selectedApprovalMode === mode.value ? `${COLORS.borderAccentSolid}10` : 'transparent',
                        border: selectedApprovalMode === mode.value ? `1px solid ${COLORS.borderAccentSolid}` : `1px solid ${COLORS.border}`,
                      }}>
                        <input
                          type="radio"
                          name="approval_mode"
                          checked={selectedApprovalMode === mode.value}
                          onChange={() => setSelectedApprovalMode(mode.value)}
                          style={{ marginTop: 3, accentColor: COLORS.borderAccentSolid }}
                        />
                        <div>
                          <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>{mode.label}</div>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{mode.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Time slot builder for Schedule + Approve */}
                  {selectedApprovalMode === 'schedule_approve' && (
                    <div style={{ marginTop: SPACING.md, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderInput}` }}>
                      <div style={{ fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>Available Time Slots (up to 5)</div>
                      {availableSlots.map((slot, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: SPACING.sm, marginBottom: SPACING.sm, alignItems: 'center',
                          padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                          background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
                        }}>
                          <span style={{
                            fontSize: FONT.sizeXs, fontWeight: 600, color: COLORS.textMuted,
                            minWidth: 42, flexShrink: 0,
                          }}>Slot {i + 1}</span>
                          <input
                            type="date"
                            value={slot.date}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={e => {
                              const updated = [...availableSlots]
                              updated[i] = { ...updated[i], date: e.target.value }
                              setAvailableSlots(updated)
                            }}
                            style={{
                              flex: 1, padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.sm,
                              background: COLORS.pageBg, color: COLORS.textPrimary,
                              border: `1px solid ${COLORS.border}`, fontSize: FONT.sizeXs, fontFamily: 'inherit',
                              cursor: 'pointer',
                            }}
                          />
                          <select
                            value={slot.time}
                            onChange={e => {
                              const updated = [...availableSlots]
                              updated[i] = { ...updated[i], time: e.target.value }
                              setAvailableSlots(updated)
                            }}
                            style={{
                              width: 120, padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.sm,
                              background: COLORS.pageBg, color: COLORS.textPrimary,
                              border: `1px solid ${COLORS.border}`, fontSize: FONT.sizeXs, fontFamily: 'inherit',
                              appearance: 'auto',
                            }}
                          >
                            <option value="">Time</option>
                            {Array.from({ length: 23 }, (_, idx) => {
                              const hour = 7 + Math.floor(idx / 2)
                              const min = idx % 2 === 0 ? '00' : '30'
                              const val = `${hour.toString().padStart(2, '0')}:${min}`
                              const ampm = hour >= 12 ? 'PM' : 'AM'
                              const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                              return <option key={val} value={val}>{h12}:{min} {ampm}</option>
                            })}
                          </select>
                          {availableSlots.length > 1 && (
                            <button
                              onClick={() => setAvailableSlots(availableSlots.filter((_, j) => j !== i))}
                              style={{
                                background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
                                fontSize: '14px', padding: '2px 6px', lineHeight: 1, borderRadius: RADIUS.sm,
                                flexShrink: 0,
                              }}
                              title="Remove slot"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {availableSlots.length < 5 && (
                        <button
                          onClick={() => setAvailableSlots([...availableSlots, { date: '', time: '' }])}
                          style={{
                            background: 'none', border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.sm,
                            color: COLORS.textMuted, fontSize: FONT.sizeXs, padding: `${SPACING.xs}px ${SPACING.sm}px`,
                            cursor: 'pointer', width: '100%', marginTop: SPACING.xs,
                          }}
                        >+ Add Slot</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <ActionButton variant="primary" onClick={handleSendDocument} disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                {sending ? 'Sending...' : 'Send Now'}
              </ActionButton>
              <ActionButton onClick={() => setShowSendModal(false)}>Cancel</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: SPACING.xl, width: 400 }}>
            <h3 style={{ margin: `0 0 ${SPACING.md}px`, color: COLORS.textPrimary, fontSize: '18px', fontWeight: 600 }}>
              Void {isQuote ? 'Quote' : 'Invoice'}?
            </h3>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
              This will mark {doc.doc_number} as void. This action cannot be easily undone.
            </p>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <ActionButton variant="danger" onClick={handleDelete} style={{ flex: 1, justifyContent: 'center' }}>
                Void {isQuote ? 'Quote' : 'Invoice'}
              </ActionButton>
              <ActionButton onClick={() => setShowDeleteModal(false)}>Cancel</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Add Section Modal (FWG pattern — tabs by parent category, module buttons) */}
      {showSectionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSectionModal(false)}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, width: '100%', maxWidth: 500 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: COLORS.textPrimary, fontSize: '18px', fontWeight: 600, margin: 0 }}>
                {optionsMode ? 'Add Option' : 'Add Section'}
              </h2>
              <button onClick={() => setShowSectionModal(false)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, fontSize: '24px', cursor: 'pointer' }}>x</button>
            </div>

            {/* Tabs by parent category */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.border}` }}>
              {parentCategories.map(tab => (
                <button key={tab} onClick={() => setSectionModalTab(tab)} style={{
                  flex: 1, padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: sectionModalTab === tab ? `2px solid ${COLORS.borderAccentSolid}` : '2px solid transparent',
                  color: sectionModalTab === tab ? COLORS.borderAccentSolid : COLORS.textMuted,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Module buttons grid */}
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', maxHeight: '300px', overflow: 'auto' }}>
              {(modulesByParent[sectionModalTab] || []).map(mod => (
                <button key={mod.module_key} onClick={() => addSection(mod.module_key)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                  background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = mod.color; e.currentTarget.style.background = `${mod.color}10` }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = COLORS.cardBg }}
                >
                  <div style={{ width: 4, height: 20, borderRadius: 2, background: mod.color }} />
                  <span style={{ color: COLORS.textPrimary, fontSize: '13px', fontWeight: 500 }}>{mod.label}</span>
                </button>
              ))}
              {(modulesByParent[sectionModalTab] || []).length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: COLORS.textMuted, padding: '20px', fontSize: FONT.sizeSm }}>
                  No modules in this category
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {showFollowUpModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: SPACING.xl, width: 480 }}>
            <h3 style={{ margin: `0 0 ${SPACING.sm}px`, color: COLORS.textPrimary, fontSize: '18px', fontWeight: 600 }}>
              Follow Up
              {(doc as any).followup_count > 0 && (
                <span style={{ fontSize: '13px', color: COLORS.textMuted, fontWeight: 400, marginLeft: 8 }}>
                  #{((doc as any).followup_count || 0) + 1}
                </span>
              )}
            </h3>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Send a follow-up message to {customerName || 'the customer'} about this {isQuote ? 'quote' : 'invoice'}.
            </p>

            <div style={{ marginBottom: SPACING.md }}>
              <label style={labelStyle}>Message</label>
              <textarea value={followUpMessage} onChange={(e) => setFollowUpMessage(e.target.value)}
                rows={4} style={{ ...inputStyle, resize: 'vertical' as const }} />
            </div>

            {/* Incentive toggle */}
            <div style={{ marginBottom: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, background: followUpIncentive ? `${COLORS.borderAccentSolid}08` : 'transparent' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: followUpIncentive ? SPACING.sm : 0 }}>
                <input type="checkbox" checked={followUpIncentive} onChange={(e) => setFollowUpIncentive(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: COLORS.borderAccentSolid }} />
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: 500 }}>Include discount incentive</span>
              </label>
              {followUpIncentive && (
                <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', marginTop: SPACING.sm }}>
                  <select value={followUpDiscountType} onChange={(e) => setFollowUpDiscountType(e.target.value as any)}
                    style={{ ...inputStyle, width: 90, cursor: 'pointer' }}>
                    <option value="percent">%</option>
                    <option value="dollar">$</option>
                  </select>
                  <input type="number" value={followUpDiscountValue} onChange={(e) => setFollowUpDiscountValue(e.target.value)}
                    style={{ ...inputStyle, width: 80 }} />
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    = {formatCurrency(followUpDiscountType === 'percent' ? subtotal * (parseFloat(followUpDiscountValue) || 0) / 100 : parseFloat(followUpDiscountValue) || 0)} off
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <ActionButton variant="primary" onClick={handleSendFollowUp} disabled={sendingFollowUp || !followUpMessage.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                {sendingFollowUp ? 'Sending...' : 'Send Follow-Up'}
              </ActionButton>
              <ActionButton onClick={() => setShowFollowUpModal(false)}>Cancel</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Payment recording modal */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: SPACING.xl, width: 400 }}>
            <h3 style={{ margin: `0 0 ${SPACING.md}px`, color: COLORS.textPrimary, fontSize: '18px', fontWeight: 600 }}>
              Record Payment
            </h3>
            <div style={{ marginBottom: SPACING.md }}>
              <label style={labelStyle}>Amount</label>
              <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00" style={inputStyle} autoFocus />
            </div>
            <div style={{ marginBottom: SPACING.lg }}>
              <label style={labelStyle}>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="cash">Cash</option>
                <option value="cc">Credit Card</option>
                <option value="venmo">Venmo</option>
                <option value="zelle">Zelle</option>
                <option value="cashapp">Cash App</option>
                <option value="applepay">Apple Pay</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <ActionButton variant="success" onClick={handleRecordPayment} disabled={recordingPayment || !paymentAmount} style={{ flex: 1, justifyContent: 'center' }}>
                {recordingPayment ? 'Recording...' : 'Record Payment'}
              </ActionButton>
              <ActionButton onClick={() => setShowPaymentModal(false)}>Cancel</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Schedule from Quote Modal */}
      {showScheduleModal && (
        <ScheduleFromQuoteModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          document={{
            id: doc.id,
            customer_name: doc.customer_name || customerName,
            vehicle_year: doc.vehicle_year,
            vehicle_make: doc.vehicle_make,
            vehicle_model: doc.vehicle_model,
          }}
          lineItems={lineItems.map(li => ({
            module: li.module || 'auto_tint',
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            line_total: li.line_total,
            custom_fields: (li as any).custom_fields || {},
          }))}
          shopModules={shopModules}
          onScheduled={() => {
            setShowScheduleModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  )
}
