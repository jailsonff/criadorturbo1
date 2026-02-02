-- Add start_count and remains columns to store_orders for real-time progress tracking
ALTER TABLE public.store_orders 
ADD COLUMN IF NOT EXISTS start_count text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS remains text DEFAULT NULL;