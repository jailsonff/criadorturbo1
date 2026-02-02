-- Fix sender_type constraint to match app values
ALTER TABLE IF EXISTS public.ticket_messages
  DROP CONSTRAINT IF EXISTS valid_sender_type;

ALTER TABLE IF EXISTS public.ticket_messages
  ADD CONSTRAINT valid_sender_type
  CHECK (sender_type IN ('user','support','admin','ai'));