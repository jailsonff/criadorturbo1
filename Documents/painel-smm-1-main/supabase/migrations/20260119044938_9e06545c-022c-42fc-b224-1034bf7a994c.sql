-- Enable realtime for store_orders table
-- (Postgres doesn't support IF NOT EXISTS for this statement)
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;