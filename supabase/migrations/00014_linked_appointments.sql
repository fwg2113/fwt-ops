-- ============================================================================
-- Migration 00014: Linked Appointments for Multi-Service Workflow
-- Adds module awareness, linked group support, and document link to auto_bookings
-- ============================================================================

-- 1. Module field: which service module this appointment slot is for
ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'auto_tint';

-- 2. Linked group: connects multiple appointment slots for the same multi-service job
ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS linked_group_id UUID DEFAULT NULL;

-- 3. Direct document link: the quote/invoice this appointment was scheduled from
ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS document_id UUID DEFAULT NULL REFERENCES documents(id) ON DELETE SET NULL;

-- 4. Scheduling mode for linked groups
ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS scheduling_mode TEXT DEFAULT 'sequential'
    CHECK (scheduling_mode IN ('sequential', 'parallel'));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_auto_bookings_linked_group ON auto_bookings(linked_group_id) WHERE linked_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auto_bookings_document ON auto_bookings(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auto_bookings_module ON auto_bookings(module);

-- 6. Backfill existing appointments as auto_tint
UPDATE auto_bookings SET module = 'auto_tint' WHERE module IS NULL;

-- 7. Shop config: linked appointment defaults
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS linked_scheduling_default TEXT NOT NULL DEFAULT 'sequential'
    CHECK (linked_scheduling_default IN ('sequential', 'parallel')),
  ADD COLUMN IF NOT EXISTS linked_invoice_auto_create BOOLEAN NOT NULL DEFAULT true;
