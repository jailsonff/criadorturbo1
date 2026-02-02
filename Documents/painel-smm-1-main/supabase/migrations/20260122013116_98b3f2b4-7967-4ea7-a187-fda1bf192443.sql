-- Add ability to hide packages from the storefront list (while keeping them active for direct access via popup/banner)
ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS hidden_from_storefront boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_packages.hidden_from_storefront IS 'When true, package remains active but is excluded from standard storefront listings (usable via popup/banner direct access).';

-- Optional index to speed up storefront listing filters
CREATE INDEX IF NOT EXISTS idx_store_packages_active_visible
ON public.store_packages (is_active, hidden_from_storefront);
