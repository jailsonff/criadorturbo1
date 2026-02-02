import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import StoreFront from "@/pages/StoreFront";
import Index from "@/pages/Index";

interface SiteSettings {
  use_store_landing?: boolean;
  store_landing_slug?: string;
}

export default function Root() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["site-settings-root"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("use_store_landing, store_landing_slug")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as SiteSettings | null;
    },
    staleTime: 1000 * 60,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (settings?.use_store_landing) {
    return <StoreFront forcedSlug={settings.store_landing_slug || "loja"} />;
  }

  return <Index />;
}
