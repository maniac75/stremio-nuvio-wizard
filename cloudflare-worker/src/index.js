// Optional Cloudflare Worker that proxies a public workers.dev URL to the Node server.
// Set the origin as a secret so it never lives in the repository:
//   npx wrangler secret put ORIGIN   (e.g. https://your-server.example.com)

export default {
  async fetch(request, env) {
    if (!env.ORIGIN) return new Response('ORIGIN is not configured', { status: 500 });
    const ORIGIN = new URL(env.ORIGIN).origin;
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, ORIGIN);

    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));

    const init = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

    const upstream = await fetch(new Request(target.toString(), init));
    const outHeaders = new Headers(upstream.headers);
    const location = outHeaders.get('Location');
    if (location) {
      try {
        const redirectUrl = new URL(location, target);
        if (redirectUrl.origin === ORIGIN) {
          redirectUrl.protocol = incoming.protocol;
          redirectUrl.host = incoming.host;
          outHeaders.set('Location', redirectUrl.toString());
        }
      } catch (_) {}
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders
    });
  }
};
