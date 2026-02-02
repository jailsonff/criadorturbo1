import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { safeSetItem } from "@/lib/safeStorage";

function serializeUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  }
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Capture unexpected crashes (especially common in mobile webviews) so we can diagnose the root cause.
window.addEventListener("error", (event) => {
  safeSetItem(
    "last_client_error",
    JSON.stringify({
      type: "error",
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serializeUnknownError((event as any).error),
      at: new Date().toISOString(),
    }),
  );
});

window.addEventListener("unhandledrejection", (event) => {
  safeSetItem(
    "last_client_error",
    JSON.stringify({
      type: "unhandledrejection",
      reason: serializeUnknownError((event as PromiseRejectionEvent).reason),
      at: new Date().toISOString(),
    }),
  );
});

createRoot(document.getElementById("root")!).render(<App />);
