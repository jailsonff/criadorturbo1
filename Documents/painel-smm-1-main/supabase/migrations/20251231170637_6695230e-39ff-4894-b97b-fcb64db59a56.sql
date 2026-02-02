-- Enable realtime for orders table
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Add orders table to realtime publication (if not already added)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;