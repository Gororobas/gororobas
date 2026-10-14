interface DocsEnv {
  readonly ASSETS: {
    fetch(input: Request): Promise<Response>;
  };
}

const AUTH = "/auth";

// HTML handling would 307 these to /auth/. The canonical home is a permanent redirect.
const homeRedirect = (pathname: string): boolean =>
  pathname === AUTH || pathname === `${AUTH}/index` || pathname === `${AUTH}/index.html`;

// 404.html is a real asset, so these URLs would otherwise answer 200 or redirect to it.
const notFoundDocument = (pathname: string): boolean =>
  pathname === `${AUTH}/404` ||
  pathname === `${AUTH}/404/` ||
  pathname === `${AUTH}/404.html` ||
  pathname === `${AUTH}/404/index.html`;

// Asset lookup keeps the /auth prefix. If a redirect comes back without it, put it back
// before the browser leaves this Worker.
const restoreAuthPrefix = (location: string, publicUrl: URL): string => {
  const target = new URL(location, publicUrl);

  if (target.origin !== publicUrl.origin) {
    return location;
  }

  if (target.pathname === AUTH || target.pathname.startsWith(`${AUTH}/`)) {
    return target.toString();
  }

  const suffix = target.pathname.startsWith("/") ? target.pathname : `/${target.pathname}`;

  target.pathname = `${AUTH}${suffix}`;

  return target.toString();
};

const redirectWithAuthPrefix = (asset: Response, publicUrl: URL): Response => {
  const location = asset.headers.get("Location");

  if (location === null || asset.status < 300 || asset.status >= 400) {
    return asset;
  }

  const headers = new Headers(asset.headers);

  headers.set("Location", restoreAuthPrefix(location, publicUrl));

  return new Response(asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
};

export default {
  async fetch(request: Request, env: DocsEnv): Promise<Response> {
    const url = new URL(request.url);

    if (homeRedirect(url.pathname)) {
      url.pathname = `${AUTH}/`;

      return Response.redirect(url, 308);
    }

    if (notFoundDocument(url.pathname)) {
      const pageUrl = new URL(url);

      pageUrl.pathname = `${AUTH}/404`;
      const page = await env.ASSETS.fetch(new Request(pageUrl, request));
      const headers = new Headers(page.headers);

      headers.delete("Location");

      return new Response(page.body, {
        status: 404,
        statusText: "Not Found",
        headers,
      });
    }

    const asset = await env.ASSETS.fetch(request);

    return redirectWithAuthPrefix(asset, url);
  },
};
