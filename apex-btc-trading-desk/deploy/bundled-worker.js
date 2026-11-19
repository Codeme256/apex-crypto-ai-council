import worker from './desk.js';
import assets from './assets.js';

export default {
  scheduled: worker.scheduled,
  fetch(request, env) {
    return worker.fetch(request, {
      JOURNAL: env.JOURNAL,
      ASSETS: {
        async fetch(assetRequest) {
          if (assetRequest.method !== 'GET' && assetRequest.method !== 'HEAD') {
            return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
          }
          const path = new URL(assetRequest.url).pathname;
          const name = path === '/' ? '/index.html' : path;
          if (!Object.hasOwn(assets, name)) return new Response(null, { status: 404 });

          const [type, encoded] = assets[name];
          const compressed = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
          const body = assetRequest.method === 'HEAD' ? null :
            new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
          return new Response(body, {
            headers: {
              'Content-Type': type + '; charset=utf-8',
              'Cache-Control': type === 'text/html' ? 'no-cache' : 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        },
      },
    });
  },
};
