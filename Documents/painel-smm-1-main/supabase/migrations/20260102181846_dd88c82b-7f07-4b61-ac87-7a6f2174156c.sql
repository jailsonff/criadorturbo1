-- Add column to store the internal service ID from the provider
-- This allows keeping the original external_service_id for the customer
-- while using a different service internally for order processing
ALTER TABLE public.imported_services
ADD COLUMN internal_provider_service_id integer;

-- Add a comment explaining the purpose
COMMENT ON COLUMN public.imported_services.internal_provider_service_id IS 'The service ID from the current provider used internally for order processing. If NULL, uses external_service_id.';