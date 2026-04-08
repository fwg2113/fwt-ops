-- Add document_id to auto_leads so we can link lead -> quote document
-- and avoid creating duplicate quotes when re-sending a lead
ALTER TABLE auto_leads ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id);
