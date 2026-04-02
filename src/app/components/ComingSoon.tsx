const RED = '#dc2626'
const YELLOW = 'rgba(245, 158, 11, 0.35)'

export default function ComingSoon({ title, section }: { title: string; section: string }) {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
          {title}
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          {section}
        </p>
      </div>
      <div style={{
        background: '#1a1a1a',
        border: `1px solid ${YELLOW}`,
        borderRadius: 12,
        padding: '80px 24px',
        textAlign: 'center' as const,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'rgba(220,38,38,0.08)',
          border: `1px solid ${YELLOW}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e5e7eb', marginBottom: 8 }}>
          Coming Soon
        </div>
        <div style={{ fontSize: 14, color: '#4b5563', maxWidth: 400, margin: '0 auto' }}>
          This module is under development. The legacy system handles this workflow and will remain active until V3 is fully tested.
        </div>
      </div>
    </div>
  )
}
