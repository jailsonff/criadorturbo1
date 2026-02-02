-- Store customer service credits (refund as balance / same-service quantity)
CREATE TABLE IF NOT EXISTS public.store_customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.store_customers(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  source_order_id UUID NULL REFERENCES public.store_orders(id) ON DELETE SET NULL,
  source_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_customer_credits_customer_id ON public.store_customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_customer_credits_service_id ON public.store_customer_credits(service_id);
CREATE INDEX IF NOT EXISTS idx_store_customer_credits_qty_remaining ON public.store_customer_credits(quantity_remaining);

ALTER TABLE public.store_customer_credits ENABLE ROW LEVEL SECURITY;

-- Admins can manage credits
DO $$ BEGIN
  CREATE POLICY "Admins can manage store customer credits"
  ON public.store_customer_credits
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role can manage credits (used by backend functions)
DO $$ BEGIN
  CREATE POLICY "Service role can manage store customer credits"
  ON public.store_customer_credits
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER update_store_customer_credits_updated_at
  BEFORE UPDATE ON public.store_customer_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
