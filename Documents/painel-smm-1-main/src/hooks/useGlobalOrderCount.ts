import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export const useGlobalOrderCount = () => {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial count
    const fetchCount = async () => {
      const supabase = getSupabaseClient();
      const { count: orderCount, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true });

      // External DB might not have this table yet
      if (error) {
        setCount(null);
        setLoading(false);
        return;
      }

      if (orderCount !== null) {
        setCount(orderCount);
      }
      setLoading(false);
    };

    fetchCount();

    // Subscribe to real-time updates
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel("global-orders-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        () => {
          // Increment count on new order
          setCount((prev) => (prev !== null ? prev + 1 : 1));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
        },
        () => {
          // Decrement count on delete
          setCount((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
        }
      )
      .subscribe();

    return () => {
      const supabase = getSupabaseClient();
      supabase.removeChannel(channel);
    };
  }, []);

  return { count, loading };
};
