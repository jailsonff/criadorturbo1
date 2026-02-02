-- Keep per-link statuses consistent with the main store order status
-- When an order reaches a terminal status (completed/cancelled/error/failed),
-- propagate it to every element inside external_order_ids (if it is a JSON array).

CREATE OR REPLACE FUNCTION public.sync_store_order_external_statuses()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal boolean;
BEGIN
  terminal := lower(coalesce(NEW.order_status, '')) IN ('completed','cancelled','canceled','error','failed');

  IF terminal
     AND NEW.external_order_ids IS NOT NULL
     AND jsonb_typeof(NEW.external_order_ids) = 'array'
  THEN
    NEW.external_order_ids := (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN
            jsonb_set(elem, '{order_status}', to_jsonb(NEW.order_status), true)
          ELSE
            elem
        END
      )
      FROM jsonb_array_elements(NEW.external_order_ids) AS elem
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_order_external_statuses ON public.store_orders;
CREATE TRIGGER trg_sync_store_order_external_statuses
BEFORE UPDATE OF order_status ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_store_order_external_statuses();
