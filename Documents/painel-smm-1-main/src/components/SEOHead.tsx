import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface SiteSettings {
  site_title: string;
  site_description: string;
  meta_keywords: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  twitter_card: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  favicon_url: string | null;
  robots_content: string | null;
  canonical_url: string | null;
}

const SEOHead = () => {
  const { data: settings } = useQuery({
    queryKey: ["site-settings-seo"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SiteSettings | null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  useEffect(() => {
    if (!settings) return;

    // Update document title
    document.title = settings.site_title;

    // Helper to update or create meta tag
    const setMetaTag = (name: string, content: string | null, property?: boolean) => {
      if (!content) return;
      
      const attr = property ? "property" : "name";
      let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      
      meta.content = content;
    };

    // Basic SEO
    setMetaTag("description", settings.site_description);
    setMetaTag("keywords", settings.meta_keywords);
    setMetaTag("robots", settings.robots_content);

    // Open Graph
    setMetaTag("og:title", settings.og_title || settings.site_title, true);
    setMetaTag("og:description", settings.og_description || settings.site_description, true);
    setMetaTag("og:type", "website", true);
    if (settings.og_image_url) {
      setMetaTag("og:image", settings.og_image_url, true);
    }

    // Twitter
    setMetaTag("twitter:card", settings.twitter_card || "summary_large_image");
    setMetaTag("twitter:title", settings.twitter_title || settings.og_title || settings.site_title);
    setMetaTag("twitter:description", settings.twitter_description || settings.og_description || settings.site_description);
    if (settings.og_image_url) {
      setMetaTag("twitter:image", settings.og_image_url);
    }

    // Favicon
    if (settings.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
      
      // Also set apple-touch-icon
      let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
      if (!appleLink) {
        appleLink = document.createElement("link");
        appleLink.rel = "apple-touch-icon";
        document.head.appendChild(appleLink);
      }
      appleLink.href = settings.favicon_url;
    }

    // Canonical URL
    if (settings.canonical_url) {
      let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = settings.canonical_url;
    }
  }, [settings]);

  return null; // This component doesn't render anything
};

export default SEOHead;
