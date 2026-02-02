import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminLayout from "./components/AdminLayout";
import Root from "./pages/Root";
import Auth from "./pages/Auth";
import Services from "./pages/Services";
import NewOrder from "./pages/NewOrder";
import BulkOrders from "./pages/BulkOrders";
import Orders from "./pages/Orders";
import Settings from "./pages/Settings";
import AddBalance from "./pages/AddBalance";

import Support from "./pages/Support";
import TicketChatPage from "./pages/TicketChatPage";
import PublicServices from "./pages/PublicServices";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Users from "./pages/Users";
import AdminTickets from "./pages/AdminTickets";
import AdminDashboard from "./pages/AdminDashboard";
import AdminOrders from "./pages/AdminOrders";
import AdminServices from "./pages/AdminServices";
import AdminProviders from "./pages/AdminProviders";
import MercadoPagoSettings from "./pages/MercadoPagoSettings";
import Refills from "./pages/Refills";
import AdminTerms from "./pages/AdminTerms";
import AdminPrivacy from "./pages/AdminPrivacy";
import AdminAI from "./pages/AdminAI";
import AdminLanding from "./pages/AdminLanding";
import AdminSEO from "./pages/AdminSEO";
import AdminCategoryIcons from "./pages/AdminCategoryIcons";
import AdminCategoryOrder from "./pages/AdminCategoryOrder";
import AdminPlatforms from "./pages/AdminPlatforms";
import AdminDatabase from "./pages/AdminDatabase";
import AdminRefills from "./pages/AdminRefills";
import AdminContact from "./pages/AdminContact";
import InitialSetup from "./pages/InitialSetup";
import StoreFront from "./pages/StoreFront";
import AdminStoreFrontends from "./pages/AdminStoreFrontends";
import AdminStorePackages from "./pages/AdminStorePackages";
import AdminStoreOrders from "./pages/AdminStoreOrders";
import AdminStoreSections from "./pages/AdminStoreSections";
import AdminStoreBanners from "./pages/AdminStoreBanners";
import AdminStoreUsers from "./pages/AdminStoreUsers";
import AdminStorePopups from "./pages/AdminStorePopups";
import AdminPWA from "./pages/AdminPWA";
import Install from "./pages/Install";
import AppAndroid from "./pages/AppAndroid";
import AppDownloadRedirect from "./pages/AppDownloadRedirect";

import SEOHead from "./components/SEOHead";
import AppErrorBoundary from "./components/AppErrorBoundary";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <SEOHead />
            <Toaster />
            <Sonner />
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Root />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/public-services" element={<PublicServices />} />
              <Route path="/setup" element={<InitialSetup />} />
              <Route path="/install" element={<Install />} />
              <Route path="/app" element={<AppAndroid />} />
              <Route path="/app-downloads/:fileName" element={<AppDownloadRedirect />} />
              <Route path="/loja/:slug" element={<StoreFront />} />
              <Route path="/loja" element={<StoreFront />} />

              {/* Protected user routes */}
              <Route
                path="/services"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Services />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/new-order"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <NewOrder />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bulk-orders"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <BulkOrders />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Orders />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/add-balance"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <AddBalance />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/refills"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Refills />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/support"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Support />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/support/ticket/:ticketId"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <TicketChatPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Settings />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Admin routes - protected with AdminRoute */}
              <Route
                path="/admin-dashboard"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminDashboard />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <Users />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-tickets"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminTickets />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-orders"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminOrders />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-refills"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminRefills />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-services"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminServices />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-terms"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminTerms />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-privacy"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminPrivacy />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-ai"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminAI />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-landing"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminLanding />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-seo"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminSEO />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-pwa"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminPWA />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-providers"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminProviders />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-category-icons"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminCategoryIcons />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-category-order"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminCategoryOrder />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-platforms"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminPlatforms />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-database"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminDatabase />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/mercadopago-settings"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <MercadoPagoSettings />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-contact"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminContact />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-store-frontends"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStoreFrontends />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-store-sections"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStoreSections />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-store-banners"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStoreBanners />
                    </AdminLayout>
                  </AdminRoute>
                }
              />

              <Route
                path="/admin-store-popups"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStorePopups />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-store-packages"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStorePackages />
                    </AdminLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin-store-orders"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStoreOrders />
                    </AdminLayout>
                  </AdminRoute>
                }
              />

              <Route
                path="/admin-store-users"
                element={
                  <AdminRoute>
                    <AdminLayout>
                      <AdminStoreUsers />
                    </AdminLayout>
                  </AdminRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
