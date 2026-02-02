-- Create index table for duplicate-prevention (same service_id + same link)
CREATE TABLE IF NOT EXISTS public.store_order_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL,
  normalized_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_order_links_service_link_status
  ON public.store_order_links(service_id, normalized_link, status);

CREATE INDEX IF NOT EXISTS idx_store_order_links_order_id
  ON public.store_order_links(order_id);

-- Keep updated_at current
DO $$ BEGIN
  CREATE TRIGGER update_store_order_links_updated_at
  BEFORE UPDATE ON public.store_order_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS (service role + security definer will still work)
ALTER TABLE public.store_order_links ENABLE ROW LEVEL SECURITY;

-- No public policies on purpose (queried via backend functions / service role)

-- Normalize helper inside trigger
CREATE OR REPLACE FUNCTION public._normalize_order_link(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(trim(input), ''), '\\s+', '', 'g'), '/+$', ''))
$$;

-- Trigger: extract all (service_id, link) pairs from store_orders and store in store_order_links
CREATE OR REPLACE FUNCTION public.refresh_store_order_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  payload jsonb;
  payload_type text;
  st text;
  it jsonb;
  l text;
  sid int;
BEGIN
  -- remove existing rows for this order
  DELETE FROM public.store_order_links WHERE order_id = NEW.id;

  payload := COALESCE(NEW.order_payload, '{}'::jsonb);
  payload_type := lower(COALESCE(payload->>'type', 'single'));
  st := lower(COALESCE(NEW.order_status, 'pending'));

  IF payload_type = 'combo' THEN
    -- payload.items[].{service_id, links[]}
    IF jsonb_typeof(payload->'items') = 'array' THEN
      FOR it IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
        sid := NULLIF((it->>'service_id')::int, 0);
        IF sid IS NULL THEN
          CONTINUE;
        END IF;
        IF jsonb_typeof(it->'links') = 'array' THEN
          FOR l IN SELECT jsonb_array_elements_text(it->'links') LOOP
            IF public._normalize_order_link(l) <> '' THEN
              INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
              VALUES (NEW.id, sid, public._normalize_order_link(l), st);
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  ELSE
    -- single: payload.links[] (multi-link) or NEW.link
    sid := NULLIF((SELECT service_id FROM public.store_packages WHERE id = NEW.package_id LIMIT 1), 0);
    IF sid IS NULL THEN
      -- fallback: do not index if service_id cannot be determined
      RETURN NEW;
    END IF;

    IF jsonb_typeof(payload->'links') = 'array' THEN
      FOR l IN SELECT jsonb_array_elements_text(payload->'links') LOOP
        IF public._normalize_order_link(l) <> '' THEN
          INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
          VALUES (NEW.id, sid, public._normalize_order_link(l), st);
        END IF;
      END LOOP;
    ELSE
      IF public._normalize_order_link(NEW.link) <> '' THEN
        INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
        VALUES (NEW.id, sid, public._normalize_order_link(NEW.link), st);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_store_order_links ON public.store_orders;
CREATE TRIGGER trg_refresh_store_order_links
AFTER INSERT OR UPDATE OF order_status, order_payload, package_id, link
ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.refresh_store_order_links();
