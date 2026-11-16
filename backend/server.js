// Vercel entry for the API (the `backend` service in /vercel.json).
// Vercel first runs `npm run build` (src/ → dist/), then serves the compiled app
// below. This file must stay in the repository: dist/ is built, never committed,
// so Vercel can only detect the Express service through a file that already exists.
// Locally and in Docker the API starts from dist/index.js instead (`npm start`).
//
// No top-level `await` anywhere in the API: Vercel may load this file with
// require(), which cannot load modules that use it (ERR_REQUIRE_ASYNC_MODULE).
import express from 'express'; // lets Vercel's Express preset recognise this entry

let api = null;
let reason = null;

// Keep the function alive and report errors that happen outside a request,
// instead of Vercel showing a bare FUNCTION_INVOCATION_FAILED.
const record = (kind) => (err) => {
  console.error(`VELORA API ${kind}:`, err);
  reason ??= `${kind}: ${String(err?.message ?? err).split('\n').join(' ').slice(0, 400)}`;
};
process.on('uncaughtException', record('uncaught exception'));
process.on('unhandledRejection', record('unhandled rejection'));
const loading = import('./dist/serverless.js').then(
  (mod) => {
    api = mod.default;
  },
  (err) => {
    // Instead of a bare FUNCTION_INVOCATION_FAILED, answer with the reason
    // (e.g. a missing environment variable — names only, never values).
    console.error('VELORA API failed to start:', err);
    reason = String(err?.message ?? err).split('\n').join(' ').slice(0, 400);
  },
);

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (api) return api(req, res, next);
  loading.then(() => {
    if (api) return api(req, res, next);
    res.status(503).json({ error: { code: 'API_START_FAILED', message: 'The store API could not start. Check the Vercel function logs.', reason } });
  });
});

export default app;
