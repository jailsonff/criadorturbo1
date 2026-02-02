-- Add default link fields per package (single packages)
ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS default_link_fields INTEGER NOT NULL DEFAULT 1;

-- Backfill safety for existing rows (in case column existed but null)
UPDATE public.store_packages
SET default_link_fields = 1
WHERE default_link_fields IS NULL;

-- Keep values sane
ALTER TABLE public.store_packages
ALTER COLUMN default_link_fields SET DEFAULT 1;