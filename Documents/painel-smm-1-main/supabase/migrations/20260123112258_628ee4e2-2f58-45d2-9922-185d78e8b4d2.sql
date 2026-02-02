-- Ensure tables exist
CREATE TABLE IF NOT EXISTS public.store_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL UNIQUE,
  order_id uuid NULL,
  phone text NOT NULL,
  package_id uuid NOT NULL,
  total_price numeric NOT NULL DEFAULT 0,
  payment_provider text NOT NULL DEFAULT 'mercadopago',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_package_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  package_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'available',
  source_payment_id text NOT NULL,
  source_order_id uuid NULL,
  redeemed_order_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_phone ON public.store_payment_intents (phone);
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_package_id ON public.store_payment_intents (package_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_package_credits_source_payment_id ON public.store_package_credits (source_payment_id);
CREATE INDEX IF NOT EXISTS idx_store_package_credits_phone_status ON public.store_package_credits (phone, status);
CREATE INDEX IF NOT EXISTS idx_store_package_credits_package_id ON public.store_package_credits (package_id);

-- RLS
ALTER TABLE public.store_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_package_credits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- store_payment_intents policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_payment_intents' AND policyname='Admins can manage store_payment_intents'
  ) THEN
    CREATE POLICY "Admins can manage store_payment_intents"
    ON public.store_payment_intents
    FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_payment_intents' AND policyname='Service role can manage store_payment_intents'
  ) THEN
    CREATE POLICY "Service role can manage store_payment_intents"
    ON public.store_payment_intents
    FOR ALL
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);
  END IF;

  -- store_package_credits policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_package_credits' AND policyname='Admins can manage store_package_credits'
  ) THEN
    CREATE POLICY "Admins can manage store_package_credits"
    ON public.store_package_credits
    FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_package_credits' AND policyname='Service role can manage store_package_credits'
  ) THEN
    CREATE POLICY "Service role can manage store_package_credits"
    ON public.store_package_credits
    FOR ALL
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);
  END IF;
END $$;

-- updated_at triggers (only if helper exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_store_payment_intents_updated_at') THEN
      CREATE TRIGGER trg_store_payment_intents_updated_at
      BEFORE UPDATE ON public.store_payment_intents
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_store_package_credits_updated_at') THEN
      CREATE TRIGGER trg_store_package_credits_updated_at
      BEFORE UPDATE ON public.store_package_credits
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
