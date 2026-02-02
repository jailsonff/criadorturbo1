-- Store customers (WhatsApp + PIN) for StoreFront login
CREATE TABLE IF NOT EXISTS public.store_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  full_name TEXT NULL,
  notes TEXT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions for store customers (custom auth)
CREATE TABLE IF NOT EXISTS public.store_customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.store_customers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_customer_sessions_customer_id ON public.store_customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_customer_sessions_phone ON public.store_customer_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_store_customer_sessions_expires_at ON public.store_customer_sessions(expires_at);

-- Link store orders to customer (optional for legacy orders)
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.store_customers(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customer_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage store customers
DO $$ BEGIN
  CREATE POLICY "Admins can manage store_customers"
  ON public.store_customers
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sessions are server-side only (service role)
DO $$ BEGIN
  CREATE POLICY "Service role can manage store_customer_sessions"
  ON public.store_customer_sessions
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER update_store_customers_updated_at
  BEFORE UPDATE ON public.store_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cleanup function for expired sessions (invoked from edge function)
CREATE OR REPLACE FUNCTION public.cleanup_expired_store_customer_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.store_customer_sessions
  WHERE expires_at < now();
$$;