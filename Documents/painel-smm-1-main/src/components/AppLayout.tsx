import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex flex-col w-full">
        <Header />
        <div className="flex flex-1 min-h-0 pt-16 pb-16 md:pb-0">
          <AppSidebar />
          <SidebarInset className="flex-1 min-h-0">
            {children}
          </SidebarInset>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
