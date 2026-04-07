-- Migration 00033: Phone system (calls, call_settings, greeting_recordings)

CREATE TABLE IF NOT EXISTS calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id BIGINT DEFAULT 1,
  call_sid TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  caller_phone TEXT,
  receiver_phone TEXT,
  status TEXT DEFAULT 'ringing',
  answered_by TEXT,
  agent_call_sid TEXT,
  category TEXT,
  duration INTEGER,
  voicemail_url TEXT,
  recording_url TEXT,
  read BOOLEAN DEFAULT false,
  caller_city TEXT,
  caller_state TEXT,
  customer_name TEXT,
  customer_id UUID,
  transfer_status TEXT,
  transfer_target_phone TEXT,
  transfer_target_name TEXT,
  transfer_target_call_sid TEXT,
  conference_name TEXT,
  conference_sid TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id BIGINT DEFAULT 1,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  ring_order INTEGER DEFAULT 0,
  sip_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS greeting_recordings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id BIGINT DEFAULT 1,
  name TEXT,
  url TEXT,
  r2_key TEXT,
  is_active BOOLEAN DEFAULT false,
  greeting_type TEXT DEFAULT 'main',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_shop_created ON calls(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(shop_id, status);
