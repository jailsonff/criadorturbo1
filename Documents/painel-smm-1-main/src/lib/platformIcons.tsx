import React from "react";

// Platform icon configurations with their detection keywords
const PLATFORM_ICONS: Record<string, { icon: string; color: string; keywords: string[] }> = {
  instagram: {
    icon: "📸",
    color: "#E1306C",
    keywords: ["instagram", "insta", "ig"],
  },
  tiktok: {
    icon: "🎵",
    color: "#00F2EA",
    keywords: ["tiktok", "tik tok", "tt"],
  },
  youtube: {
    icon: "📺",
    color: "#FF0000",
    keywords: ["youtube", "yt", "youtu"],
  },
  facebook: {
    icon: "👤",
    color: "#1877F2",
    keywords: ["facebook", "fb"],
  },
  twitter: {
    icon: "𝕏",
    color: "#1DA1F2",
    keywords: ["twitter", "𝕏", "x/twitter", "x /"],
  },
  telegram: {
    icon: "✈️",
    color: "#0088CC",
    keywords: ["telegram", "tg"],
  },
  whatsapp: {
    icon: "💬",
    color: "#25D366",
    keywords: ["whatsapp", "wpp", "zap"],
  },
  spotify: {
    icon: "🎧",
    color: "#1DB954",
    keywords: ["spotify", "sp.0t1fy", "spotfy"],
  },
  twitch: {
    icon: "🎮",
    color: "#9146FF",
    keywords: ["twitch"],
  },
  kwai: {
    icon: "🎬",
    color: "#FF7300",
    keywords: ["kwai"],
  },
  google: {
    icon: "🌐",
    color: "#4285F4",
    keywords: ["google", "trafego", "tráfego", "website"],
  },
};

// Detects platform from category/service name and returns an icon
export function detectPlatformIcon(text: string): { icon: string; color: string } | null {
  const lowerText = text.toLowerCase();
  
  for (const [, config] of Object.entries(PLATFORM_ICONS)) {
    if (config.keywords.some(keyword => lowerText.includes(keyword))) {
      return { icon: config.icon, color: config.color };
    }
  }
  
  return null;
}

// Extracts emoji from the beginning of a text if present
export function extractLeadingEmoji(text: string): { emoji: string | null; cleanText: string } {
  // Regex to match emoji at the start of string
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F)/u;
  const match = text.match(emojiRegex);
  
  if (match) {
    return {
      emoji: match[0],
      cleanText: text.slice(match[0].length).trim(),
    };
  }
  
  return { emoji: null, cleanText: text };
}

// Get the display icon for a category (manual emoji takes priority, then auto-detected)
export function getCategoryIcon(category: string): { icon: string; color: string } | null {
  // Check for manually added emoji at the start
  const { emoji } = extractLeadingEmoji(category);
  if (emoji) {
    return { icon: emoji, color: "currentColor" };
  }
  
  // Auto-detect platform icon
  return detectPlatformIcon(category);
}

// Component to render category with icon
interface CategoryWithIconProps {
  category: string;
  className?: string;
}

export function CategoryWithIcon({ category, className = "" }: CategoryWithIconProps) {
  const iconData = getCategoryIcon(category);
  
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {iconData && (
        <span 
          className="inline-flex shrink-0"
          style={{ color: iconData.color !== "currentColor" ? iconData.color : undefined }}
        >
          {iconData.icon}
        </span>
      )}
      <span>{category}</span>
    </span>
  );
}
