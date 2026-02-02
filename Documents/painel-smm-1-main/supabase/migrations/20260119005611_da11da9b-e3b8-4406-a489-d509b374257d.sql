-- Add combo support to store packages and orders

ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'single',
ADD COLUMN IF NOT EXISTS combo_items jsonb NULL;

-- For combo orders we need to store multiple provider order ids + the payload (links per item)
ALTER TABLE public.store_orders
ADD COLUMN IF NOT EXISTS external_order_ids jsonb NULL,
ADD COLUMN IF NOT EXISTS order_payload jsonb NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_store_packages_package_type ON public.store_packages (package_type);
CREATE INDEX IF NOT EXISTS idx_store_orders_package_id_created_at ON public.store_orders (package_id, created_at DESC);

-- Keep RLS as-is (only adding columns)
