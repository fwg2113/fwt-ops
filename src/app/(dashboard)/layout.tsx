'use client'

import { useState } from 'react'
import Sidebar from '@/app/components/Sidebar'
import { DashboardThemeProvider, useDashboardTheme } from '@/app/components/dashboard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardThemeProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </DashboardThemeProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { colors } = useDashboardTheme()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.pageBg }}>
      {/* Mobile Header */}
      <div style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '56px',
        background: colors.pageBg,
        borderBottom: `1px solid ${colors.border}`,
        alignItems: 'center',
        padding: '0 16px',
        zIndex: 999,
        gap: '12px',
      }} className="mobile-header">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textSecondary,
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div style={{
          width: '28px',
          height: '28px',
          background: colors.red,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 12h18M12 3v18" />
          </svg>
        </div>
        <span style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>FWT Ops</span>
      </div>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 1000,
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1001,
      }} className={sidebarOpen ? 'sidebar-open' : ''}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          marginLeft: 240,
          padding: 24,
          minHeight: '100vh',
          overflowX: 'hidden',
        }}
      >
        {children}
      </main>
    </div>
  )
}
