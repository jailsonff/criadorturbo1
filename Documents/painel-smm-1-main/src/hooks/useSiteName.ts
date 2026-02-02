import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";

export const useSiteName = () => {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["site-name"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("site_title")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Extract just the site name (before any dash or separator)
      const fullTitle = data?.site_title || "UpMidias - Painel SMM";
      const siteName = fullTitle.split(" - ")[0].trim();
      return siteName;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  return {
    siteName: data || "UpMidias",
    isLoading,
    isFetching,
    isResolved: Boolean(data),
  };
};
