/**
 * Vite plugin: serves the /api/* proxy from the dev server so API keys stay on
 * the Node side and never enter the browser bundle. Same router is reusable for
 * a production Node/serverless wrapper later.
 */
import { route } from "./router.js";

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function apiProxyPlugin() {
  return {
    name: "appshots-api-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        try {
          const u = new URL(req.url, "http://localhost");
          const query = Object.fromEntries(u.searchParams);
          const body = req.method === "POST" ? await readJson(req) : {};
          const result = await route({ method: req.method, path: u.pathname, query, body });
          res.statusCode = result.status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result.body));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "proxy-error", detail: String(e?.message || e) }));
        }
      });
    },
  };
}
