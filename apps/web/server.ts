// Production static server for the built SPA. Deliberately tiny: Caddy already
// terminates TLS, compresses and routes /api, so this only has to serve files.
const PORT = Number(process.env.PORT ?? 8080);
const DIST = `${import.meta.dir}/dist`;

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

function robots(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function sitemap(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
</urlset>
`;
}

/** Built from the request, so no domain is ever baked into the image. */
function originOf(req: Request): string {
  const headers = req.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost";
  const proto = headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export default {
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);

    if (path === "/robots.txt") {
      return new Response(robots(originOf(req)), {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (path === "/sitemap.xml") {
      return new Response(sitemap(originOf(req)), {
        headers: { "content-type": "application/xml; charset=utf-8" },
      });
    }

    // Traversal guard. A decoded ".." or NUL can escape DIST; everything
    // suspicious falls through to the SPA shell rather than reading a file.
    const safe = !path.includes("..") && !path.includes("\0");
    const file = safe && path !== "/" ? Bun.file(DIST + path) : null;

    if (file && (await file.exists())) {
      return new Response(file, {
        headers: {
          // Vite fingerprints everything under /assets, so it can be cached
          // forever. The shell must not be, or a deploy never reaches anyone.
          "cache-control": path.startsWith("/assets/") ? IMMUTABLE : REVALIDATE,
        },
      });
    }

    const shell = Bun.file(`${DIST}/index.html`);
    return new Response(shell, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": REVALIDATE },
    });
  },
};
