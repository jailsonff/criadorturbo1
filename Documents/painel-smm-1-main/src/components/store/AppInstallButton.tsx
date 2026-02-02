import { Link, useLocation } from "react-router-dom";
import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Botão flutuante persistente para acesso à página /app.
 * - Aparece no desktop e no mobile.
 * - No mobile, fica acima do bottom-nav.
 */
export default function AppInstallButton() {
  const location = useLocation();

  // Evita mostrar o botão dentro da própria página.
  if (location.pathname === "/app") return null;

  return (
    <div
      className={
        "fixed right-4 z-50 " +
        // mobile: acima do bottom-nav (altura ~64px) + safe-area
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)] " +
        // desktop
        "md:bottom-6"
      }
    >
      <Button asChild className="gap-2 shadow-lg">
        <Link to="/app" aria-label="Abrir página do app">
          <Smartphone className="h-4 w-4" />
          App
        </Link>
      </Button>
    </div>
  );
}
