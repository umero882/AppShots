/**
 * Reads published articles out of the AppShots blog Hasura at build time.
 *
 * The endpoint is queried with no credential at all. That is deliberate: the
 * `anonymous` role can read published rows and nothing else (see
 * deploy/hasura/README.md), so nothing secret has to travel into a build
 * environment for the blog to render. It also means this fetch can never see a
 * draft, which is the guarantee that the review step is real.
 *
 * WHAT HAPPENS WHEN THE FETCH FAILS
 * ---------------------------------
 * The build stops. This is the one decision here worth defending, because the
 * comfortable alternative — warn and carry on — is how the same blog silently
 * disappeared from a sibling project: the fetch failed, the build reported
 * success, the deploy went out, and every article 404'd until someone noticed
 * by hand. A blog that vanishes without failing anything is worse than a deploy
 * that stops.
 *
 * The escape hatch is BLOG_OPTIONAL=1, for the case where the site genuinely
 * has to ship while Hasura is down. It is loud in the build log and it is a
 * choice someone makes on purpose.
 *
 * Zero published articles is NOT a failure — it is where the blog starts.
 */

import { renderMarkdown, readingMinutes } from "./markdown.mjs";

export const DEFAULT_ENDPOINT = "https://hasura-appshots.76.13.240.144.sslip.io/v1/graphql";

/**
 * Exactly the columns the anonymous role may read. Asking for one more makes
 * Hasura reject the whole query, which would take the blog down rather than
 * degrade it — so this list and the metadata in deploy/hasura/ move together.
 */
const QUERY = `
  query PublishedPosts {
    blog_posts(
      where: { status: { _eq: "published" } }
      order_by: { published_at: desc }
    ) {
      id
      slug
      title
      description
      body_md
      cover_image_url
      category
      tags
      audience
      published_at
      updated_at
    }
  }
`;

/** The same shape the database CHECK enforces, re-checked before it is a path. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function shape(row) {
  if (!SLUG.test(String(row.slug || ""))) {
    // The column has this CHECK on it, so reaching here means something is very
    // wrong upstream. Worth failing over: the slug becomes a directory name.
    throw new Error(`blog: refusing the slug ${JSON.stringify(row.slug)} — it would become a path`);
  }
  const body = row.body_md || "";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    html: renderMarkdown(body),
    coverImageUrl: row.cover_image_url || null,
    category: row.category || "general",
    tags: Array.isArray(row.tags) ? row.tags : [],
    audience: row.audience || "general",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readingMinutes: readingMinutes(body),
    path: `/blog/${row.slug}`,
  };
}

/**
 * @returns {Promise<{posts: object[], endpoint: string, skipped?: string}>}
 */
export async function fetchPosts({
  endpoint = process.env.BLOG_HASURA_URL || DEFAULT_ENDPOINT,
  optional = process.env.BLOG_OPTIONAL === "1",
  timeoutMs = 20000,
} = {}) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return giveUp(`could not reach ${endpoint}: ${error.message}`, { optional, endpoint });
  }

  if (!response.ok) {
    return giveUp(`${endpoint} answered ${response.status}`, { optional, endpoint });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return giveUp(`${endpoint} did not return JSON: ${error.message}`, { optional, endpoint });
  }

  if (payload.errors?.length) {
    // Almost always a permission drift: a column left the anonymous allowlist,
    // so say which one rather than "GraphQL error".
    const detail = payload.errors.map((e) => e.message).join("; ");
    return giveUp(`${endpoint} rejected the query: ${detail}`, { optional, endpoint });
  }

  const rows = payload.data?.blog_posts;
  if (!Array.isArray(rows)) {
    return giveUp(`${endpoint} returned no blog_posts field`, { optional, endpoint });
  }

  return { posts: rows.map(shape), endpoint };
}

function giveUp(reason, { optional, endpoint }) {
  if (!optional) {
    throw new Error(
      `blog: ${reason}\n` +
        `      The build stops here rather than shipping a site with no blog and no error.\n` +
        `      Set BLOG_OPTIONAL=1 to deploy without it on purpose.`
    );
  }
  return { posts: [], endpoint, skipped: reason };
}
