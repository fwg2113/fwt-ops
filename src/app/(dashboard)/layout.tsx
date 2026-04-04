'use client'

import { useState } from 'react'
import Sidebar from '@/app/components/Sidebar'
import { DashboardThemeProvider, useDashboardTheme } from '@/app/components/dashboard'
import { useIsMobile } from '@/app/hooks/useIsMobile'

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
  const isMobile = useIsMobile()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.pageBg }}>
      {/* Mobile Header */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 56,
          background: colors.pageBg,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          zIndex: 999,
          gap: 10,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none', border: 'none',
              color: colors.textSecondary, padding: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}>
              {sidebarOpen ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>
          <div style={{
            width: 28, height: 28,
            background: colors.red, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 16, height: 16 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 12h18M12 3v18" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, flex: 1 }}>RevFlw</span>
        </div>
      )}

      {/* Sidebar Overlay (mobile only) */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 1000,
          }}
        />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          zIndex: 1001,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
      ) : (
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 100 }}>
          <Sidebar />
        </div>
      )}

      {/* Main Content */}
      <main style={{
        flex: 1,
        marginLeft: isMobile ? 0 : 240,
        paddingTop: isMobile ? 56 : 0,
        padding: isMobile ? '68px 12px 24px' : 24,
        minHeight: '100vh',
        overflowX: 'hidden',
      }}>
        {children}
      </main>
    </div>
  )
}
