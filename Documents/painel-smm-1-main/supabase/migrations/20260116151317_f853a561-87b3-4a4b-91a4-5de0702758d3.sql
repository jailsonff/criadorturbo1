
-- Function to increment package sales count
CREATE OR REPLACE FUNCTION public.increment_package_sales(package_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE store_packages
  SET sales_count = sales_count + 1
  WHERE id = package_id;
END;
$$;
