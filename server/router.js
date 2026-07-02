/**
 * Transport-agnostic API router. Maps (method, path) to a handler and normalizes
 * errors to { status, body }. Reused by the Vite dev middleware now and by any
 * Node/serverless wrapper later — no host-specific types leak in here.
 */
import { capabilities, suggest, image, search, translate, appStore, statusForError } from "./handlers.js";

const ok = (body) => ({ status: 200, body });

export async function route({ method, path, query = {}, body = {} }) {
  try {
    if (method === "GET" && path === "/api/capabilities") return ok(capabilities());
    if (method === "POST" && path === "/api/ai/suggest") return ok(await suggest(body));
    if (method === "POST" && path === "/api/ai/image") return ok(await image(body));
    if (method === "POST" && path === "/api/ai/translate") return ok(await translate(body));
    if (method === "GET" && path === "/api/search") return ok(await search(query.q || ""));
    if (method === "GET" && path === "/api/app-store") return ok(await appStore(query));
    return { status: 404, body: { error: "not-found" } };
  } catch (e) {
    return { status: statusForError(e.message), body: { error: e.message } };
  }
}
