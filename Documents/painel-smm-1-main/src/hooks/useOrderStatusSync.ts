import { useEffect, useRef, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { checkMultipleOrdersStatus, OrderStatus } from "@/lib/api";

interface SyncOptions {
  enabled: boolean;
  intervalMs?: number;
  onStatusUpdate?: (orderId: number, status: OrderStatus) => void;
}

export const useOrderStatusSync = (orderIds: number[], options: SyncOptions) => {
  const { enabled, intervalMs = 30000, onStatusUpdate } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);

  const syncOrderStatuses = useCallback(async () => {
    if (!enabled || orderIds.length === 0 || isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    try {
      // Process in batches of 100 for API efficiency
      const batchSize = 100;
      for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const statuses = await checkMultipleOrdersStatus(batch);

        // Update each order in the database
        for (const [orderIdStr, status] of Object.entries(statuses)) {
          const orderId = parseInt(orderIdStr);
          if (status && !status.error) {
            // Update the order in the database
            const supabase = getSupabaseClient();
            await supabase
              .from("orders")
              .update({
                status: status.status || null,
                start_count: status.start_count || null,
                remains: status.remains || null,
                charge: status.charge ? parseFloat(status.charge as string) : null,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", orderId);

            onStatusUpdate?.(orderId, status);
          }
        }
      }
    } catch (error) {
      console.error("Error syncing order statuses:", error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [enabled, orderIds, onStatusUpdate]);

  // Initial sync and set up interval
  useEffect(() => {
    if (!enabled) return;

    // Sync immediately on mount
    syncOrderStatuses();

    // Set up polling interval
    intervalRef.current = setInterval(syncOrderStatuses, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, intervalMs, syncOrderStatuses]);

  return { syncNow: syncOrderStatuses };
};
