/**
 * Server entry, used only by the build (scripts/prerender.mjs).
 *
 * It renders a route to HTML in Node, with no browser involved, so each public
 * page can ship with its content already in the response. Deliberately NOT
 * main.jsx: that one calls createRoot and imports the stylesheets, neither of
 * which means anything here — the built CSS is already linked from index.html.
 *
 * Anything that needs a browser must stay inside an effect or an event
 * handler. Effects do not run during this render, which is what makes the
 * app's providers safe to mount here: AuthProvider and TeamProvider only reach
 * the backend from a useEffect, so on the server they render their signed-out
 * state, which is exactly what an anonymous crawler should be shown.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import App from "./App.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import { TeamProvider } from "./lib/teamContext.jsx";

/**
 * @param {string} url the route to render, e.g. "/pricing"
 * @returns {string} the markup for <div id="root">
 */
export function render(url) {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <AuthProvider>
          <TeamProvider>
            <App />
          </TeamProvider>
        </AuthProvider>
      </StaticRouter>
    </StrictMode>,
  );
}
