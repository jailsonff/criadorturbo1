-- Add tutorial rules for link input modal
ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS link_tutorial_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_store_packages_link_tutorial_rules_gin
  ON public.store_packages USING GIN (link_tutorial_rules);
