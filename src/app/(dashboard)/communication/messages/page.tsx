'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader, DashboardCard, Button, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface SmsMessage {
  id: string;
  direction: string;
  from_phone: string;
  to_phone: string;
  body: string;
  media_url: string | null;
  status: string;
  read: boolean;
  customer_name: string | null;
  created_at: string;
}

interface Conversation {
  phone: string;
  name: string | null;
  lastMessage: string;
  lastTime: string;
  unread: number;
  messages: SmsMessage[];
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (n.length === 10) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  return phone;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MessagesPage() {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/sms?limit=500');
    const data = await res.json();
    setMessages(data.messages || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch('/api/sms?limit=500');
      const data = await res.json();
      setMessages(data.messages || []);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Group messages into conversations by phone number
  const conversations: Conversation[] = (() => {
    const map = new Map<string, Conversation>();
    const twilioNumber = messages.find(m => m.direction === 'outbound')?.from_phone || '';

    for (const msg of messages) {
      const phone = msg.direction === 'inbound' ? msg.from_phone : msg.to_phone;
      if (!phone || phone === twilioNumber) continue;

      if (!map.has(phone)) {
        map.set(phone, {
          phone,
          name: msg.customer_name || null,
          lastMessage: msg.body,
          lastTime: msg.created_at,
          unread: 0,
          messages: [],
        });
      }
      const conv = map.get(phone)!;
      conv.messages.push(msg);
      if (!msg.read && msg.direction === 'inbound') conv.unread++;
      if (msg.customer_name && !conv.name) conv.name = msg.customer_name;
    }

    // Sort messages within each conversation (oldest first)
    for (const conv of map.values()) {
      conv.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
    );
  })();

  const selectedConv = conversations.find(c => c.phone === selectedPhone);

  async function handleSend() {
    if (!selectedPhone || !replyText.trim()) return;
    setSending(true);
    await fetch('/api/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: selectedPhone, message: replyText.trim() }),
    });
    setReplyText('');
    setSending(false);
    fetchMessages();
  }

  // Scroll to bottom when conversation changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedPhone, messages.length]);

  return (
    <div>
      <PageHeader title="Messages" titleAccent="" subtitle="SMS inbox and conversations" />

      <div style={{ display: 'flex', gap: SPACING.md, height: 'calc(100vh - 140px)', minHeight: 400 }}>
        {/* Conversation List */}
        <div style={{
          width: isMobile && selectedPhone ? 0 : isMobile ? '100%' : 320,
          overflow: isMobile && selectedPhone ? 'hidden' : 'visible',
          flexShrink: 0,
          transition: 'width 0.2s',
        }}>
          <DashboardCard noPadding>
            {loading ? (
              <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: SPACING.xl, textAlign: 'center', color: COLORS.textMuted }}>
                No messages yet. Incoming SMS will appear here.
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  style={{
                    padding: `${SPACING.md}px ${SPACING.lg}px`,
                    borderBottom: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                    background: selectedPhone === conv.phone ? COLORS.activeBg : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                      {conv.name || formatPhone(conv.phone)}
                    </span>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{timeAgo(conv.lastTime)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: FONT.sizeXs, color: COLORS.textMuted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%',
                    }}>
                      {conv.lastMessage}
                    </span>
                    {conv.unread > 0 && (
                      <span style={{
                        minWidth: 20, height: 20, borderRadius: 10,
                        background: COLORS.red, color: '#fff',
                        fontSize: '0.65rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 5px', flexShrink: 0,
                      }}>
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </DashboardCard>
        </div>

        {/* Message Thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedConv ? (
            <DashboardCard noPadding>
              {/* Header */}
              <div style={{
                padding: `${SPACING.md}px ${SPACING.lg}px`,
                borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex', alignItems: 'center', gap: SPACING.sm,
              }}>
                {isMobile && (
                  <button onClick={() => setSelectedPhone(null)} style={{
                    background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: COLORS.textPrimary }}>
                    {selectedConv.name || formatPhone(selectedConv.phone)}
                  </div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>
                    {formatPhone(selectedConv.phone)}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedConv.messages.map(msg => (
                  <div key={msg.id} style={{
                    alignSelf: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                  }}>
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 16,
                      background: msg.direction === 'outbound' ? COLORS.red : COLORS.inputBg,
                      color: msg.direction === 'outbound' ? '#fff' : COLORS.textPrimary,
                      fontSize: FONT.sizeSm,
                      lineHeight: 1.4,
                      borderBottomRightRadius: msg.direction === 'outbound' ? 4 : 16,
                      borderBottomLeftRadius: msg.direction === 'inbound' ? 4 : 16,
                    }}>
                      {msg.body}
                    </div>
                    <div style={{
                      fontSize: '0.6rem', color: COLORS.textMuted, marginTop: 2,
                      textAlign: msg.direction === 'outbound' ? 'right' : 'left',
                    }}>
                      {timeAgo(msg.created_at)}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply */}
              <div style={{
                padding: SPACING.md, borderTop: `1px solid ${COLORS.border}`,
                display: 'flex', gap: SPACING.sm,
              }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && replyText.trim()) handleSend(); }}
                  placeholder="Type a message..."
                  style={{
                    flex: 1, padding: '10px 14px',
                    background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`,
                    borderRadius: 20, color: COLORS.textPrimary,
                    fontSize: FONT.sizeSm, outline: 'none',
                  }}
                />
                <Button variant="primary" onClick={handleSend} disabled={sending || !replyText.trim()}>
                  {sending ? '...' : 'Send'}
                </Button>
              </div>
            </DashboardCard>
          ) : (
            <DashboardCard>
              <div style={{ textAlign: 'center', color: COLORS.textMuted }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.3 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div style={{ fontSize: FONT.sizeSm }}>Select a conversation to view messages</div>
              </div>
            </DashboardCard>
          )}
        </div>
      </div>
    </div>
  );
}
