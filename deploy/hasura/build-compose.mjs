/**
 * Generates the docker-compose file for the AppShots blog backend.
 *
 * Written as a generator rather than typed by hand for one reason: the stack
 * bootstraps itself with two JSON payloads (the DDL and the whole Hasura
 * metadata), and a JSON syntax error inside a YAML block scalar inside a
 * Coolify textarea is not something you want to discover from a container log.
 * Here the payloads are built as objects and serialised, so they are valid by
 * construction, and this file is the reviewable copy of what runs.
 *
 * NO DOLLAR SIGNS IN THE SQL. Docker Compose interpolates `${...}` in the
 * compose file, and Coolify renders the file once before Compose sees it, so a
 * literal `$` has an ambiguous number of escapes. The slug/category CHECKs use
 * \A and \Z (Postgres constraint escapes) instead of ^ and $ for exactly that
 * reason — same meaning, no character that anything downstream wants to eat.
 * The two plpgsql bodies are single-quoted strings for the same reason, rather
 * than the usual $$ dollar quoting.
 */

// ---------------------------------------------------------------------------
// Column sets. Load-bearing — see the rationale on each role further down.
// ---------------------------------------------------------------------------

const POST_PUBLIC = [
  'id', 'slug', 'title', 'description', 'body_md', 'cover_image_url',
  'category', 'tags', 'audience', 'cta_override', 'status',
  'published_at', 'updated_at',
];

const POST_BOT_WRITE = [
  'external_id', 'title', 'slug', 'description', 'body_md', 'cover_image_url',
  'category', 'tags', 'audience', 'status', 'target_keyword',
  'ai_generated', 'ai_model',
];

const POST_BOT_READ = ['id', 'slug', 'external_id', 'status', 'published_at', 'updated_at'];

const POST_ADMIN_WRITE = [
  'external_id', 'slug', 'title', 'description', 'body_md', 'cover_image_url',
  'category', 'tags', 'audience', 'status', 'cta_override', 'target_keyword',
  'published_url', 'ai_generated', 'ai_model',
];

const POST_ALL = [
  'id', 'slug', 'title', 'description', 'body_md', 'cover_image_url', 'category',
  'tags', 'audience', 'status', 'cta_override', 'ai_generated', 'ai_model',
  'ai_review_notes', 'external_id', 'target_keyword', 'published_url',
  'published_at', 'created_at', 'updated_at',
];

const SETTINGS_PUBLIC = [
  'cta_end_enabled', 'cta_mid_enabled', 'cta_sticky_enabled',
  'analytics_enabled', 'ios_url', 'android_url',
];

const SETTINGS_ADMIN_WRITE = [...SETTINGS_PUBLIC, 'ai_personalization'];

const DRAFT_ONLY = { status: { _in: ['draft', 'pending_review'] } };
const PUBLISHED_ONLY = { status: { _eq: 'published' } };

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SLUG_SHAPE = "'\\A[a-z0-9]+(-[a-z0-9]+)*\\Z'";

const DDL = [
  `CREATE TABLE IF NOT EXISTS public.blog_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ ${SLUG_SHAPE}),
    title text NOT NULL,
    description text NOT NULL,
    body_md text NOT NULL,
    cover_image_url text,
    category text NOT NULL DEFAULT 'general' CHECK (category ~ ${SLUG_SHAPE}),
    tags text[] NOT NULL DEFAULT '{}',
    audience text NOT NULL DEFAULT 'general' CHECK (audience IN ('sponsor','maid','agency','general')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','archived')),
    cta_override jsonb,
    ai_generated boolean NOT NULL DEFAULT false,
    ai_model text,
    ai_review_notes text,
    external_id text UNIQUE,
    target_keyword text,
    published_url text,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `COMMENT ON TABLE public.blog_posts IS 'AppShots marketing blog articles. Anonymous reads published rows only. content_bot (the PyRunner publisher) files drafts and cannot publish. site_admin has full access.'`,

  `CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON public.blog_posts (status, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON public.blog_posts (category) WHERE status = 'published'`,

  `CREATE TABLE IF NOT EXISTS public.blog_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    cta_end_enabled boolean NOT NULL DEFAULT true,
    cta_mid_enabled boolean NOT NULL DEFAULT true,
    cta_sticky_enabled boolean NOT NULL DEFAULT false,
    ai_personalization boolean NOT NULL DEFAULT true,
    analytics_enabled boolean NOT NULL DEFAULT true,
    ios_url text,
    android_url text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `COMMENT ON TABLE public.blog_settings IS 'Global blog configuration, one row (id = true). ios_url and android_url stay NULL: AppShots is a web app with no store listing, and the CTA points at signup.'`,

  `INSERT INTO public.blog_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING`,

  // published_at is stamped once, on the first transition to published.
  // updated_at on every write. Neither is writable by any role.
  `CREATE OR REPLACE FUNCTION public.blog_posts_set_timestamps() RETURNS trigger AS 'BEGIN NEW.updated_at := now(); IF NEW.status = ''published'' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF; RETURN NEW; END;' LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS blog_posts_timestamps ON public.blog_posts`,
  `CREATE TRIGGER blog_posts_timestamps BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.blog_posts_set_timestamps()`,

  `CREATE OR REPLACE FUNCTION public.blog_settings_set_updated_at() RETURNS trigger AS 'BEGIN NEW.updated_at := now(); RETURN NEW; END;' LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS blog_settings_updated_at ON public.blog_settings`,
  `CREATE TRIGGER blog_settings_updated_at BEFORE UPDATE ON public.blog_settings FOR EACH ROW EXECUTE FUNCTION public.blog_settings_set_updated_at()`,
].join(';\n') + ';';

if (DDL.includes('$')) throw new Error('the DDL contains a dollar sign — see the header comment');

// ---------------------------------------------------------------------------
// Metadata. replace_metadata is declarative and idempotent: it states what the
// tracked tables and permissions should be, so re-running the bootstrap on
// every deploy converges instead of erroring on "already tracked".
// ---------------------------------------------------------------------------

const metadata = {
  version: 3,
  sources: [
    {
      name: 'default',
      kind: 'postgres',
      configuration: {
        connection_info: {
          // from_env, not the literal URL: the password stays in the container
          // environment and never lands in exported metadata.
          database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' },
          isolation_level: 'read-committed',
          use_prepared_statements: true,
        },
      },
      tables: [
        {
          table: { schema: 'public', name: 'blog_posts' },
          select_permissions: [
            // anonymous is the unauthorized role, so this is what the site's
            // build reads with no secret at all. `status` is in the column list
            // because Hasura only lets a role reference columns it can SELECT
            // inside `where` — and the build filters on status. It leaks
            // nothing: the row filter already pins every visible row to
            // published.
            { role: 'anonymous', permission: { columns: POST_PUBLIC, filter: PUBLISHED_ONLY, allow_aggregations: false } },
            // The publisher's upsert returns { id slug }, and Hasura will not
            // return a column the role cannot read — without this the write
            // itself fails. Filter {} so it can read back its own drafts.
            { role: 'content_bot', permission: { columns: POST_BOT_READ, filter: {} } },
            { role: 'site_admin', permission: { columns: POST_ALL, filter: {}, allow_aggregations: true } },
          ],
          insert_permissions: [
            { role: 'content_bot', permission: { check: DRAFT_ONLY, columns: POST_BOT_WRITE } },
            { role: 'site_admin', permission: { check: {}, columns: POST_ADMIN_WRITE } },
          ],
          update_permissions: [
            // The check pins the bot to drafts: it files articles, a person
            // publishes them. The permission must exist at all for Hasura to
            // put the on_conflict argument in the schema, which is what makes
            // the publisher's upsert idempotent.
            { role: 'content_bot', permission: { columns: POST_BOT_WRITE, filter: {}, check: DRAFT_ONLY } },
            { role: 'site_admin', permission: { columns: POST_ADMIN_WRITE, filter: {}, check: {} } },
          ],
          delete_permissions: [
            { role: 'site_admin', permission: { filter: {} } },
          ],
        },
        {
          table: { schema: 'public', name: 'blog_settings' },
          select_permissions: [
            { role: 'anonymous', permission: { columns: SETTINGS_PUBLIC, filter: {} } },
            { role: 'site_admin', permission: { columns: [...SETTINGS_ADMIN_WRITE, 'updated_at'], filter: {} } },
          ],
          update_permissions: [
            { role: 'site_admin', permission: { columns: SETTINGS_ADMIN_WRITE, filter: {}, check: {} } },
          ],
          // content_bot gets nothing here at all: its whole job is blog_posts.
        },
      ],
    },
  ],
};

const ddlPayload = JSON.stringify({
  type: 'run_sql',
  args: { source: 'default', cascade: false, read_only: false, sql: DDL },
});

const metadataPayload = JSON.stringify({
  type: 'replace_metadata',
  args: { allow_inconsistent_metadata: false, metadata },
});

for (const [name, payload] of [['ddl', ddlPayload], ['metadata', metadataPayload]]) {
  JSON.parse(payload); // valid by construction, asserted anyway
  if (payload.includes('\n')) throw new Error(`${name} payload must be one line`);
  if (payload.includes('$')) throw new Error(`${name} payload contains a dollar sign`);
}

// ---------------------------------------------------------------------------
// The compose file
// ---------------------------------------------------------------------------

const compose = `# AppShots blog backend — Hasura + its own Postgres.
#
# ISOLATED BY DESIGN. This stack exists because AppShots had no SQL database at
# all (the app itself runs on Firebase), and the PyRunner blog chain speaks
# Hasura. It shares nothing with First Bite's Hasura, the Ethiopian Maids
# Hasura, or any Supabase stack: its own container, its own Postgres, its own
# admin secret, its own volume.
#
# The passwords are Coolify SERVICE_PASSWORD_* variables, which Coolify
# generates and stores; nobody types them and they appear nowhere else.
#
# The schema service applies the tables and the whole Hasura metadata on every
# deploy. It is declarative and idempotent — replace_metadata states what the
# permissions should be rather than adding to them — so a redeploy is also the
# way to put the permissions back if someone changes them by hand.
services:
  postgres:
    image: 'postgres:16-alpine'
    restart: unless-stopped
    environment:
      POSTGRES_DB: appshots_blog
      POSTGRES_USER: appshots
      POSTGRES_PASSWORD: '\${SERVICE_PASSWORD_APPSHOTSBLOGPG}'
    volumes:
      - 'appshots-blog-pgdata:/var/lib/postgresql/data'
    healthcheck:
      test:
        - CMD-SHELL
        - 'pg_isready -U appshots -d appshots_blog'
      interval: 10s
      timeout: 5s
      retries: 10

  hasura:
    image: 'hasura/graphql-engine:v2.49.0'
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      SERVICE_FQDN_HASURA_8080: /
      HASURA_GRAPHQL_DATABASE_URL: 'postgres://appshots:\${SERVICE_PASSWORD_APPSHOTSBLOGPG}@postgres:5432/appshots_blog'
      HASURA_GRAPHQL_METADATA_DATABASE_URL: 'postgres://appshots:\${SERVICE_PASSWORD_APPSHOTSBLOGPG}@postgres:5432/appshots_blog'
      HASURA_GRAPHQL_ADMIN_SECRET: '\${SERVICE_PASSWORD_64_APPSHOTSBLOGADMIN}'
      # Unauthenticated requests are the anonymous role, which can read
      # published articles and nothing else. That is what lets the AppShots
      # build fetch posts without holding a secret.
      HASURA_GRAPHQL_UNAUTHORIZED_ROLE: anonymous
      # The console is how a person publishes a draft. It is behind the admin
      # secret; dev mode stays off so errors do not leak internals.
      HASURA_GRAPHQL_ENABLE_CONSOLE: 'true'
      HASURA_GRAPHQL_DEV_MODE: 'false'
      HASURA_GRAPHQL_ENABLE_TELEMETRY: 'false'
      HASURA_GRAPHQL_LOG_LEVEL: warn
      HASURA_GRAPHQL_ENABLED_LOG_TYPES: 'startup,http-log,webhook-log,websocket-log'
    healthcheck:
      test:
        - CMD-SHELL
        - 'curl -fsS http://127.0.0.1:8080/healthz || exit 1'
      interval: 15s
      timeout: 5s
      retries: 10

  schema:
    image: 'curlimages/curl:8.11.1'
    restart: 'no'
    exclude_from_hc: true
    depends_on:
      hasura:
        condition: service_healthy
    environment:
      ADMIN_SECRET: '\${SERVICE_PASSWORD_64_APPSHOTSBLOGADMIN}'
    entrypoint:
      - /bin/sh
      - '-c'
    command:
      - |
        set -e
        cat > /tmp/ddl.json <<'PAYLOAD'
        ${ddlPayload}
        PAYLOAD
        cat > /tmp/metadata.json <<'PAYLOAD'
        ${metadataPayload}
        PAYLOAD
        echo "applying schema"
        curl -sS -f -X POST http://hasura:8080/v2/query \\
          -H "x-hasura-admin-secret: $$ADMIN_SECRET" \\
          -H 'Content-Type: application/json' --data-binary @/tmp/ddl.json
        echo
        echo "applying metadata"
        curl -sS -f -X POST http://hasura:8080/v1/metadata \\
          -H "x-hasura-admin-secret: $$ADMIN_SECRET" \\
          -H 'Content-Type: application/json' --data-binary @/tmp/metadata.json
        echo
        echo "schema and permissions are in place"
`;

process.stdout.write(compose);
