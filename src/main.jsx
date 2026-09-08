import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import { TeamProvider } from "./lib/teamContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { installErrorReporting } from "./lib/errorReporter.js";
import CookieBanner from "./components/CookieBanner.jsx";
import { initAnalytics } from "./lib/analytics.js";
// Self-hosted Inter (same-origin) so html-to-image can embed the font into
// exports — a cross-origin Google Fonts link fails cssRules access and drops the
// font from rendered PNGs. Latin subset, weights used across the app + templates.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-900.css";
import "./index.css";

// Catches what React's boundary cannot: async throws, event handlers, promises.
installErrorReporting();

// No-op unless this visitor has already accepted; the banner starts it otherwise.
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TeamProvider>
            <App />
            <CookieBanner />
          </TeamProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
