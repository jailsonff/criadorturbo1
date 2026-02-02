import { useState, useMemo } from "react";
import { 
  Globe,
  Heart,
  Eye,
  Users,
  Share2,
  MessageSquare,
  ThumbsUp,
  Bookmark,
  Play,
  UserPlus,
  Repeat,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Service } from "@/lib/api";
import { usePlatformIcons } from "@/hooks/usePlatformIcons";

interface PlatformCategoryFilterProps {
  services: Service[];
  onFilterChange: (platform: string | null, categoryKeyword: string | null, autoSelectCategory?: string) => void;
  selectedPlatform: string | null;
  selectedCategoryKeyword: string | null;
}

interface CategoryConfig {
  name: string;
  icon: LucideIcon;
  keywords: string[];
}

const CATEGORY_TYPES: CategoryConfig[] = [
  { name: "Seguidores", icon: UserPlus, keywords: ["seguidor", "follower"] },
  { name: "Curtidas", icon: Heart, keywords: ["curtida", "like", "heart"] },
  { name: "Views", icon: Eye, keywords: ["visualiza story", "visualizações story", "visualizações em story", "story view", "stories view"] },
  { name: "Comentários", icon: MessageSquare, keywords: ["comentár", "coment", "comment"] },
  { name: "Compartilhar", icon: Share2, keywords: ["compartilha", "share"] },
  { name: "Reels", icon: Play, keywords: ["vizualizações em reel", "visualiza reel", "visualizações reel", "reel view", "reels view"] },
  { name: "Inscritos", icon: Users, keywords: ["inscrit", "subscri"] },
  { name: "Plays", icon: Play, keywords: ["play", "stream", "ouvintes"] },
  { name: "Retweet", icon: Repeat, keywords: ["retweet", "repost"] },
  { name: "Saves", icon: Bookmark, keywords: ["save", "salvar", "salvo"] },
  { name: "Reações", icon: ThumbsUp, keywords: ["reação", "reaction", "react"] },
  { name: "Live", icon: Play, keywords: ["live", "ao vivo", "transmissão"] },
  { name: "Métricas", icon: Eye, keywords: ["métrica", "metrica", "impression", "alcance"] },
  { name: "Engajamento", icon: ThumbsUp, keywords: ["engagement", "engaja", "power", "boost"] },
];

const PlatformCategoryFilter = ({
  services,
  onFilterChange,
  selectedPlatform,
  selectedCategoryKeyword,
}: PlatformCategoryFilterProps) => {
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const { platforms, getCategoriesForPlatform, isLoading } = usePlatformIcons();

  // Get all service categories
  const serviceCategories = useMemo(() => {
    if (!services?.length) return [];
    return [...new Set(services.map(s => s.category))];
  }, [services]);

  // Filter platforms that have matching services
  const availablePlatforms = useMemo(() => {
    if (!platforms?.length || !services?.length) return [];
    
    return platforms.filter((platform) => {
      // Check direct links
      const linkedCategories = getCategoriesForPlatform(platform.id);
      if (linkedCategories.some(cat => serviceCategories.includes(cat))) {
        return true;
      }

      // Check keywords
      return services.some((service) => {
        const name = service.name.toLowerCase();
        const category = service.category.toLowerCase();
        return platform.keywords.some(
          (kw) => name.includes(kw.toLowerCase()) || category.includes(kw.toLowerCase())
        );
      });
    });
  }, [platforms, services, serviceCategories, getCategoriesForPlatform]);

  // Get categories available for the selected platform
  const availableCategories = useMemo(() => {
    if (!selectedPlatform || !services?.length) return [];

    const platform = platforms.find((p) => p.name === selectedPlatform);
    if (!platform) return [];

    // Get linked categories
    const linkedCategories = getCategoriesForPlatform(platform.id);
    
    // Filter services to selected platform (by links or keywords)
    const platformServices = services.filter((service) => {
      // Check direct link
      if (linkedCategories.includes(service.category)) {
        return true;
      }
      
      // Check keywords
      const name = service.name.toLowerCase();
      const category = service.category.toLowerCase();
      return platform.keywords.some(
        (kw) => name.includes(kw.toLowerCase()) || category.includes(kw.toLowerCase())
      );
    });

    // Find which category types exist
    return CATEGORY_TYPES.filter((cat) =>
      platformServices.some((service) => {
        const name = service.name.toLowerCase();
        const category = service.category.toLowerCase();
        return cat.keywords.some(
          (kw) => name.includes(kw.toLowerCase()) || category.includes(kw.toLowerCase())
        );
      })
    );
  }, [selectedPlatform, services, platforms, getCategoriesForPlatform]);

  const visiblePlatforms = showAllPlatforms
    ? availablePlatforms
    : availablePlatforms.slice(0, 8);

  const handlePlatformClick = (platformName: string) => {
    if (selectedPlatform === platformName) {
      // Deselect
      onFilterChange(null, null);
    } else {
      onFilterChange(platformName, null);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    if (selectedCategoryKeyword === categoryName) {
      onFilterChange(selectedPlatform, null);
    } else {
      // Find the first category from services that matches this category keyword
      const categoryType = CATEGORY_TYPES.find((c) => c.name === categoryName);
      const platform = platforms.find((p) => p.name === selectedPlatform);
      
      if (categoryType && platform) {
        // Get linked categories
        const linkedCategories = getCategoriesForPlatform(platform.id);
        
        // Get platform-filtered services
        const platformServices = services.filter((service) => {
          if (linkedCategories.includes(service.category)) {
            return true;
          }
          const name = service.name.toLowerCase();
          const cat = service.category.toLowerCase();
          return platform.keywords.some(
            (kw) => name.includes(kw.toLowerCase()) || cat.includes(kw.toLowerCase())
          );
        });

        // Find first category that matches
        const matchingCategory = platformServices.find((service) => {
          const name = service.name.toLowerCase();
          const cat = service.category.toLowerCase();
          return categoryType.keywords.some(
            (kw) => name.includes(kw.toLowerCase()) || cat.includes(kw.toLowerCase())
          );
        })?.category;

        onFilterChange(selectedPlatform, categoryName, matchingCategory || undefined);
      } else {
        onFilterChange(selectedPlatform, categoryName);
      }
    }
  };

  if (isLoading || !availablePlatforms.length) return null;

  return (
    <div className="space-y-4 mb-6">
      {/* Platform Icons Row */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide md:overflow-visible md:flex-wrap">
        {visiblePlatforms.map((platform) => {
          const isSelected = selectedPlatform === platform.name;
          return (
                <button
                  key={platform.id}
                  onClick={() => handlePlatformClick(platform.name)}
                  className={cn(
                    "relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0 overflow-hidden",
                    isSelected
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                      : "hover:scale-105 hover:opacity-80"
                  )}
                >
                  <img 
                    src={platform.icon_url} 
                    alt={platform.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </button>
          );
        })}
        
        {availablePlatforms.length > 8 && (
          <button
            onClick={() => setShowAllPlatforms(!showAllPlatforms)}
            className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors text-xs font-medium flex-shrink-0"
          >
            {showAllPlatforms ? "−" : "View All"}
          </button>
        )}
      </div>

      {/* Categories - shown when platform is selected */}
      {selectedPlatform && availableCategories.length > 0 && (
        <div className="space-y-2 animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground">Select Category</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide md:overflow-visible md:flex-wrap">
            {availableCategories.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategoryKeyword === category.name;
              return (
                <button
                  key={category.name}
                  onClick={() => handleCategoryClick(category.name)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 px-5 py-3 rounded-xl border transition-all duration-200 min-w-[90px] flex-shrink-0",
                    isSelected
                      ? "bg-primary/20 text-primary border-primary"
                      : "bg-card border-border/50 hover:border-primary/50 hover:bg-card/80"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium whitespace-nowrap">{category.name}</span>
                </button>
              );
            })}
            
            <button
              onClick={() => onFilterChange(selectedPlatform, null)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 px-5 py-3 rounded-xl border transition-all duration-200 min-w-[90px] flex-shrink-0",
                !selectedCategoryKeyword
                  ? "bg-primary/20 text-primary border-primary"
                  : "bg-card border-border/50 hover:border-primary/50"
              )}
            >
              <Globe className="w-5 h-5" />
              <span className="text-xs font-medium">View All</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformCategoryFilter;
