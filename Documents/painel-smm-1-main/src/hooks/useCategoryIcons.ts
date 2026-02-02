import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { detectPlatformIcon } from "@/lib/platformIcons";

interface CategoryIcon {
  id: string;
  category_name: string;
  icon: string;
  icon_type: 'emoji' | 'image';
}

export function useCategoryIcons() {
  const { data: categoryIcons, isLoading } = useQuery({
    queryKey: ["category-icons"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("category_icons").select("*");

      // External DB might not have this table yet
      if (error) {
        const msg = String((error as any)?.message || "");
        if ((error as any)?.code === "42P01" || msg.includes("does not exist")) {
          return [] as CategoryIcon[];
        }
        throw error;
      }

      return (data || []) as CategoryIcon[];
    },
  });

  // Get icon for a category (saved > auto-detected)
  const getCategoryIcon = (category: string): { icon: string; color: string; type: 'emoji' | 'image' } | null => {
    // First check for saved icon
    const savedIcon = categoryIcons?.find(ci => ci.category_name === category);
    if (savedIcon) {
      return { 
        icon: savedIcon.icon, 
        color: "currentColor",
        type: savedIcon.icon_type
      };
    }
    
    // Then auto-detect
    const autoDetected = detectPlatformIcon(category);
    if (autoDetected) {
      return { ...autoDetected, type: 'emoji' };
    }
    
    return null;
  };

  return {
    categoryIcons,
    isLoading,
    getCategoryIcon,
  };
}
