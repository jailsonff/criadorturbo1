-- Add predefined_quantities column to store_packages
ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS predefined_quantities jsonb DEFAULT NULL;

-- This column stores an array of objects with quantity and price
-- Example: [{"quantity": 100, "price": 0.50}, {"quantity": 500, "price": 2.00}]

COMMENT ON COLUMN public.store_packages.predefined_quantities IS 'Array of predefined quantity/price pairs for quick selection';