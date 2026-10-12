// CORS proxy for ViaggiaTreno, deployed on Deno Deploy (playground).
// ViaggiaTreno has no CORS headers and is HTTP only; its Akamai WAF refuses
// non-browser User-Agents and Cloudflare egress (Workers, corsproxy.io).
const UPSTREAM = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
const ALLOWED_PATHS = /^\/(partenze|andamentoTreno)\//;
const ALLOWED_ORIGINS = new Set(['https://lamasfoker.github.io', 'http://localhost:8901']);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors: Record<string, string> = ALLOWED_ORIGINS.has(origin)
    ? { 'access-control-allow-origin': origin, vary: 'origin' }
    : {};
  const { pathname } = new URL(req.url);
  if (req.method !== 'GET' || !ALLOWED_PATHS.test(pathname)) {
    return new Response('not found', { status: 404, headers: cors });
  }
  const res = await fetch(UPSTREAM + pathname, { headers: { 'user-agent': UA, accept: 'application/json' } });
  return new Response(res.body, {
    status: res.status,
    headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  });
});
