export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', color: 'var(--color-text)' }}>
      {children}
    </div>
  )
}
