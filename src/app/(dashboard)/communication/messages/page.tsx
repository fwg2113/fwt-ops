export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import MessageList from './MessageList';

export default async function MessagesPage() {
  const { data: messages } = await supabaseAdmin
    .from('sms_messages')
    .select('*')
    .eq('shop_id', 1)
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: calls } = await supabaseAdmin
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <Suspense fallback={<div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading messages...</div>}>
      <MessageList initialMessages={messages || []} initialCalls={calls || []} />
    </Suspense>
  );
}
