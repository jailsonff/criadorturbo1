import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface Platform {
  id: string;
  name: string;
  icon_url: string;
  bg_color: string;
  keywords: string[];
  display_order: number;
  is_active: boolean;
}

interface PlatformCategoryLink {
  id: string;
  platform_id: string;
  category_name: string;
}

export function usePlatformIcons() {
  const { data: platforms, isLoading: platformsLoading } = useQuery({
    queryKey: ["platform-icons"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("platform_icons")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      // External DB might not have this table yet
      if (error) {
        const msg = String((error as any)?.message || "");
        if ((error as any)?.code === "42P01" || msg.includes("does not exist")) {
          return [] as Platform[];
        }
        throw error;
      }

      return (data || []) as Platform[];
    },
  });

  const { data: categoryLinks, isLoading: linksLoading } = useQuery({
    queryKey: ["platform-category-links"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("platform_category_links").select("*");

      // External DB might not have this table yet
      if (error) {
        const msg = String((error as any)?.message || "");
        if ((error as any)?.code === "42P01" || msg.includes("does not exist")) {
          return [] as PlatformCategoryLink[];
        }
        throw error;
      }

      return (data || []) as PlatformCategoryLink[];
    },
  });

  // Get platform for a category (by link or keyword detection)
  const getPlatformForCategory = (category: string): Platform | null => {
    if (!platforms) return null;

    // First check direct links
    const link = categoryLinks?.find(l => l.category_name === category);
    if (link) {
      return platforms.find(p => p.id === link.platform_id) || null;
    }

    // Then check keywords
    const categoryLower = category.toLowerCase();
    return platforms.find(p => 
      p.keywords.some(kw => categoryLower.includes(kw.toLowerCase()))
    ) || null;
  };

  // Get all categories linked to a platform
  const getCategoriesForPlatform = (platformId: string): string[] => {
    return categoryLinks
      ?.filter(l => l.platform_id === platformId)
      .map(l => l.category_name) || [];
  };

  // Check if platform has any matching services
  const platformHasServices = (platform: Platform, serviceCategories: string[]): boolean => {
    // Check direct links
    const linkedCategories = getCategoriesForPlatform(platform.id);
    if (linkedCategories.some(cat => serviceCategories.includes(cat))) {
      return true;
    }

    // Check keywords
    return serviceCategories.some(cat => 
      platform.keywords.some(kw => cat.toLowerCase().includes(kw.toLowerCase()))
    );
  };

  return {
    platforms: platforms || [],
    categoryLinks: categoryLinks || [],
    isLoading: platformsLoading || linksLoading,
    getPlatformForCategory,
    getCategoriesForPlatform,
    platformHasServices,
  };
}
