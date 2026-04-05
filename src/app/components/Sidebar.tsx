'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'

interface NavItem {
  href: string;
  label: string;
  labelAccent: string;
  icon: string;
}

interface NavSection {
  title: string;
  key?: string; // maps to shop_config toggle
  items: NavItem[];
}

const ALL_SECTIONS: NavSection[] = [
  {
    title: 'CORE',
    items: [
      { href: '/', label: 'Command', labelAccent: 'Center', icon: 'grid' },
      { href: '/appointments', label: 'Appointments', labelAccent: '', icon: 'calendar' },
      { href: '/consultations', label: 'Schedule', labelAccent: 'Consultation', icon: 'plus-circle' },
      { href: '/customers', label: 'Customer', labelAccent: 'Database', icon: 'users' },
      { href: '/quotes', label: 'Quote', labelAccent: 'Builder', icon: 'quote' },
      { href: '/invoicing', label: 'Invoices', labelAccent: '', icon: 'receipt' },
    ]
  },
  {
    title: 'AUTOMOTIVE',
    key: 'module_auto_booking',
    items: [
      { href: '/automotive/inquiries', label: 'Inquiries', labelAccent: '', icon: 'inbox' },
      { href: '/automotive/pipeline', label: 'Lead', labelAccent: 'Pipeline', icon: 'activity' },
      { href: '/automotive/gift-certificates', label: 'Gift', labelAccent: 'Certificates', icon: 'gift' },
      { href: '/automotive/roll-ids', label: 'Roll', labelAccent: 'IDs', icon: 'tag' },
    ]
  },
  {
    title: 'AUTOMOTIVE',
    key: 'module_inventory',
    items: [
      { href: '/automotive/inventory', label: 'Inventory', labelAccent: '', icon: 'layers' },
    ]
  },
  {
    title: 'AUTOMOTIVE',
    key: 'module_lock_boxes',
    items: [
      { href: '/automotive/lock-boxes', label: 'Lock', labelAccent: 'Boxes', icon: 'lock' },
    ]
  },
  {
    title: 'FLAT GLASS',
    key: 'module_flat_glass',
    items: [
      { href: '/flat-glass/submissions', label: 'Submissions', labelAccent: '', icon: 'document' },
      { href: '/flat-glass/pipeline', label: 'Lead', labelAccent: 'Pipeline', icon: 'activity' },
      { href: '/flat-glass/inventory', label: 'Inventory', labelAccent: '', icon: 'layers' },
    ]
  },
  {
    title: 'COMMUNICATION',
    key: 'module_communication',
    items: [
      { href: '/communication/calls', label: 'Calls', labelAccent: '', icon: 'phone' },
      { href: '/communication/messages', label: 'Messages', labelAccent: '', icon: 'chat' },
      { href: '/communication/live-chat', label: 'Live', labelAccent: 'Chat', icon: 'zap' },
    ]
  },
  {
    title: 'BOOKKEEPING',
    key: 'module_bookkeeping',
    items: [
      { href: '/bookkeeping', label: 'Expense', labelAccent: 'Tracker', icon: 'receipt' },
      { href: '/bookkeeping/ledger', label: 'Transaction', labelAccent: 'Ledger', icon: 'layers' },
      { href: '/bookkeeping/pl', label: 'Profit &', labelAccent: 'Loss', icon: 'chart' },
    ]
  },
  {
    title: 'STATISTICS',
    key: 'module_statistics',
    items: [
      { href: '/statistics/roll-up-times', label: 'Roll Up', labelAccent: 'Avg Times', icon: 'clock' },
      { href: '/statistics/waste-tracking', label: 'Waste', labelAccent: 'Tracking', icon: 'chart' },
    ]
  },
  {
    title: 'ACCOUNT',
    items: [
      { href: '/time-clock', label: 'Time', labelAccent: 'Clock', icon: 'clock' },
      { href: '/settings', label: 'System', labelAccent: 'Settings', icon: 'cog' },
    ]
  }
]

const icons: Record<string, React.ReactElement> = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  stopwatch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="14" r="8"></circle>
      <line x1="12" y1="10" x2="12" y2="14"></line>
      <line x1="12" y1="14" x2="15" y2="14"></line>
      <line x1="10" y1="2" x2="14" y2="2"></line>
      <line x1="12" y1="2" x2="12" y2="6"></line>
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <line x1="10" y1="9" x2="8" y2="9"></line>
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  gift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <polyline points="20 12 20 22 4 22 4 12"></polyline>
      <rect x="2" y="7" width="20" height="5"></rect>
      <line x1="12" y1="22" x2="12" y2="7"></line>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
      <line x1="7" y1="7" x2="7.01" y2="7"></line>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  ),
  'plus-circle': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="16"></line>
      <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
      <line x1="1" y1="10" x2="23" y2="10"></line>
    </svg>
  ),
  dollar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  cog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
}

// Colors — from dashboard theme CSS variables
const RED = 'var(--dash-red, #dc2626)'
const YELLOW = 'var(--dash-border-accent, rgba(245, 158, 11, 0.35))'
const YELLOW_SOLID = 'var(--dash-yellow-solid, #f59e0b)'

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [modules, setModules] = useState<Record<string, boolean>>({})
  const [shopName, setShopName] = useState('')

  // Fetch module toggles + shop name from config
  // Service modules (auto_tint, flat_glass, etc.) read from shop_modules table
  // Platform features (bookkeeping, communication, statistics) still read from shop_config
  useEffect(() => {
    fetch('/api/auto/config')
      .then(r => r.json())
      .then(data => {
        if (data.shopConfig) {
          setShopName(data.shopConfig.shop_name || '')

          // Start with platform feature toggles from shop_config
          const moduleMap: Record<string, boolean> = {
            module_communication: Boolean(data.shopConfig.module_communication),
            module_statistics: Boolean(data.shopConfig.module_statistics),
            module_bookkeeping: data.shopConfig.module_bookkeeping !== false,
            module_lock_boxes: Boolean(data.shopConfig.module_lock_boxes),
            module_inventory: Boolean(data.shopConfig.module_inventory),
          }

          // Map service modules from shop_modules table
          if (data.shopModules && Array.isArray(data.shopModules)) {
            for (const sm of data.shopModules) {
              const key = sm.service_modules?.module_key
              if (!key) continue
              // Map module_key -> sidebar toggle key
              if (key === 'auto_tint') moduleMap.module_auto_booking = sm.enabled
              else if (key === 'flat_glass') moduleMap.module_flat_glass = sm.enabled
            }
          }

          setModules(moduleMap)
        }
      })
      .catch(() => {})
  }, [])

  // Build visible sections -- merge items for sections with same title
  const visibleSections = useMemo(() => {
    const merged: NavSection[] = []
    const titleMap = new Map<string, NavItem[]>()

    for (const section of ALL_SECTIONS) {
      // Check if this section requires a module toggle
      if (section.key && !modules[section.key]) continue

      const existing = titleMap.get(section.title)
      if (existing) {
        // Merge items into existing section with same title
        existing.push(...section.items)
      } else {
        const items = [...section.items]
        titleMap.set(section.title, items)
        merged.push({ title: section.title, items })
      }
    }

    return merged
  }, [modules])

  return (
    <div style={{
      width: '240px',
      height: '100vh',
      background: 'var(--dash-page-bg, #111111)',
      borderRight: `1px solid ${YELLOW}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Logo Header */}
      <div style={{ padding: '24px 20px', borderBottom: `1px solid ${YELLOW}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: RED,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 12h18M12 3v18" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dash-text-primary, #f1f5f9)' }}>
              {shopName ? (
                <>{shopName.split(' ').slice(0, -1).join(' ')} <span style={{ color: RED }}>{shopName.split(' ').slice(-1)[0]}</span></>
              ) : (
                <>Shop <span style={{ color: RED }}>Ops</span></>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dash-text-muted, #6b7280)', letterSpacing: '0.5px' }}>
              Operations Hub
            </div>
          </div>
          <button
            onClick={() => {
              setIsRefreshing(true)
              router.refresh()
              setTimeout(() => setIsRefreshing(false), 800)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--dash-text-muted, #6b7280)',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = RED }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280' }}
            aria-label="Refresh page"
            title="Refresh page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
              width: 18,
              height: 18,
              animation: isRefreshing ? 'spin 0.6s linear infinite' : 'none',
            }}>
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
        {visibleSections.map((section, sectionIdx) => (
          <div key={`${section.title}-${sectionIdx}`}>
            {/* Yellow pinstripe separator between sections */}
            {sectionIdx > 0 && (
              <div style={{
                height: '1px',
                background: YELLOW,
                margin: '4px 20px 4px 20px',
              }} />
            )}
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: YELLOW_SOLID,
              textTransform: 'uppercase' as const,
              letterSpacing: '1.5px',
              padding: '14px 20px 8px'
            }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault()
                    router.push(item.href)
                    onNavigate?.()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 20px',
                    color: isActive ? RED : '#6b7280',
                    textDecoration: 'none',
                    borderLeft: isActive ? `3px solid ${RED}` : '3px solid transparent',
                    background: isActive ? 'var(--dash-active-bg, rgba(220, 38, 38, 0.08))' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ color: isActive ? RED : '#6b7280' }}>
                    {icons[item.icon]}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: isActive ? 'var(--dash-text-primary, #f1f5f9)' : 'var(--dash-text-secondary, #e5e7eb)', flex: 1 }}>
                    {item.label}{item.labelAccent && <span style={{ color: RED }}> {item.labelAccent}</span>}
                  </span>
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '20px', borderTop: `1px solid ${YELLOW}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: RED,
            boxShadow: `0 0 8px ${RED}`
          }}></div>
          <span style={{ fontSize: '12px', color: 'var(--dash-text-muted, #6b7280)' }}>{shopName || 'Shop'} - Active</span>
        </div>

        {/* Sign Out */}
        <button
          onClick={async () => {
            const { createSupabaseBrowser } = await import('@/app/lib/supabase-browser');
            const supabase = createSupabaseBrowser();
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', margin: '8px 16px 0',
            background: 'none', border: 'none',
            color: 'var(--dash-text-muted, #6b7280)',
            fontSize: '12px', cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  )
}
