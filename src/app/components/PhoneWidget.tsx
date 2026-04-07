'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

type WidgetState = 'initializing' | 'ready' | 'incoming' | 'calling' | 'active' | 'error'
type TransferState = null | 'selecting' | 'initiating' | 'connecting' | 'briefing' | 'completing'

interface ActiveDbCall {
  call_sid: string
  caller_phone: string
  receiver_phone: string
  answered_by: string | null
  agent_call_sid: string | null
  category: string | null
  transfer_status: string | null
  transfer_target_phone: string | null
  transfer_target_name: string | null
  customer_name: string | null
  created_at: string
}

interface RecentCall {
  id: string
  call_sid: string
  direction: string
  caller_phone: string
  receiver_phone: string
  answered_by: string | null
  status: string
  duration: number
  category: string | null
  customer_name: string | null
  phone: string
  created_at: string
}

interface TeamMember {
  name: string
  phone: string
  sip_uri: string | null
  enabled: boolean
}

const CALL_CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  'auto-tint': { label: 'Auto Tint', color: '#dc2626' },
  'flat-glass': { label: 'Residential', color: '#3b82f6' },
  'ppf': { label: 'PPF', color: '#8b5cf6' },
  'wraps-graphics': { label: 'Wraps', color: '#f59e0b' },
  'apparel': { label: 'Apparel', color: '#ec4899' },
  'general': { label: 'General', color: '#64748b' },
}

export default function PhoneWidget() {
  const [state, setState] = useState<WidgetState>('initializing')
  const [expanded, setExpanded] = useState(false)
  const [muted, setMuted] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [callerInfo, setCallerInfo] = useState<{ from: string; name?: string; categoryKey?: string; categoryLabel?: string }>({ from: '' })
  const [dialNumber, setDialNumber] = useState('')

  // Transfer state
  const [transferState, setTransferState] = useState<TransferState>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [transferNumber, setTransferNumber] = useState('')

  // Active calls from DB (for calls answered on other devices)
  const [activeDbCalls, setActiveDbCalls] = useState<ActiveDbCall[]>([])

  // Recent call history
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [recentLoaded, setRecentLoaded] = useState(false)

  const deviceRef = useRef<any>(null)
  const activeCallRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringtoneRef = useRef<{ stop: () => void } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  const lookupCaller = useCallback(async (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    if (!cleanPhone) return null
    const { data } = await supabase
      .from('customers')
      .select('first_name, last_name')
      .or(`phone.ilike.%${cleanPhone}%`)
      .eq('shop_id', 1)
      .limit(1)
    if (data && data.length > 0) {
      return `${data[0].first_name || ''} ${data[0].last_name || ''}`.trim() || null
    }
    return null
  }, [])

  // Simple ringtone using Web Audio API
  const startRingtone = useCallback(() => {
    try {
      const audioCtx = new AudioContext()
      let stopped = false

      const ring = () => {
        if (stopped) return
        const osc1 = audioCtx.createOscillator()
        const osc2 = audioCtx.createOscillator()
        const gain = audioCtx.createGain()

        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(audioCtx.destination)

        osc1.frequency.value = 440
        osc2.frequency.value = 480
        gain.gain.value = 0.15

        const now = audioCtx.currentTime
        osc1.start(now)
        osc2.start(now)
        osc1.stop(now + 1)
        osc2.stop(now + 1)

        gain.gain.setValueAtTime(0.15, now)
        gain.gain.setValueAtTime(0, now + 1)

        if (!stopped) setTimeout(ring, 3000)
      }

      ring()

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Incoming Call', {
          body: 'Your business line is ringing',
          tag: 'incoming-call',
          requireInteraction: true
        })
      }

      ringtoneRef.current = {
        stop: () => {
          stopped = true
          audioCtx.close()
        }
      }
    } catch (e) {
      console.error('Ringtone error:', e)
    }
  }, [])

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.stop()
    ringtoneRef.current = null
  }, [])

  const loadTwilioSDK = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).Twilio?.Device) {
        resolve((window as any).Twilio.Device)
        return
      }
      const existing = document.querySelector('script[src="/twilio-voice.min.js"]')
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).Twilio.Device))
        existing.addEventListener('error', reject)
        return
      }
      const script = document.createElement('script')
      script.src = '/twilio-voice.min.js'
      script.onload = () => resolve((window as any).Twilio.Device)
      script.onerror = reject
      document.head.appendChild(script)
    })
  }, [])

  // Fetch team members for transfer selection
  const loadTeamMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/voice/team-members')
      const { members } = await res.json()
      if (members) setTeamMembers(members)
    } catch { /* silent */ }
  }, [])

  // Fetch recent call history
  const loadRecentCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/voice/recent')
      const { calls } = await res.json()
      setRecentCalls(calls || [])
      setRecentLoaded(true)
    } catch (e) {
      console.error('Failed to load recent calls:', e)
    }
  }, [])

  // Poll for active calls from DB (for calls answered on other devices)
  const pollActiveCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/voice/active')
      const { calls } = await res.json()
      setActiveDbCalls(calls || [])

      // Sync transfer state from DB
      if (calls && calls.length > 0) {
        const activeCall = calls[0]
        if (activeCall.transfer_status) {
          setTransferState(activeCall.transfer_status as TransferState)
        } else if (transferState && transferState !== 'selecting') {
          setTransferState(null)
        }
      }
    } catch (e) {
      // Silent fail
    }
  }, [transferState])

  // Initialize Twilio Device
  useEffect(() => {
    let device: any
    let mounted = true

    async function init() {
      try {
        const Device = await loadTwilioSDK()

        const res = await fetch('/api/voice/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity: 'ops-dashboard' })
        })

        if (!res.ok) {
          console.error('Failed to get voice token')
          if (mounted) setState('error')
          return
        }

        const { token } = await res.json()

        device = new Device(token, {
          codecPreferences: ['opus', 'pcmu'],
          logLevel: 1
        })

        device.on('incoming', async (call: any) => {
          const from = call.parameters.From || ''
          const name = await lookupCaller(from)

          const categoryKey = call.customParameters?.get?.('categoryKey') || undefined
          const categoryLabel = call.customParameters?.get?.('categoryLabel') || undefined

          if (mounted) {
            setCallerInfo({ from, name: name || undefined, categoryKey, categoryLabel })
            setState('incoming')
            setExpanded(true)
            startRingtone()
          }

          activeCallRef.current = call

          call.on('cancel', () => {
            if (mounted) {
              stopRingtone()
              setState('ready')
              setExpanded(false)
              activeCallRef.current = null
            }
          })

          call.on('disconnect', () => {
            if (mounted) {
              stopRingtone()
              setState('ready')
              setExpanded(false)
              setCallDuration(0)
              setMuted(false)
              setTransferState(null)
              activeCallRef.current = null
              if (timerRef.current) clearInterval(timerRef.current)
            }
          })
        })

        device.on('tokenWillExpire', async () => {
          try {
            const res = await fetch('/api/voice/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identity: 'ops-dashboard' })
            })
            const { token: newToken } = await res.json()
            device.updateToken(newToken)
          } catch (e) {
            console.error('Token refresh failed:', e)
          }
        })

        device.on('error', (err: any) => {
          console.error('Twilio Device error:', err)
        })

        await device.register()
        deviceRef.current = device
        if (mounted) setState('ready')

        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission()
        }
      } catch (err) {
        console.error('Phone widget init error:', err)
        if (mounted) setState('error')
      }
    }

    init()
    loadTeamMembers()

    // Poll for active calls every 3 seconds
    pollActiveCalls()
    pollRef.current = setInterval(pollActiveCalls, 3000)

    return () => {
      mounted = false
      stopRingtone()
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      device?.destroy()
    }
  }, [lookupCaller, startRingtone, stopRingtone, loadTwilioSDK, loadTeamMembers, pollActiveCalls])

  // Load recent calls when expanded in ready state
  useEffect(() => {
    if (expanded && state === 'ready' && activeDbCalls.length === 0) {
      loadRecentCalls()
    }
  }, [expanded, state, activeDbCalls.length, loadRecentCalls])

  const answerCall = () => {
    if (activeCallRef.current) {
      stopRingtone()
      activeCallRef.current.accept()
      setState('active')
      setCallDuration(0)
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)
    }
  }

  const declineCall = () => {
    if (activeCallRef.current) {
      stopRingtone()
      activeCallRef.current.reject()
      activeCallRef.current = null
      setState('ready')
      setExpanded(false)
    }
  }

  const hangUp = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect()
      activeCallRef.current = null
      setState('ready')
      setExpanded(false)
      setCallDuration(0)
      setMuted(false)
      setTransferState(null)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const toggleMute = () => {
    if (activeCallRef.current) {
      const newMuted = !muted
      activeCallRef.current.mute(newMuted)
      setMuted(newMuted)
    }
  }

  const makeCall = async (number: string) => {
    if (!deviceRef.current || !number.trim()) return

    try {
      const formatted = number.startsWith('+') ? number : `+1${number.replace(/\D/g, '')}`
      const call = await deviceRef.current.connect({
        params: { To: formatted }
      })

      activeCallRef.current = call
      setCallerInfo({ from: formatted })
      setState('calling')
      setExpanded(true)
      setDialNumber('')
      setCallDuration(0)

      call.on('ringing', () => { console.log('Outbound call ringing') })

      call.on('accept', () => {
        setState('active')
        setCallDuration(0)
        timerRef.current = setInterval(() => {
          setCallDuration(d => d + 1)
        }, 1000)
      })

      call.on('disconnect', () => {
        setState('ready')
        setExpanded(false)
        setCallDuration(0)
        setMuted(false)
        setTransferState(null)
        activeCallRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
      })

      call.on('error', (err: any) => {
        console.error('Outbound call error:', err)
        setState('ready')
        setExpanded(false)
        activeCallRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
      })
    } catch (err) {
      console.error('Outbound call error:', err)
    }
  }

  // Transfer functions
  const initiateTransfer = async (callSid: string, targetPhone: string, targetName?: string) => {
    try {
      setTransferState('initiating')
      const res = await fetch('/api/voice/transfer/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid, targetPhone, targetName }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Transfer initiate failed:', data.error)
        setTransferState(null)
        return
      }
      // State will be updated via polling
    } catch (e) {
      console.error('Transfer initiate error:', e)
      setTransferState(null)
    }
  }

  const completeTransfer = async (callSid: string) => {
    try {
      setTransferState('completing')
      const res = await fetch('/api/voice/transfer/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Transfer complete failed:', data.error)
        return
      }
      setTransferState(null)
    } catch (e) {
      console.error('Transfer complete error:', e)
    }
  }

  const cancelTransfer = async (callSid: string) => {
    try {
      const res = await fetch('/api/voice/transfer/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Transfer cancel failed:', data.error)
        return
      }
      setTransferState(null)
    } catch (e) {
      console.error('Transfer cancel error:', e)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Get the active DB call (for transfer controls when call is on another device)
  const activeDbCall = activeDbCalls.length > 0 ? activeDbCalls[0] : null
  const hasDbCall = activeDbCall && state !== 'active' && state !== 'incoming' && state !== 'calling'

  const statusColor = state === 'ready' ? (hasDbCall ? '#3b82f6' : '#22c55e') :
                      state === 'incoming' ? '#f59e0b' :
                      state === 'calling' ? '#8b5cf6' :
                      state === 'active' ? '#3b82f6' :
                      state === 'error' ? '#ef4444' : '#64748b'

  // Transfer selection UI (shared between browser and DB call panels)
  const renderTransferUI = (callSid: string, answeredBy?: string | null) => {
    if (transferState === 'selecting') {
      return (
        <div style={{ padding: '16px 0 0', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Transfer to
          </p>
          {/* Team member buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            {teamMembers
              .filter(m => m.name !== answeredBy) // Don't show the person already on the call
              .map((member) => (
              <button
                key={member.phone}
                onClick={() => initiateTransfer(callSid, member.phone, member.name)}
                style={{
                  padding: '10px 14px',
                  background: '#282a30',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.15)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 700 }}>
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{member.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{formatPhone(member.phone)}</div>
                </div>
              </button>
            ))}
          </div>
          {/* Custom number */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="tel"
              value={transferNumber}
              onChange={(e) => setTransferNumber(e.target.value)}
              placeholder="Other number..."
              onKeyDown={(e) => { if (e.key === 'Enter' && transferNumber.trim()) initiateTransfer(callSid, transferNumber) }}
              style={{
                flex: 1, padding: '8px 12px', background: '#111111',
                border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px',
                color: '#f1f5f9', fontSize: '13px', outline: 'none'
              }}
            />
            <button
              onClick={() => transferNumber.trim() && initiateTransfer(callSid, transferNumber)}
              disabled={!transferNumber.trim()}
              style={{
                padding: '8px 12px', background: transferNumber.trim() ? '#3b82f6' : '#282a30',
                border: 'none', borderRadius: '6px',
                cursor: transferNumber.trim() ? 'pointer' : 'not-allowed',
                color: 'white', fontSize: '13px', fontWeight: 600,
              }}
            >
              Call
            </button>
          </div>
          <button
            onClick={() => setTransferState(null)}
            style={{
              width: '100%', padding: '8px', marginTop: '8px',
              background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.15)',
              borderRadius: '6px', color: '#64748b', fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )
    }

    if (transferState === 'initiating' || transferState === 'connecting') {
      const targetName = activeDbCall?.transfer_target_name || ''
      const targetPhone = activeDbCall?.transfer_target_phone || ''
      return (
        <div style={{ padding: '16px 0 0', borderTop: '1px solid rgba(148, 163, 184, 0.1)', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: '20px',
            background: 'rgba(139, 92, 246, 0.15)', marginBottom: '8px',
          }}>
            <span style={{ color: '#8b5cf6', fontSize: '12px', fontWeight: 600 }}>
              {transferState === 'initiating' ? 'Setting up transfer...' : `Calling ${targetName || formatPhone(targetPhone)}...`}
            </span>
          </div>
          <button
            onClick={() => cancelTransfer(callSid)}
            style={{
              width: '100%', padding: '8px', marginTop: '4px',
              background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px', color: '#ef4444', fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel Transfer
          </button>
        </div>
      )
    }

    if (transferState === 'briefing') {
      const targetName = activeDbCall?.transfer_target_name || ''
      const targetPhone = activeDbCall?.transfer_target_phone || ''
      return (
        <div style={{ padding: '16px 0 0', borderTop: '1px solid rgba(148, 163, 184, 0.1)', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: '20px',
            background: 'rgba(34, 197, 94, 0.15)', marginBottom: '8px',
          }}>
            <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
              Speaking with {targetName || formatPhone(targetPhone)}
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 12px' }}>
            Caller is on hold. Brief them, then complete or cancel.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => completeTransfer(callSid)}
              style={{
                flex: 1, padding: '10px', background: '#22c55e',
                border: 'none', borderRadius: '8px', color: 'white',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Complete Transfer
            </button>
            <button
              onClick={() => cancelTransfer(callSid)}
              style={{
                flex: 1, padding: '10px', background: 'transparent',
                border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px',
                color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '12px'
    }}>
      {/* Expanded panel */}
      {expanded && (
        <div style={{
          background: '#1d1d1d',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '16px',
          width: '320px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>
          {/* Incoming call */}
          {state === 'incoming' && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', animation: 'phoneRingPulse 1.5s ease-in-out infinite'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <p style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Incoming Call
              </p>
              <h3 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0' }}>
                {callerInfo.name || formatPhone(callerInfo.from)}
              </h3>
              {callerInfo.name && (
                <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 8px 0' }}>
                  {formatPhone(callerInfo.from)}
                </p>
              )}
              {callerInfo.categoryKey && CALL_CATEGORY_LABELS[callerInfo.categoryKey] ? (
                <span style={{
                  display: 'inline-block', padding: '3px 10px', borderRadius: '6px',
                  fontSize: '12px', fontWeight: 600, marginBottom: '16px',
                  background: `${CALL_CATEGORY_LABELS[callerInfo.categoryKey].color}20`,
                  color: CALL_CATEGORY_LABELS[callerInfo.categoryKey].color,
                  border: `1px solid ${CALL_CATEGORY_LABELS[callerInfo.categoryKey].color}30`
                }}>
                  {CALL_CATEGORY_LABELS[callerInfo.categoryKey].label}
                </span>
              ) : (
                !callerInfo.name && <div style={{ height: '16px' }} />
              )}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <button onClick={declineCall} style={{
                  width: '56px', height: '56px', borderRadius: '50%', background: '#ef4444',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <button onClick={answerCall} style={{
                  width: '56px', height: '56px', borderRadius: '50%', background: '#22c55e',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Calling (outbound ringing) */}
          {state === 'calling' && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.15)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', animation: 'phoneRingPulse 1.5s ease-in-out infinite'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <p style={{ color: '#8b5cf6', fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Calling...
              </p>
              <h3 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 24px 0' }}>
                {callerInfo.name || formatPhone(callerInfo.from)}
              </h3>
              <button onClick={hangUp} title="Cancel call" style={{
                width: '56px', height: '56px', borderRadius: '50%', background: '#ef4444',
                border: 'none', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
              </button>
            </div>
          )}

          {/* Active call (browser-based) */}
          {state === 'active' && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <p style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Connected
              </p>
              <h3 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0' }}>
                {callerInfo.name || formatPhone(callerInfo.from)}
              </h3>
              {callerInfo.categoryKey && CALL_CATEGORY_LABELS[callerInfo.categoryKey] && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 600, marginBottom: '4px',
                  background: `${CALL_CATEGORY_LABELS[callerInfo.categoryKey].color}20`,
                  color: CALL_CATEGORY_LABELS[callerInfo.categoryKey].color,
                  border: `1px solid ${CALL_CATEGORY_LABELS[callerInfo.categoryKey].color}30`
                }}>
                  {CALL_CATEGORY_LABELS[callerInfo.categoryKey].label}
                </span>
              )}
              <p style={{ color: '#94a3b8', fontSize: '24px', fontFamily: 'monospace', margin: '4px 0 16px 0' }}>
                {formatDuration(callDuration)}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: muted ? '#f59e0b' : '#282a30',
                  border: muted ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {muted ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .54-.06 1.07-.18 1.57" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                </button>
                {/* Transfer button */}
                {!transferState && (
                  <button
                    onClick={() => { loadTeamMembers(); setTransferState('selecting') }}
                    title="Transfer"
                    style={{
                      width: '48px', height: '48px', borderRadius: '50%',
                      background: '#282a30', border: '1px solid rgba(148, 163, 184, 0.2)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <polyline points="15 14 20 9 15 4" />
                      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                    </svg>
                  </button>
                )}
                <button onClick={hangUp} title="Hang up" style={{
                  width: '48px', height: '48px', borderRadius: '50%', background: '#ef4444',
                  border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                    <line x1="23" y1="1" x2="1" y2="23" />
                  </svg>
                </button>
              </div>
              {/* Transfer UI for browser-based calls */}
              {activeDbCall && renderTransferUI(activeDbCall.call_sid, activeDbCall.answered_by)}
            </div>
          )}

          {/* Active call on another device (phone/SIP) — show transfer controls */}
          {hasDbCall && activeDbCall && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <p style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Active Call
              </p>
              <h3 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, margin: '0 0 4px 0' }}>
                {activeDbCall.customer_name || formatPhone(activeDbCall.caller_phone || '')}
              </h3>
              {activeDbCall.customer_name && (
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 4px 0' }}>
                  {formatPhone(activeDbCall.caller_phone || '')}
                </p>
              )}
              {activeDbCall.category && CALL_CATEGORY_LABELS[activeDbCall.category] && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 600, marginBottom: '4px',
                  background: `${CALL_CATEGORY_LABELS[activeDbCall.category].color}20`,
                  color: CALL_CATEGORY_LABELS[activeDbCall.category].color,
                  border: `1px solid ${CALL_CATEGORY_LABELS[activeDbCall.category].color}30`
                }}>
                  {CALL_CATEGORY_LABELS[activeDbCall.category].label}
                </span>
              )}
              <p style={{ color: '#64748b', fontSize: '12px', margin: '4px 0 12px 0' }}>
                Answered by {activeDbCall.answered_by || 'team member'}
              </p>
              {/* Transfer button */}
              {!transferState && (
                <button
                  onClick={() => { loadTeamMembers(); setTransferState('selecting') }}
                  style={{
                    width: '100%', padding: '10px', background: '#282a30',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px',
                    color: '#f1f5f9', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <polyline points="15 14 20 9 15 4" />
                    <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                  </svg>
                  Warm Transfer
                </button>
              )}
              {renderTransferUI(activeDbCall.call_sid, activeDbCall.answered_by)}
            </div>
          )}

          {/* Ready state - quick dial + call history */}
          {state === 'ready' && !hasDbCall && (
            <div style={{ padding: '16px', maxHeight: '480px', overflowY: 'auto' }}>
              {/* Quick Dial */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="tel"
                  value={dialNumber}
                  onChange={(e) => setDialNumber(e.target.value)}
                  placeholder="Dial a number..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && dialNumber.trim()) makeCall(dialNumber) }}
                  style={{
                    flex: 1, padding: '10px 14px', background: '#111111',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px',
                    color: '#f1f5f9', fontSize: '14px', outline: 'none'
                  }}
                />
                <button
                  onClick={() => makeCall(dialNumber)}
                  disabled={!dialNumber.trim()}
                  style={{
                    padding: '10px 14px',
                    background: dialNumber.trim() ? '#22c55e' : '#282a30',
                    border: 'none', borderRadius: '8px',
                    cursor: dialNumber.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
              </div>

              {/* Transfer page link */}
              <a
                href="/transfer"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '10px', marginBottom: '14px',
                  background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px', color: '#3b82f6', fontSize: '13px', fontWeight: 600,
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <polyline points="15 14 20 9 15 4" />
                  <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                </svg>
                Open Transfer Page
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>

              {/* Recent Calls */}
              <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Recent Calls
              </p>
              {!recentLoaded ? (
                <p style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
              ) : recentCalls.length === 0 ? (
                <p style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No recent calls</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {recentCalls.map((call) => {
                    const isInbound = call.direction === 'inbound'
                    const displayName = call.customer_name || formatPhone(call.phone || '')
                    const callStatusColor = call.status === 'completed' ? '#22c55e' :
                                       call.status === 'missed' ? '#ef4444' :
                                       call.status === 'voicemail' ? '#f59e0b' :
                                       call.status === 'in-progress' ? '#3b82f6' : '#64748b'
                    const statusLabel = call.status === 'in-progress' ? 'Active' :
                                       call.status.charAt(0).toUpperCase() + call.status.slice(1)
                    const timeAgo = (() => {
                      const diff = Date.now() - new Date(call.created_at).getTime()
                      const mins = Math.floor(diff / 60000)
                      if (mins < 1) return 'Just now'
                      if (mins < 60) return `${mins}m ago`
                      const hrs = Math.floor(mins / 60)
                      if (hrs < 24) return `${hrs}h ago`
                      const days = Math.floor(hrs / 24)
                      return `${days}d ago`
                    })()

                    return (
                      <div
                        key={call.id}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          background: '#161618',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        {/* Direction icon */}
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: isInbound ? 'rgba(59, 130, 246, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {isInbound ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
                              <polyline points="16 17 21 12 16 7" />
                              <line x1="21" y1="12" x2="9" y2="12" />
                              <path d="M3 19V5" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5">
                              <polyline points="8 17 3 12 8 7" />
                              <line x1="3" y1="12" x2="15" y2="12" />
                              <path d="M21 19V5" />
                            </svg>
                          )}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '13px', fontWeight: 600, color: '#e2e8f0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          }}>
                            {displayName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ color: callStatusColor }}>{statusLabel}</span>
                            <span>·</span>
                            <span>{timeAgo}</span>
                            {call.answered_by && (
                              <>
                                <span>·</span>
                                <span>{call.answered_by}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={() => makeCall(call.phone)}
                            title="Call"
                            style={{
                              width: '30px', height: '30px', borderRadius: '6px',
                              background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          </button>
                          <a
                            href={`/messages?phone=${encodeURIComponent(call.phone)}`}
                            title="Message"
                            style={{
                              width: '30px', height: '30px', borderRadius: '6px',
                              background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              textDecoration: 'none',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0' }}>
                Phone system offline
              </p>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                Check Twilio configuration
              </p>
            </div>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => {
          if (state !== 'incoming') setExpanded(!expanded)
        }}
        style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: statusColor, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 20px ${statusColor}40`,
          animation: state === 'incoming' ? 'phoneRingPulse 1s ease-in-out infinite' : 'none',
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
          position: 'relative',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        {/* Badge for active DB calls */}
        {hasDbCall && !expanded && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#ef4444', color: 'white', fontSize: '11px',
            fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}>
            {activeDbCalls.length}
          </span>
        )}
      </button>

      <style>{`
        @keyframes phoneRingPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
