import { ShoppingCart, ClipboardList, Wallet, HeadphonesIcon, Package } from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { to: "/new-order", label: "Novo", icon: ShoppingCart },
  { to: "/services", label: "Serviços", icon: Package },
  { to: "/add-balance", label: "Saldo", icon: Wallet },
  { to: "/orders", label: "Pedidos", icon: ClipboardList },
  { to: "/support", label: "Suporte", icon: HeadphonesIcon },
];

const MobileBottomNav = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const nav = (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/50"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // Keep the element anchored to the real viewport on iOS/Android scroll.
        WebkitTransform: "translate3d(0,0,0)",
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[60px]",
              isActive(item.to)
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <item.icon
              className={cn(
                "w-5 h-5 transition-transform duration-200",
                isActive(item.to) && "scale-110",
              )}
            />
            <span className={cn("text-[10px] font-medium leading-none", isActive(item.to) && "text-primary")}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );

  // Portaling avoids mobile browser scroll/viewport quirks caused by layout containers.
  return typeof document !== "undefined" ? createPortal(nav, document.body) : null;
};

export default MobileBottomNav;
