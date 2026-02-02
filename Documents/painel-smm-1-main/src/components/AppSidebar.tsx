import {
  Package, 
  ShoppingCart, 
  ClipboardList,
  Zap,
  ChevronLeft,
  ChevronRight,
  Wallet,
  HeadphonesIcon,
  FileText,
  Shield,
  LogOut,
  Layers,
  LayoutDashboard,
  RefreshCw
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSiteName } from "@/hooks/useSiteName";

interface MenuItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { to: "/new-order", label: "Novo Pedido", icon: ShoppingCart },
  { to: "/bulk-orders", label: "Pedidos em Massa", icon: Layers },
  { to: "/services", label: "Serviços", icon: Package },
  { to: "/add-balance", label: "Adicionar Saldo", icon: Wallet },
  { to: "/orders", label: "Meus Pedidos", icon: ClipboardList },
  { to: "/refills", label: "Reposição", icon: RefreshCw },
  { to: "/support", label: "Suporte", icon: HeadphonesIcon },
  { to: "/terms", label: "Termos", icon: FileText },
  { to: "/privacy", label: "Políticas de Privacidade", icon: Shield },
];

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const { signOut, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { siteName } = useSiteName();
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
    navigate("/");
  };

  // Menu items are now all user-facing, no filtering needed
  // Admin pages are accessed only through the Admin Panel button

  return (
    <Sidebar 
      className="border-r border-border/50 bg-sidebar"
      collapsible="icon"
    >
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold gradient-text">{siteName}</span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                  >
                    <Link 
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 border",
                        isActive(item.to)
                          ? "bg-primary text-primary-foreground font-medium border-primary shadow-md shadow-primary/20"
                          : "border-border/50 bg-card/30 hover:bg-muted/50 hover:border-primary/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Panel Shortcut */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Painel Admin">
                    <Link
                      to="/admin-dashboard"
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 border-2",
                        "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50",
                        "hover:from-amber-500/30 hover:to-orange-500/30 hover:border-amber-500",
                        "text-amber-500 font-medium shadow-lg shadow-amber-500/10"
                      )}
                    >
                      <LayoutDashboard className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span>Painel Admin</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-2">
        {user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              isCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span className="ml-2">Sair</span>}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span>Recolher</span>
            </>
          )}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
