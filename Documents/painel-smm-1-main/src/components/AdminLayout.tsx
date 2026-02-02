import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AdminSidebar from "./AdminSidebar";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <SidebarInset className="flex-1 min-h-0">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
