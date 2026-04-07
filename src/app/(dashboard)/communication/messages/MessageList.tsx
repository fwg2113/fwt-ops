'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowser } from '@/app/lib/supabase-browser'
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme'

// FWT sms_messages schema
type Message = {
  id: string
  shop_id: number
  direction: 'inbound' | 'outbound'
  from_phone: string
  to_phone: string
  body: string
  media_url?: string | null
  status: string
  read: boolean
  customer_name: string | null
  twilio_sid: string | null
  created_at: string
}

type Call = {
  id: string
  direction: string
  caller_phone: string
  caller_name: string | null
  receiver_phone: string | null
  answered_by: string | null
  status: string
  duration: number
  recording_url: string | null
  voicemail_url: string | null
  call_sid: string | null
  created_at: string
  read?: boolean
  archived?: boolean
  category?: string | null
}

// FWT call categories
const CALL_CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  'auto-tint': { label: 'Auto Tint', color: '#dc2626' },
  'flat-glass': { label: 'Flat Glass', color: '#3b82f6' },
  'ppf': { label: 'PPF', color: '#8b5cf6' },
  'wraps-graphics': { label: 'Wraps & Graphics', color: '#f59e0b' },
  'apparel': { label: 'Apparel', color: '#10b981' },
  'general': { label: 'General', color: '#64748b' },
}

const MESSAGE_TEMPLATES = [
  { id: 'missed', label: 'Missed Call', text: "Sorry we missed your call! We were likely on another line or assisting a customer. How can we help you?" },
  { id: 'followup', label: 'Follow Up', text: "Hi! It was great speaking with you. Please let us know if you have any questions." },
  { id: 'quote', label: 'Quote Ready', text: "Hi! Your quote is ready. Please let us know if you have any questions or would like to proceed." },
  { id: 'thanks', label: 'Thank You', text: "Thank you for choosing Frederick Window Tinting! We appreciate your business." },
]

type Conversation = {
  phone: string
  name: string | null
  lastMessage: string
  lastTime: string
  unreadCount: number
  messages: Message[]
  linkedCustomerId?: string
  linkedCustomerName?: string
}

type Customer = {
  id: string
  display_name: string
  email: string | null
  phone: string | null
  company: string | null
}

// Helper: get the "other" phone number from a message (the customer, not our Twilio number)
const getCustomerPhone = (msg: Message): string => {
  return msg.direction === 'inbound' ? msg.from_phone : msg.to_phone
}

// Icons
const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const ArchiveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const MessageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const UserPlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
)

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 5L2 7" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// Helper functions
const getInitials = (name: string | null, phone: string) => {
  if (name) {
    const parts = name.split(' ').filter(p => p)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  return phone.slice(-2)
}

const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } else if (diffDays <= 1 && date.getDate() === now.getDate() - 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const formatDateDivider = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0 && date.getDate() === now.getDate()) {
    return 'Today'
  } else if (diffDays <= 1 && date.getDate() === now.getDate() - 1) {
    return 'Yesterday'
  }
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// Normalize phone to 10-digit for matching
const normalizePhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.slice(1)
  return cleaned
}

// Extract potential name from messages
const extractNameFromMessages = (messages: Message[]): string | null => {
  const inboundMessages = messages.filter(m => m.direction === 'inbound')
  for (const msg of inboundMessages) {
    const patterns = [
      /(?:this is|my name is|i'm|i am|it's|its)\s+([a-z]+(?:\s+[a-z]+)?)/i,
      /^([a-z]+(?:\s+[a-z]+)?)\s+here/i,
      /^hey,?\s+(?:this is\s+)?([a-z]+)/i
    ]
    for (const pattern of patterns) {
      const match = msg.body.match(pattern)
      if (match && match[1] && match[1].length > 1 && match[1].length < 30) {
        return match[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      }
    }
  }
  return null
}

// Extract potential email from messages
const extractEmailFromMessages = (messages: Message[]): string | null => {
  for (const msg of messages) {
    const emailMatch = msg.body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) {
      return emailMatch[0].toLowerCase()
    }
  }
  return null
}

export default function MessageList({ initialMessages, initialCalls = [] }: { initialMessages: Message[], initialCalls?: Call[] }) {
  const supabase = createSupabaseBrowser()
  const searchParams = useSearchParams()
  const phoneParam = searchParams.get('phone')

  const [activeView, setActiveView] = useState<'messages' | 'calls'>('messages')
  const [calls, setCalls] = useState<Call[]>(initialCalls)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactModalMode, setContactModalMode] = useState<'new' | 'link'>('new')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '' })
  const [saving, setSaving] = useState(false)
  const [phoneLinks, setPhoneLinks] = useState<Record<string, { customerId: string, customerName: string }>>({})
  const [showNewMessageModal, setShowNewMessageModal] = useState(false)
  const [newMessagePhone, setNewMessagePhone] = useState('')
  const [newMessageCustomerName, setNewMessageCustomerName] = useState('')
  const [newMessageCustomerSearch, setNewMessageCustomerSearch] = useState('')
  const [newMessageCustomerResults, setNewMessageCustomerResults] = useState<Array<{ phone: string, name: string }>>([])
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [callModalMessage, setCallModalMessage] = useState('')
  const [sendingFromModal, setSendingFromModal] = useState(false)
  const [callingFromModal, setCallingFromModal] = useState(false)
  const [attachment, setAttachment] = useState<{ file: File, url: string, uploading: boolean } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxZoom, setLightboxZoom] = useState(1)
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load phone links from customers table (FWT has phone directly on customers, no join table)
  useEffect(() => {
    const loadPhoneLinks = async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, display_name, phone')
        .not('phone', 'is', null)

      if (data) {
        const links: Record<string, { customerId: string, customerName: string }> = {}
        data.forEach((c: any) => {
          if (c.phone) {
            const normalized = normalizePhone(c.phone)
            links[normalized] = {
              customerId: c.id,
              customerName: c.display_name,
            }
            // Also store with +1 prefix for matching
            links['+1' + normalized] = {
              customerId: c.id,
              customerName: c.display_name,
            }
          }
        })
        setPhoneLinks(links)
      }
    }
    loadPhoneLinks()
  }, [])

  // Build conversations from messages (adapted for sms_messages schema)
  const buildConversations = (messages: Message[]) => {
    const grouped: Record<string, Message[]> = {}

    messages.forEach(msg => {
      const phone = getCustomerPhone(msg)
      const normalized = normalizePhone(phone)
      if (!grouped[normalized]) grouped[normalized] = []
      grouped[normalized].push(msg)
    })

    const convos: Conversation[] = Object.entries(grouped).map(([phone, msgs]) => {
      const sorted = msgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const unread = msgs.filter(m => m.direction === 'inbound' && !m.read).length
      const link = phoneLinks[phone] || phoneLinks['+1' + phone]
      // Get customer name from messages or link
      const msgName = sorted.find(m => m.customer_name)?.customer_name || null
      return {
        phone,
        name: msgName,
        lastMessage: sorted[0]?.body || '',
        lastTime: sorted[0]?.created_at || '',
        unreadCount: unread,
        messages: sorted.reverse(),
        linkedCustomerId: link?.customerId,
        linkedCustomerName: link?.customerName,
      }
    })

    convos.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime())
    return convos
  }

  // Initial load and when phoneLinks change
  useEffect(() => {
    const convos = buildConversations(initialMessages)

    // If phone param in URL, select that conversation
    if (phoneParam) {
      const cleanPhone = normalizePhone(phoneParam)
      const matchingConvo = convos.find(c => {
        return c.phone === cleanPhone || normalizePhone(c.phone) === cleanPhone
      })

      if (matchingConvo) {
        setConversations(convos)
        setSelectedPhone(matchingConvo.phone)
        if (matchingConvo.unreadCount > 0) {
          markAsRead(matchingConvo.phone)
        }
      } else {
        // Create new empty conversation
        const link = phoneLinks[cleanPhone]
        const newConvo: Conversation = {
          phone: cleanPhone,
          name: null,
          lastMessage: '',
          lastTime: new Date().toISOString(),
          unreadCount: 0,
          messages: [],
          linkedCustomerId: link?.customerId,
          linkedCustomerName: link?.customerName,
        }
        setConversations([newConvo, ...convos])
        setSelectedPhone(cleanPhone)
      }
      return
    }

    setConversations(convos)
    if (convos.length > 0 && !selectedPhone) {
      setSelectedPhone(convos[0].phone)
    }
  }, [initialMessages, phoneLinks, phoneParam])

  // Realtime subscription for messages
  useEffect(() => {
    const channel = supabase
      .channel('sms-messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages' },
        (payload) => {
          const newMsg = payload.new as Message
          const phone = normalizePhone(getCustomerPhone(newMsg))

          setConversations(prevConvos => {
            const existingConvo = prevConvos.find(c => c.phone === phone)

            if (existingConvo) {
              return prevConvos.map(c => {
                if (c.phone === phone) {
                  return {
                    ...c,
                    messages: [...c.messages, newMsg],
                    lastMessage: newMsg.body,
                    lastTime: newMsg.created_at,
                    unreadCount: newMsg.direction === 'inbound' && !newMsg.read
                      ? c.unreadCount + 1
                      : c.unreadCount
                  }
                }
                return c
              }).sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime())
            } else {
              const link = phoneLinks[phone]
              const newConvo: Conversation = {
                phone,
                name: newMsg.customer_name,
                lastMessage: newMsg.body,
                lastTime: newMsg.created_at,
                unreadCount: newMsg.direction === 'inbound' ? 1 : 0,
                messages: [newMsg],
                linkedCustomerId: link?.customerId,
                linkedCustomerName: link?.customerName,
              }
              return [newConvo, ...prevConvos]
            }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [phoneLinks])

  // Realtime subscription for calls
  useEffect(() => {
    const callsChannel = supabase
      .channel('calls-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        (payload) => {
          const newCall = payload.new as Call
          setCalls(prevCalls => [newCall, ...prevCalls])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        (payload) => {
          const updatedCall = payload.new as Call
          setCalls(prevCalls => prevCalls.map(c => c.id === updatedCall.id ? updatedCall : c))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(callsChannel)
    }
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations, selectedPhone])

  const selectedConvo = conversations.find(c => c.phone === selectedPhone)

  // Filter conversations by search
  const filteredConversations = conversations.filter(c => {
    if (!search.trim()) return true
    const searchLower = search.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(searchLower) ||
      (c.linkedCustomerName || '').toLowerCase().includes(searchLower) ||
      c.phone.includes(search) ||
      formatPhone(c.phone).includes(search)
    )
  })

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment?.url) || !selectedPhone) return

    setSending(true)

    try {
      const response = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedPhone,
          message: newMessage,
          mediaUrl: attachment?.url || undefined
        })
      })

      if (response.ok) {
        setNewMessage('')
        setAttachment(null)
      } else {
        const data = await response.json()
        alert('Failed to send: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to send:', error)
      alert('Failed to send message')
    }

    setSending(false)
  }

  const markAsRead = async (phone: string) => {
    // FWT schema: match by from_phone for inbound messages
    // We need to find all inbound messages from this phone number
    const phoneVariants = [phone]
    if (phone.length === 10) phoneVariants.push('+1' + phone, '1' + phone)

    for (const variant of phoneVariants) {
      await supabase
        .from('sms_messages')
        .update({ read: true })
        .ilike('from_phone', `%${variant}%`)
        .eq('direction', 'inbound')
        .eq('read', false)
    }

    setConversations(convos => convos.map(c => {
      if (c.phone === phone) {
        return { ...c, unreadCount: 0 }
      }
      return c
    }))
  }

  const markAsUnread = async () => {
    if (!selectedPhone || !selectedConvo) return

    const lastInbound = [...selectedConvo.messages].reverse().find(m => m.direction === 'inbound')
    if (lastInbound) {
      await supabase
        .from('sms_messages')
        .update({ read: false })
        .eq('id', lastInbound.id)

      setConversations(convos => convos.map(c => {
        if (c.phone === selectedPhone) {
          return { ...c, unreadCount: 1 }
        }
        return c
      }))
    }
  }

  const callCustomer = () => {
    if (selectedPhone) {
      window.open(`tel:${selectedPhone}`)
    }
  }

  // Open contact modal
  const openContactModal = () => {
    if (!selectedConvo) return

    const extractedName = extractNameFromMessages(selectedConvo.messages)
    const extractedEmail = extractEmailFromMessages(selectedConvo.messages)

    setContactForm({
      name: extractedName || '',
      email: extractedEmail || '',
      company: '',
    })
    setCustomerSearch('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setContactModalMode('new')
    setShowContactModal(true)
  }

  // Search customers
  const searchCustomers = async (query: string) => {
    if (!query.trim()) {
      setCustomerResults([])
      return
    }

    const { data } = await supabase
      .from('customers')
      .select('id, display_name, email, phone, company')
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10)

    setCustomerResults(data || [])
  }

  // Link phone to existing customer (FWT: update customer phone field directly)
  const linkToCustomer = async () => {
    if (!selectedCustomer || !selectedPhone) return
    setSaving(true)

    try {
      await supabase
        .from('customers')
        .update({ phone: normalizePhone(selectedPhone) })
        .eq('id', selectedCustomer.id)

      setPhoneLinks(prev => ({
        ...prev,
        [normalizePhone(selectedPhone)]: {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.display_name,
        }
      }))

      setShowContactModal(false)
    } catch (error: any) {
      alert('Failed to link contact: ' + error.message)
    }

    setSaving(false)
  }

  // Create new customer and set phone
  const createAndLinkCustomer = async () => {
    if (!selectedPhone || !contactForm.name.trim()) {
      alert('Please enter a name')
      return
    }
    setSaving(true)

    try {
      const nameParts = contactForm.name.trim().split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ')

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          display_name: contactForm.name.trim(),
          email: contactForm.email || null,
          company: contactForm.company || null,
          phone: normalizePhone(selectedPhone),
          lifetime_value: 0
        })
        .select()
        .single()

      if (customerError) throw customerError

      setPhoneLinks(prev => ({
        ...prev,
        [normalizePhone(selectedPhone)]: {
          customerId: newCustomer.id,
          customerName: newCustomer.display_name,
        }
      }))

      setShowContactModal(false)
    } catch (error: any) {
      alert('Failed to create contact: ' + error.message)
    }

    setSaving(false)
  }

  // Group messages by date for dividers
  const getMessagesWithDividers = (messages: Message[]) => {
    const result: { type: 'divider' | 'message'; date?: string; message?: Message }[] = []
    let lastDate = ''

    messages.forEach(msg => {
      const msgDate = new Date(msg.created_at).toDateString()
      if (msgDate !== lastDate) {
        result.push({ type: 'divider', date: msg.created_at })
        lastDate = msgDate
      }
      result.push({ type: 'message', message: msg })
    })

    return result
  }

  // Get display name for conversation
  const getConvoDisplayName = (convo: Conversation) => {
    if (convo.linkedCustomerName) return convo.linkedCustomerName
    return convo.name || formatPhone(convo.phone)
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', height: 'calc(100vh - 140px)' }}>
      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: SPACING.lg + 'px' }}>
        <button
          onClick={() => setActiveView('messages')}
          style={{
            padding: `${SPACING.md}px ${SPACING.xxl}px`,
            background: activeView === 'messages' ? COLORS.red : COLORS.cardBg,
            border: activeView === 'messages' ? 'none' : `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.lg + 'px',
            color: activeView === 'messages' ? 'white' : COLORS.textMuted,
            fontSize: FONT.sizeBase,
            fontWeight: activeView === 'messages' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <MessageIcon /> Messages
        </button>
        <button
          onClick={() => setActiveView('calls')}
          style={{
            padding: `${SPACING.md}px ${SPACING.xxl}px`,
            background: activeView === 'calls' ? COLORS.red : COLORS.cardBg,
            border: activeView === 'calls' ? 'none' : `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.lg + 'px',
            color: activeView === 'calls' ? 'white' : COLORS.textMuted,
            fontSize: FONT.sizeBase,
            fontWeight: activeView === 'calls' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <PhoneIcon /> Calls
          {calls.filter(c => (c.status === 'missed' || c.status === 'voicemail') && !c.read && !c.archived).length > 0 && (
            <span style={{
              background: COLORS.danger,
              color: 'white',
              fontSize: FONT.sizeXs,
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {calls.filter(c => (c.status === 'missed' || c.status === 'voicemail') && !c.read && !c.archived).length}
            </span>
          )}
        </button>
      </div>

      {activeView === 'messages' ? (
      <div style={{ display: 'flex', gap: SPACING.lg + 'px', height: 'calc(100% - 52px)' }}>
        {/* Conversation List */}
        <div style={{
          width: '340px',
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.xxl + 'px',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          {/* Search Header */}
          <div style={{ padding: SPACING.lg + 'px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: SPACING.md + 'px' }}>
              <button
                onClick={() => {
                  setNewMessagePhone('')
                  setNewMessageCustomerName('')
                  setNewMessageCustomerSearch('')
                  setNewMessageCustomerResults([])
                  setShowNewMessageModal(true)
                }}
                style={{
                  flex: 1,
                  padding: `${SPACING.md}px`,
                  background: COLORS.red,
                  border: 'none',
                  borderRadius: RADIUS.lg + 'px',
                  color: 'white',
                  fontSize: FONT.sizeBase,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Message
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: COLORS.textMuted }}>
                <SearchIcon />
              </div>
              <input
                type="text"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: `${SPACING.md}px 14px ${SPACING.md}px 40px`,
                  background: COLORS.inputBg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.lg + 'px',
                  color: COLORS.textPrimary,
                  fontSize: FONT.sizeBase
                }}
              />
            </div>
          </div>

          {/* Conversations */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConversations.length > 0 ? filteredConversations.map((convo) => (
              <div
                key={convo.phone}
                onClick={() => {
                  setSelectedPhone(convo.phone)
                  if (convo.unreadCount > 0) markAsRead(convo.phone)
                }}
                style={{
                  display: 'flex',
                  gap: SPACING.md + 'px',
                  padding: `14px ${SPACING.lg}px`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                  background: selectedPhone === convo.phone ? COLORS.activeBg : 'transparent',
                  borderLeft: selectedPhone === convo.phone ? `3px solid ${COLORS.red}` : '3px solid transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: convo.linkedCustomerId ? COLORS.success : convo.unreadCount > 0 ? COLORS.red : COLORS.inputBg,
                  color: convo.linkedCustomerId || convo.unreadCount > 0 ? 'white' : COLORS.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: FONT.sizeBase,
                  fontWeight: 600,
                  flexShrink: 0
                }}>
                  {getInitials(convo.linkedCustomerName || convo.name, convo.phone)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      color: COLORS.textPrimary,
                      fontSize: FONT.sizeBase,
                      fontWeight: convo.unreadCount > 0 ? 600 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {getConvoDisplayName(convo)}
                    </span>
                    <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, flexShrink: 0 }}>
                      {formatTime(convo.lastTime)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      color: convo.unreadCount > 0 ? COLORS.textPrimary : COLORS.textMuted,
                      fontSize: FONT.sizeMd,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: convo.unreadCount > 0 ? 500 : 400
                    }}>
                      {convo.lastMessage}
                    </span>
                    {convo.unreadCount > 0 && (
                      <span style={{
                        background: COLORS.red,
                        color: 'white',
                        fontSize: FONT.sizeXs,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        marginLeft: '8px',
                        flexShrink: 0
                      }}>
                        {convo.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted }}>
                {search ? 'No conversations match your search' : 'No conversations yet'}
              </div>
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div style={{
          flex: 1,
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.xxl + 'px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedConvo ? (
            <>
              {/* Chat Header */}
              <div style={{
                padding: `${SPACING.lg}px ${SPACING.xl}px`,
                borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md + 'px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: selectedConvo.linkedCustomerId ? COLORS.success : COLORS.red,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: FONT.sizeBase,
                    fontWeight: 600
                  }}>
                    {getInitials(selectedConvo.linkedCustomerName || selectedConvo.name, selectedConvo.phone)}
                  </div>
                  <div>
                    <div style={{ color: COLORS.textPrimary, fontSize: FONT.sizeLg, fontWeight: 600 }}>
                      {getConvoDisplayName(selectedConvo)}
                    </div>
                    <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeMd }}>
                      {formatPhone(selectedConvo.phone)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedConvo.unreadCount === 0 && (
                    <button
                      onClick={markAsUnread}
                      style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.textMuted,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: FONT.sizeMd
                      }}
                    >
                      <MailIcon /> Unread
                    </button>
                  )}
                  <button
                    onClick={callCustomer}
                    style={{
                      padding: '8px 12px',
                      background: 'transparent',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md + 'px',
                      color: COLORS.textMuted,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: FONT.sizeMd
                    }}
                  >
                    <PhoneIcon /> Call
                  </button>
                  {!selectedConvo.linkedCustomerId ? (
                    <button
                      onClick={openContactModal}
                      style={{
                        padding: '8px 12px',
                        background: COLORS.success,
                        border: 'none',
                        borderRadius: RADIUS.md + 'px',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: FONT.sizeMd,
                        fontWeight: 500
                      }}
                    >
                      <UserPlusIcon /> Add Contact
                    </button>
                  ) : (
                    <button
                      onClick={() => window.open(`/customers?id=${selectedConvo.linkedCustomerId}`, '_blank')}
                      style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: `1px solid ${COLORS.success}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.success,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: FONT.sizeMd
                      }}
                    >
                      <CheckIcon /> Linked
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: SPACING.xl + 'px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {getMessagesWithDividers(selectedConvo.messages).map((item, index) => {
                  if (item.type === 'divider') {
                    return (
                      <div key={`divider-${index}`} style={{
                        textAlign: 'center',
                        margin: `${SPACING.lg}px 0`
                      }}>
                        <span style={{
                          background: COLORS.inputBg,
                          padding: '6px 14px',
                          borderRadius: '999px',
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted
                        }}>
                          {formatDateDivider(item.date!)}
                        </span>
                      </div>
                    )
                  }

                  const msg = item.message!
                  const isOutbound = msg.direction === 'outbound'

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isOutbound ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{
                        maxWidth: '70%',
                        padding: '12px 16px',
                        borderRadius: '16px',
                        borderBottomRightRadius: isOutbound ? '4px' : '16px',
                        borderBottomLeftRadius: isOutbound ? '16px' : '4px',
                        background: isOutbound ? COLORS.red : COLORS.inputBg,
                        color: isOutbound ? 'white' : COLORS.textPrimary
                      }}>
                        {msg.media_url && (
                          <div style={{ marginBottom: msg.body ? '8px' : 0 }}>
                            {msg.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || msg.media_url.includes('/Media/') || msg.media_url.includes('twilio.com') ? (
                              <img
                                src={msg.media_url}
                                alt="Attachment"
                                onClick={() => setLightboxUrl(msg.media_url!)}
                                style={{
                                  maxWidth: '200px',
                                  maxHeight: '200px',
                                  borderRadius: RADIUS.md + 'px',
                                  display: 'block',
                                  cursor: 'pointer'
                                }}
                              />
                            ) : (
                              <a
                                href={msg.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 12px',
                                  background: 'rgba(0,0,0,0.2)',
                                  borderRadius: RADIUS.md + 'px',
                                  color: 'inherit',
                                  textDecoration: 'none'
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                                </svg>
                                <span style={{ fontSize: FONT.sizeMd }}>View Attachment</span>
                              </a>
                            )}
                          </div>
                        )}
                        {msg.body && (
                          <p style={{ fontSize: FONT.sizeBase, lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>
                            {msg.body}
                          </p>
                        )}
                        <p style={{
                          fontSize: FONT.sizeXs,
                          opacity: 0.7,
                          textAlign: 'right',
                          margin: '6px 0 0 0'
                        }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div style={{
                padding: `${SPACING.lg}px ${SPACING.xl}px`,
                borderTop: `1px solid ${COLORS.border}`
              }}>
                {/* Attachment Preview */}
                {attachment && (
                  <div style={{
                    marginBottom: SPACING.md + 'px',
                    padding: SPACING.md + 'px',
                    background: COLORS.inputBg,
                    borderRadius: RADIUS.md + 'px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md + 'px' }}>
                      {attachment.file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(attachment.file)}
                          alt="Preview"
                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          background: COLORS.red,
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 600
                        }}>
                          {attachment.file.name.split('.').pop()?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p style={{ color: COLORS.textPrimary, fontSize: FONT.sizeMd, margin: 0 }}>{attachment.file.name}</p>
                        <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, margin: '2px 0 0 0' }}>
                          {attachment.uploading ? 'Uploading...' : `${(attachment.file.size / 1024).toFixed(1)} KB`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAttachment(null)}
                      style={{ background: 'transparent', border: 'none', color: COLORS.danger, cursor: 'pointer', fontSize: '18px' }}
                    >x</button>
                  </div>
                )}
                {/* Templates */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: SPACING.md + 'px' }}>
                  {MESSAGE_TEMPLATES.map(template => (
                    <button
                      key={template.id}
                      onClick={() => setNewMessage(template.text)}
                      style={{
                        padding: '4px 10px',
                        background: COLORS.inputBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.sm + 'px',
                        color: COLORS.textMuted,
                        fontSize: FONT.sizeXs,
                        cursor: 'pointer'
                      }}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: SPACING.md + 'px', alignItems: 'flex-end' }}>
                  {/* Attachment Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return

                      if (file.size > 5 * 1024 * 1024) {
                        alert('File too large. Maximum size is 5MB.')
                        return
                      }

                      setAttachment({ file, url: '', uploading: true })

                      try {
                        const formData = new FormData()
                        formData.append('file', file)

                        const response = await fetch('/api/upload', {
                          method: 'POST',
                          body: formData
                        })

                        const result = await response.json()

                        if (result.success) {
                          setAttachment({ file, url: result.url, uploading: false })
                        } else {
                          alert('Upload failed')
                          setAttachment(null)
                        }
                      } catch {
                        alert('Upload failed')
                        setAttachment(null)
                      }

                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!attachment?.uploading}
                    style={{
                      padding: SPACING.md + 'px',
                      background: COLORS.inputBg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '50%',
                      color: COLORS.textMuted,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Attach file"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Type a message..."
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      const maxH = 120
                      if (el.scrollHeight > maxH) {
                        el.style.height = maxH + 'px'
                        el.style.overflowY = 'auto'
                      } else {
                        el.style.height = el.scrollHeight + 'px'
                        el.style.overflowY = 'hidden'
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: COLORS.inputBg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '24px',
                      color: COLORS.textPrimary,
                      fontSize: FONT.sizeBase,
                      resize: 'none',
                      lineHeight: '1.4',
                      overflowY: 'hidden',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || (!newMessage.trim() && !attachment?.url)}
                    style={{
                      padding: '12px 20px',
                      background: sending || (!newMessage.trim() && !attachment?.url) ? COLORS.textMuted : COLORS.red,
                      border: 'none',
                      borderRadius: '24px',
                      color: 'white',
                      fontSize: FONT.sizeBase,
                      fontWeight: 600,
                      cursor: sending || (!newMessage.trim() && !attachment?.url) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <SendIcon />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.textMuted
            }}>
              <MessageIcon />
              <p style={{ marginTop: SPACING.lg + 'px', fontSize: FONT.sizeLg }}>Select a conversation</p>
              <p style={{ fontSize: FONT.sizeMd, opacity: 0.7 }}>Choose from the list to view messages</p>
            </div>
          )}
        </div>
      </div>
      ) : (
      /* Calls View */
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.xxl + 'px',
        height: 'calc(100% - 52px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: `${SPACING.lg}px ${SPACING.xl}px`,
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ color: COLORS.textPrimary, fontSize: FONT.sizeXl, fontWeight: 600, margin: 0 }}>Call History</h2>
          <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeMd }}>{calls.filter(c => !c.archived).length} calls</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {calls.filter(c => !c.archived).length > 0 ? calls.filter(c => !c.archived).map((call) => (
            <div
              key={call.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `14px ${SPACING.xl}px`,
                borderBottom: `1px solid ${COLORS.border}`,
                cursor: 'pointer',
                background: (!call.read && (call.status === 'missed' || call.status === 'voicemail')) ? COLORS.dangerBg : 'transparent'
              }}
              onClick={() => {
                setSelectedCall(call)
                setCallModalMessage('')
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: call.status === 'completed' ? COLORS.success :
                              call.status === 'voicemail' ? COLORS.warning : COLORS.danger,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {call.status === 'voicemail' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="5.5" cy="11.5" r="4.5"/>
                      <circle cx="18.5" cy="11.5" r="4.5"/>
                      <line x1="5.5" y1="16" x2="18.5" y2="16"/>
                    </svg>
                  ) : call.status === 'completed' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ color: COLORS.textPrimary, fontSize: '15px', fontWeight: 500 }}>
                    {call.caller_name || formatPhone(call.caller_phone)}
                  </div>
                  <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeMd, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      color: call.status === 'completed' ? COLORS.success :
                             call.status === 'voicemail' ? COLORS.warning : COLORS.danger,
                      fontWeight: 500
                    }}>
                      {call.status === 'completed' ? 'Answered' :
                       call.status === 'voicemail' ? 'Voicemail' :
                       call.status === 'missed' ? 'Missed' : call.status}
                    </span>
                    {call.answered_by && <span>-- {call.answered_by}</span>}
                    {call.duration > 0 && <span>-- {Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}</span>}
                  </div>
                  {call.category && CALL_CATEGORY_LABELS[call.category] && (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: FONT.sizeXs,
                      fontWeight: 600,
                      marginTop: '4px',
                      background: `${CALL_CATEGORY_LABELS[call.category].color}20`,
                      color: CALL_CATEGORY_LABELS[call.category].color,
                      border: `1px solid ${CALL_CATEGORY_LABELS[call.category].color}30`
                    }}>
                      {CALL_CATEGORY_LABELS[call.category].label}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md + 'px' }}>
                {call.voicemail_url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(call.voicemail_url!, '_blank')
                    }}
                    style={{
                      padding: '8px 12px',
                      background: COLORS.warning,
                      border: 'none',
                      borderRadius: RADIUS.md + 'px',
                      color: 'white',
                      fontSize: FONT.sizeSm,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Play
                  </button>
                )}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: COLORS.textSecondary, fontSize: FONT.sizeMd }}>
                    {new Date(call.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                    {new Date(call.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted }}>
              <PhoneIcon />
              <p style={{ marginTop: SPACING.md + 'px' }}>No calls yet</p>
              <p style={{ fontSize: FONT.sizeMd, opacity: 0.7 }}>Incoming calls will appear here</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Call Detail Modal */}
      {selectedCall && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: COLORS.inputBg,
            borderRadius: RADIUS.xxl + 'px',
            width: '100%',
            maxWidth: '500px',
            margin: SPACING.lg + 'px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: SPACING.xl + 'px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: selectedCall.status === 'completed' ? COLORS.success :
                              selectedCall.status === 'voicemail' ? COLORS.warning : COLORS.danger,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PhoneIcon />
                </div>
                <div>
                  <h3 style={{ color: COLORS.textPrimary, fontSize: FONT.sizeXl, margin: 0 }}>
                    {selectedCall.caller_name || formatPhone(selectedCall.caller_phone)}
                  </h3>
                  <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeMd, margin: '4px 0 0 0' }}>
                    {formatPhone(selectedCall.caller_phone)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '24px' }}
              >x</button>
            </div>

            {/* Call Details */}
            <div style={{ padding: SPACING.xl + 'px', borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.lg + 'px' }}>
                <div>
                  <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: '0 0 4px 0' }}>Status</p>
                  <p style={{
                    color: selectedCall.status === 'completed' ? COLORS.success :
                           selectedCall.status === 'voicemail' ? COLORS.warning : COLORS.danger,
                    fontSize: FONT.sizeBase,
                    fontWeight: 600,
                    margin: 0
                  }}>
                    {selectedCall.status === 'completed' ? 'Answered' :
                     selectedCall.status === 'voicemail' ? 'Voicemail' :
                     selectedCall.status === 'missed' ? 'Missed' : selectedCall.status}
                  </p>
                </div>
                <div>
                  <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: '0 0 4px 0' }}>Duration</p>
                  <p style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, margin: 0 }}>
                    {selectedCall.duration > 0
                      ? `${Math.floor(selectedCall.duration / 60)}:${String(selectedCall.duration % 60).padStart(2, '0')}`
                      : '--'}
                  </p>
                </div>
                <div>
                  <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: '0 0 4px 0' }}>Date & Time</p>
                  <p style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, margin: 0 }}>
                    {new Date(selectedCall.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(selectedCall.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {selectedCall.answered_by && (
                  <div>
                    <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: '0 0 4px 0' }}>Answered By</p>
                    <p style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, margin: 0 }}>{selectedCall.answered_by}</p>
                  </div>
                )}
                {selectedCall.category && CALL_CATEGORY_LABELS[selectedCall.category] && (
                  <div>
                    <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: '0 0 4px 0' }}>Category</p>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: RADIUS.sm + 'px',
                      fontSize: FONT.sizeMd,
                      fontWeight: 600,
                      background: `${CALL_CATEGORY_LABELS[selectedCall.category].color}20`,
                      color: CALL_CATEGORY_LABELS[selectedCall.category].color,
                      border: `1px solid ${CALL_CATEGORY_LABELS[selectedCall.category].color}30`
                    }}>
                      {CALL_CATEGORY_LABELS[selectedCall.category].label}
                    </span>
                  </div>
                )}
              </div>

              {/* Voicemail Player */}
              {selectedCall.voicemail_url && (
                <div style={{ marginTop: SPACING.lg + 'px', padding: SPACING.md + 'px', background: COLORS.cardBg, borderRadius: RADIUS.md + 'px' }}>
                  <p style={{ color: COLORS.warning, fontSize: FONT.sizeMd, fontWeight: 600, margin: `0 0 ${SPACING.sm}px 0` }}>Voicemail</p>
                  <audio controls style={{ width: '100%', height: '36px' }}>
                    <source src={selectedCall.voicemail_url} type="audio/mpeg" />
                  </audio>
                </div>
              )}
            </div>

            {/* Send Message Section */}
            <div style={{ padding: SPACING.xl + 'px', flex: 1, overflowY: 'auto' }}>
              <p style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, fontWeight: 600, margin: `0 0 ${SPACING.md}px 0` }}>Send a Message</p>

              {/* Templates */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: SPACING.md + 'px' }}>
                {MESSAGE_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setCallModalMessage(template.text)}
                    style={{
                      padding: '6px 12px',
                      background: COLORS.cardBg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.sm + 'px',
                      color: COLORS.textMuted,
                      fontSize: FONT.sizeSm,
                      cursor: 'pointer'
                    }}
                  >
                    {template.label}
                  </button>
                ))}
              </div>

              <textarea
                value={callModalMessage}
                onChange={(e) => setCallModalMessage(e.target.value)}
                placeholder="Type a message..."
                style={{
                  width: '100%',
                  height: '100px',
                  padding: SPACING.md + 'px',
                  background: COLORS.pageBg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md + 'px',
                  color: COLORS.textPrimary,
                  fontSize: FONT.sizeBase,
                  resize: 'none'
                }}
              />
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: `${SPACING.lg}px ${SPACING.xl}px`,
              borderTop: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={callingFromModal}
                  onClick={async () => {
                    setCallingFromModal(true)
                    try {
                      const response = await fetch('/api/voice/call', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          to: selectedCall.caller_phone,
                          customerName: selectedCall.caller_name || formatPhone(selectedCall.caller_phone)
                        })
                      })
                      if (response.ok) {
                        await supabase.from('calls').update({ read: true }).eq('id', selectedCall.id)
                        setCalls(calls.map(c => c.id === selectedCall.id ? { ...c, read: true } : c))
                        alert('Call initiated! Your phone will ring shortly.')
                      } else {
                        const data = await response.json()
                        alert(data.error || 'Failed to initiate call')
                      }
                    } catch {
                      alert('Failed to initiate call')
                    }
                    setCallingFromModal(false)
                  }}
                  style={{
                    padding: '8px 16px',
                    background: COLORS.success,
                    border: 'none',
                    borderRadius: RADIUS.md + 'px',
                    color: 'white',
                    fontSize: FONT.sizeMd,
                    fontWeight: 600,
                    cursor: callingFromModal ? 'not-allowed' : 'pointer',
                    opacity: callingFromModal ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <PhoneIcon />
                  {callingFromModal ? 'Calling...' : 'Call Back'}
                </button>
                {(selectedCall.status === 'missed' || selectedCall.status === 'voicemail') && !selectedCall.read && (
                  <button
                    onClick={async () => {
                      const { error } = await supabase.from('calls').update({ read: true }).eq('id', selectedCall.id)
                      if (error) {
                        console.error('Failed to mark call as read:', error)
                        return
                      }
                      setCalls(calls.map(c => c.id === selectedCall.id ? { ...c, read: true } : c))
                      setSelectedCall({ ...selectedCall, read: true })
                    }}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md + 'px',
                      color: COLORS.textMuted,
                      fontSize: FONT.sizeMd,
                      cursor: 'pointer'
                    }}
                  >
                    Mark as Read
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (confirm('Archive this call?')) {
                      await supabase.from('calls').update({ archived: true }).eq('id', selectedCall.id)
                      setCalls(calls.map(c => c.id === selectedCall.id ? { ...c, archived: true } : c))
                      setSelectedCall(null)
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: `1px solid ${COLORS.danger}30`,
                    borderRadius: RADIUS.md + 'px',
                    color: COLORS.danger,
                    fontSize: FONT.sizeMd,
                    cursor: 'pointer'
                  }}
                >
                  Archive
                </button>
              </div>
              <button
                disabled={!callModalMessage.trim() || sendingFromModal}
                onClick={async () => {
                  if (!callModalMessage.trim()) return
                  setSendingFromModal(true)

                  try {
                    const response = await fetch('/api/sms', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: selectedCall.caller_phone,
                        message: callModalMessage
                      })
                    })

                    if (response.ok) {
                      const phone = normalizePhone(selectedCall.caller_phone)
                      // Mark call as read
                      await supabase.from('calls').update({ read: true }).eq('id', selectedCall.id)
                      setCalls(calls.map(c => c.id === selectedCall.id ? { ...c, read: true } : c))

                      // Update or create conversation
                      const existingConvoIndex = conversations.findIndex(c => {
                        return c.phone === phone || normalizePhone(c.phone) === phone
                      })

                      const newMsg: Message = {
                        id: Date.now().toString(),
                        shop_id: 1,
                        direction: 'outbound',
                        from_phone: '',
                        to_phone: selectedCall.caller_phone,
                        body: callModalMessage,
                        status: 'sent',
                        read: true,
                        customer_name: selectedCall.caller_name,
                        twilio_sid: null,
                        created_at: new Date().toISOString()
                      }

                      if (existingConvoIndex >= 0) {
                        const updatedConvos = [...conversations]
                        updatedConvos[existingConvoIndex] = {
                          ...updatedConvos[existingConvoIndex],
                          messages: [...updatedConvos[existingConvoIndex].messages, newMsg],
                          lastMessage: callModalMessage,
                          lastTime: new Date().toISOString()
                        }
                        setConversations(updatedConvos)
                        setSelectedPhone(updatedConvos[existingConvoIndex].phone)
                      } else {
                        const newConvo: Conversation = {
                          phone,
                          name: selectedCall.caller_name,
                          lastMessage: callModalMessage,
                          lastTime: new Date().toISOString(),
                          unreadCount: 0,
                          messages: [newMsg]
                        }
                        setConversations([newConvo, ...conversations])
                        setSelectedPhone(phone)
                      }

                      setSelectedCall(null)
                      setCallModalMessage('')
                      setActiveView('messages')
                    } else {
                      alert('Failed to send message')
                    }
                  } catch {
                    alert('Failed to send message')
                  }

                  setSendingFromModal(false)
                }}
                style={{
                  padding: '10px 24px',
                  background: callModalMessage.trim() ? COLORS.red : COLORS.textMuted,
                  border: 'none',
                  borderRadius: RADIUS.md + 'px',
                  color: 'white',
                  fontSize: FONT.sizeBase,
                  fontWeight: 600,
                  cursor: callModalMessage.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <SendIcon />
                {sendingFromModal ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Link Contact Modal */}
      {showContactModal && selectedConvo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: COLORS.inputBg,
            borderRadius: RADIUS.xxl + 'px',
            width: '100%',
            maxWidth: '500px',
            margin: SPACING.lg + 'px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: SPACING.xl + 'px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ color: COLORS.textPrimary, fontSize: FONT.sizeXl, fontWeight: 600, margin: 0 }}>
                Add Contact
              </h2>
              <button
                onClick={() => setShowContactModal(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '24px', lineHeight: 1 }}
              >
                x
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: SPACING.xl + 'px', overflowY: 'auto' }}>
              {/* Phone Display */}
              <div style={{
                background: COLORS.pageBg,
                padding: `${SPACING.md}px ${SPACING.lg}px`,
                borderRadius: RADIUS.md + 'px',
                marginBottom: SPACING.xl + 'px',
                display: 'flex',
                alignItems: 'center',
                gap: SPACING.md + 'px'
              }}>
                <PhoneIcon />
                <span style={{ color: COLORS.textPrimary, fontSize: FONT.sizeLg, fontWeight: 500 }}>
                  {formatPhone(selectedConvo.phone)}
                </span>
              </div>

              {/* Mode Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: SPACING.xl + 'px' }}>
                <button
                  onClick={() => setContactModalMode('new')}
                  style={{
                    flex: 1,
                    padding: SPACING.md + 'px',
                    background: contactModalMode === 'new' ? COLORS.red : 'transparent',
                    border: `1px solid ${contactModalMode === 'new' ? COLORS.red : COLORS.border}`,
                    borderRadius: RADIUS.md + 'px',
                    color: contactModalMode === 'new' ? 'white' : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: FONT.sizeBase,
                    fontWeight: 500
                  }}
                >
                  Create New Customer
                </button>
                <button
                  onClick={() => setContactModalMode('link')}
                  style={{
                    flex: 1,
                    padding: SPACING.md + 'px',
                    background: contactModalMode === 'link' ? COLORS.red : 'transparent',
                    border: `1px solid ${contactModalMode === 'link' ? COLORS.red : COLORS.border}`,
                    borderRadius: RADIUS.md + 'px',
                    color: contactModalMode === 'link' ? 'white' : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: FONT.sizeBase,
                    fontWeight: 500
                  }}
                >
                  Link to Existing
                </button>
              </div>

              {contactModalMode === 'new' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg + 'px' }}>
                  <div>
                    <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '6px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="e.g. John Smith"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: COLORS.pageBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.textPrimary,
                        fontSize: FONT.sizeBase
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '6px' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="e.g. john@company.com"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: COLORS.pageBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.textPrimary,
                        fontSize: FONT.sizeBase
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '6px' }}>
                      Company
                    </label>
                    <input
                      type="text"
                      value={contactForm.company}
                      onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                      placeholder="e.g. ABC Auto Detailing"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: COLORS.pageBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.textPrimary,
                        fontSize: FONT.sizeBase
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg + 'px' }}>
                  <div>
                    <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '6px' }}>
                      Search Customers
                    </label>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        searchCustomers(e.target.value)
                      }}
                      placeholder="Search by name, email, company..."
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: COLORS.pageBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.md + 'px',
                        color: COLORS.textPrimary,
                        fontSize: FONT.sizeBase
                      }}
                    />
                  </div>

                  {customerResults.length > 0 && (
                    <div style={{
                      background: COLORS.pageBg,
                      borderRadius: RADIUS.md + 'px',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {customerResults.map(customer => (
                        <div
                          key={customer.id}
                          onClick={() => setSelectedCustomer(customer)}
                          style={{
                            padding: '12px 14px',
                            borderBottom: `1px solid ${COLORS.border}`,
                            cursor: 'pointer',
                            background: selectedCustomer?.id === customer.id ? COLORS.activeBg : 'transparent'
                          }}
                        >
                          <div style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, fontWeight: 500 }}>
                            {customer.display_name}
                          </div>
                          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, marginTop: '2px' }}>
                            {[customer.company, customer.email, customer.phone].filter(Boolean).join(' -- ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: `${SPACING.lg}px ${SPACING.xl}px`,
              borderTop: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: SPACING.md + 'px'
            }}>
              <button
                onClick={() => setShowContactModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md + 'px',
                  color: COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: FONT.sizeBase
                }}
              >
                Cancel
              </button>
              <button
                onClick={contactModalMode === 'new' ? createAndLinkCustomer : linkToCustomer}
                disabled={saving || (contactModalMode === 'new' ? !contactForm.name.trim() : !selectedCustomer)}
                style={{
                  padding: '10px 20px',
                  background: saving || (contactModalMode === 'new' ? !contactForm.name.trim() : !selectedCustomer) ? COLORS.textMuted : COLORS.red,
                  border: 'none',
                  borderRadius: RADIUS.md + 'px',
                  color: 'white',
                  cursor: saving || (contactModalMode === 'new' ? !contactForm.name.trim() : !selectedCustomer) ? 'not-allowed' : 'pointer',
                  fontSize: FONT.sizeBase,
                  fontWeight: 500
                }}
              >
                {saving ? 'Saving...' : contactModalMode === 'new' ? 'Create Customer' : 'Link to Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: COLORS.inputBg,
            borderRadius: RADIUS.xxl + 'px',
            width: '100%',
            maxWidth: '450px',
            margin: SPACING.lg + 'px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: SPACING.xl + 'px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ color: COLORS.textPrimary, fontSize: FONT.sizeXl, fontWeight: 600, margin: 0 }}>
                New Message
              </h2>
              <button
                onClick={() => setShowNewMessageModal(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '24px', lineHeight: 1 }}
              >
                x
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: SPACING.xl + 'px', overflowY: 'auto' }}>
              <div style={{ marginBottom: SPACING.xl + 'px' }}>
                <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '8px' }}>
                  Enter Phone Number
                </label>
                <input
                  type="tel"
                  value={newMessagePhone}
                  onChange={(e) => setNewMessagePhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: COLORS.pageBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.lg + 'px',
                    color: COLORS.textPrimary,
                    fontSize: FONT.sizeLg
                  }}
                />
              </div>

              <div style={{
                textAlign: 'center',
                color: COLORS.textMuted,
                fontSize: FONT.sizeMd,
                margin: `${SPACING.xl}px 0`,
                display: 'flex',
                alignItems: 'center',
                gap: SPACING.md + 'px'
              }}>
                <div style={{ flex: 1, height: '1px', background: COLORS.border }} />
                OR
                <div style={{ flex: 1, height: '1px', background: COLORS.border }} />
              </div>

              {/* Search Customers */}
              <div>
                <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeMd, marginBottom: '8px' }}>
                  Search Customers
                </label>
                <input
                  type="text"
                  value={newMessageCustomerSearch}
                  onChange={async (e) => {
                    setNewMessageCustomerSearch(e.target.value)
                    if (e.target.value.trim()) {
                      const { data: customers } = await supabase
                        .from('customers')
                        .select('phone, display_name')
                        .ilike('display_name', `%${e.target.value}%`)
                        .not('phone', 'is', null)
                        .limit(10)

                      const results: Array<{ phone: string, name: string }> = []
                      customers?.forEach((c: any) => {
                        if (c.phone) {
                          results.push({ phone: c.phone, name: c.display_name })
                        }
                      })

                      setNewMessageCustomerResults(results)
                    } else {
                      setNewMessageCustomerResults([])
                    }
                  }}
                  placeholder="Search by name..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: COLORS.pageBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.lg + 'px',
                    color: COLORS.textPrimary,
                    fontSize: FONT.sizeBase
                  }}
                />

                {newMessageCustomerResults.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    background: COLORS.pageBg,
                    borderRadius: RADIUS.lg + 'px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {newMessageCustomerResults.map((result, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setNewMessagePhone(result.phone)
                          setNewMessageCustomerName(result.name)
                          setNewMessageCustomerSearch('')
                          setNewMessageCustomerResults([])
                        }}
                        style={{
                          padding: '12px 14px',
                          borderBottom: `1px solid ${COLORS.border}`,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ color: COLORS.textPrimary, fontSize: FONT.sizeBase, fontWeight: 500 }}>
                          {result.name}
                        </div>
                        <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                          {formatPhone(result.phone)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: `${SPACING.lg}px ${SPACING.xl}px`,
              borderTop: `1px solid ${COLORS.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: SPACING.md + 'px'
            }}>
              <button
                onClick={() => setShowNewMessageModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md + 'px',
                  color: COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: FONT.sizeBase
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cleanPhone = newMessagePhone.replace(/\D/g, '')
                  if (cleanPhone.length < 10) {
                    alert('Please enter a valid phone number')
                    return
                  }

                  const normalized = normalizePhone(cleanPhone)

                  const existingConvo = conversations.find(c => c.phone === normalized)

                  if (existingConvo) {
                    setSelectedPhone(existingConvo.phone)
                  } else {
                    const link = phoneLinks[normalized]
                    const newConvo: Conversation = {
                      phone: normalized,
                      name: newMessageCustomerName || null,
                      lastMessage: '',
                      lastTime: new Date().toISOString(),
                      unreadCount: 0,
                      messages: [],
                      linkedCustomerId: link?.customerId,
                      linkedCustomerName: link?.customerName || newMessageCustomerName || undefined
                    }
                    setConversations([newConvo, ...conversations])
                    setSelectedPhone(normalized)
                  }

                  setShowNewMessageModal(false)
                }}
                disabled={!newMessagePhone.trim()}
                style={{
                  padding: '10px 20px',
                  background: !newMessagePhone.trim() ? COLORS.textMuted : COLORS.red,
                  border: 'none',
                  borderRadius: RADIUS.md + 'px',
                  color: 'white',
                  cursor: !newMessagePhone.trim() ? 'not-allowed' : 'pointer',
                  fontSize: FONT.sizeBase,
                  fontWeight: 500
                }}
              >
                Start Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: `${SPACING.lg}px ${SPACING.xl}px`,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)'
          }}>
            <div style={{ color: 'white', fontSize: FONT.sizeBase }}>Image Preview</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setLightboxZoom(z => Math.min(z * 1.5, 5))}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Zoom In"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button
                onClick={() => {
                  setLightboxZoom(z => {
                    const newZoom = Math.max(z / 1.5, 1)
                    if (newZoom === 1) setLightboxPan({ x: 0, y: 0 })
                    return newZoom
                  })
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Zoom Out"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button
                onClick={() => {
                  setLightboxZoom(1)
                  setLightboxPan({ x: 0, y: 0 })
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Reset"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </button>
              <button
                onClick={() => {
                  setLightboxUrl(null)
                  setLightboxZoom(1)
                  setLightboxPan({ x: 0, y: 0 })
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Image Container */}
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setLightboxUrl(null)
                setLightboxZoom(1)
                setLightboxPan({ x: 0, y: 0 })
              }
            }}
            onDoubleClick={() => {
              if (lightboxZoom > 1) {
                setLightboxZoom(1)
                setLightboxPan({ x: 0, y: 0 })
              } else {
                setLightboxZoom(2.5)
              }
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: lightboxZoom > 1 ? 'grab' : 'zoom-in'
            }}
          >
            <img
              src={lightboxUrl}
              alt="Full size"
              draggable={false}
              style={{
                maxWidth: lightboxZoom === 1 ? '90vw' : 'none',
                maxHeight: lightboxZoom === 1 ? '80vh' : 'none',
                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                transition: 'transform 0.1s ease-out',
                borderRadius: '4px'
              }}
            />
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: `${SPACING.lg}px ${SPACING.xl}px`,
            background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
            gap: SPACING.xl + 'px'
          }}>
            <a
              href={lightboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: COLORS.red,
                textDecoration: 'none',
                fontSize: FONT.sizeBase
              }}>
              Open in New Tab
            </a>
            <a
              href={lightboxUrl}
              download
              style={{
                color: COLORS.red,
                textDecoration: 'none',
                fontSize: FONT.sizeBase
              }}>
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
