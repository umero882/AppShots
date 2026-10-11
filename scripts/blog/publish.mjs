/**
 * Publishes a hand-written article from content/blog/ to the blog Hasura.
 *
 *   HASURA_ADMIN_SECRET=… node scripts/blog/publish.mjs content/blog/<slug>.md [--draft]
 *
 * Most articles come from the PyRunner pipeline, which can only file drafts.
 * This is for the ones a person writes — feature announcements, guides — and
 * it authenticates as site_admin, so the secret is read from the environment
 * and never from a file in the repo. Upserts on slug, so re-running after an
 * edit updates the live article instead of duplicating it.
 *
 * The site picks the article up on its next build: PyRunner's blog-deploy
 * notices the database and the site disagree within ten minutes, or any push
 * to main rebuilds it.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEFAULT_ENDPOINT } from "./posts.mjs";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `---` front matter (flat `key: value`, optional quotes, comma lists for tags) + markdown body. */
export function parseArticle(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error("article: missing --- front matter ---");
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^".*"$/.test(value)) value = value.slice(1, -1).replace(/\\"/g, '"');
    meta[kv[1]] = value;
  }
  for (const key of ["slug", "title", "description"]) {
    if (!meta[key]) throw new Error(`article: front matter needs "${key}"`);
  }
  if (!SLUG.test(meta.slug)) throw new Error(`article: slug ${JSON.stringify(meta.slug)} is not kebab-case`);
  const body = match[2].trim();
  if (!body) throw new Error("article: body is empty");
  return {
    slug: meta.slug,
    title: meta.title,
    description: meta.description,
    category: meta.category || "general",
    tags: meta.tags ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    audience: "general",
    body_md: `${body}\n`,
  };
}

const MUTATION = `
  mutation PublishPost($post: blog_posts_insert_input!) {
    insert_blog_posts_one(
      object: $post
      on_conflict: {
        constraint: blog_posts_slug_key
        update_columns: [title, description, body_md, category, tags, audience, status]
      }
    ) { id slug status published_at }
  }
`;

async function main([file, ...flags]) {
  if (!file) throw new Error("usage: node scripts/blog/publish.mjs content/blog/<slug>.md [--draft]");
  const secret = process.env.HASURA_ADMIN_SECRET;
  if (!secret) throw new Error("set HASURA_ADMIN_SECRET (Coolify → AppShots → appshots-hasura → environment)");
  const post = {
    ...parseArticle(readFileSync(file, "utf8")),
    status: flags.includes("--draft") ? "draft" : "published",
  };
  const endpoint = process.env.BLOG_HASURA_URL || DEFAULT_ENDPOINT;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hasura-admin-secret": secret },
    body: JSON.stringify({ query: MUTATION, variables: { post } }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.errors?.length) {
    throw new Error(`publish failed (${res.status}): ${payload.errors?.map((e) => e.message).join("; ") || "no body"}`);
  }
  const row = payload.data.insert_blog_posts_one;
  console.log(`${row.status}: /blog/${row.slug} (id ${row.id}, published_at ${row.published_at ?? "—"})`);
  console.log("Live after the next build — blog-deploy runs every 10 min, or push to main.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
