// Vercel entry for the API (the `backend` service in /vercel.json).
// Vercel first runs `npm run build` (src/ → dist/), then serves the compiled app
// below. This file must stay in the repository: dist/ is built, never committed,
// so Vercel can only detect the Express service through a file that already exists.
// Locally and in Docker the API starts from dist/index.js instead (`npm start`).
//
// No top-level `await` anywhere in the API: Vercel may load this file with
// require(), which cannot load modules that use it (ERR_REQUIRE_ASYNC_MODULE).
import express from 'express'; // lets Vercel's Express preset recognise this entry
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let api = null;
let reason = null;
let loading = null;

// Keep the function alive and report errors that happen outside a request,
// instead of Vercel showing a bare FUNCTION_INVOCATION_FAILED.
const record = (kind) => (err) => {
  console.error(`VELORA API ${kind}:`, err);
  reason ??= `${kind}: ${String(err?.message ?? err).split('\n').join(' ').slice(0, 400)}`;
};
process.on('uncaughtException', record('uncaught exception'));
process.on('unhandledRejection', record('unhandled rejection'));

/**
 * Loads the compiled API on first use; a failure is reported, not fatal.
 * The path is built at runtime on purpose: a literal './dist/serverless.js' lets
 * Vercel's bundler pull the whole API into this file and run it at load time,
 * where any error (a missing setting, a native module) kills the function before
 * it can report anything.
 */
function load() {
  loading ??= Promise.resolve()
    .then(() => import(/* @vite-ignore */ /* webpackIgnore: true */ pathToFileURL(path.join(here(), 'dist', 'serverless.js')).href))
    .then(
    (mod) => {
      api = mod.default;
    },
    (err) => {
      console.error('VELORA API failed to start:', err);
      reason ??= `${err?.code ? `${err.code}: ` : ''}${String(err?.message ?? err).split('\n').join(' ').slice(0, 400)}`;
    },
  );
  return loading;
}

function here() {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname === 'string' ? __dirname : process.cwd();
  }
}

const app = express();
app.disable('x-powered-by');

// TEMPORARY deployment check (remove once the live site works): safe facts only —
// versions, paths, and whether required settings exist (never their values).
app.get('/api/__diag', (_req, res) => {
  const dir = here();
  const names = ['MONGODB_URI', 'SESSION_SECRET', 'STRIPE_SECRET_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
  res.json({
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cwd: process.cwd(),
    entryDir: dir,
    distBuilt: fs.existsSync(path.join(dir, 'dist', 'serverless.js')),
    packagesShipped: ['express', 'mongoose', 'argon2', 'sharp'].map((p) => `${p}:${fs.existsSync(path.join(dir, 'node_modules', p))}`).join(' '),
    vercelMarker: process.env.VERCEL ?? null,
    settingsPresent: Object.fromEntries(names.map((k) => [k, Boolean(process.env[k]?.trim())])),
    apiLoaded: Boolean(api),
    startupProblem: reason,
  });
});

app.use((req, res, next) => {
  if (api) return api(req, res, next);
  load().then(() => {
    if (api) return api(req, res, next);
    res.status(503).json({ error: { code: 'API_START_FAILED', message: 'The store API could not start. Check the Vercel function logs.', reason } });
  });
});

export default app;
