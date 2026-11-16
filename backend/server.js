// Vercel entry for the API (the `backend` service in /vercel.json).
// Vercel first runs `npm run build` (src/ → dist/), then serves the compiled app
// below. This file must stay in the repository: dist/ is built, never committed,
// so Vercel can only detect the Express service through a file that already exists.
// Locally and in Docker the API starts from dist/index.js instead (`npm start`).
import express from 'express'; // lets Vercel's Express preset recognise this entry

let app;
try {
  app = (await import('./dist/serverless.js')).default;
} catch (err) {
  // Instead of a bare FUNCTION_INVOCATION_FAILED, answer every request with the
  // reason (e.g. a missing environment variable — names only, never values).
  console.error('VELORA API failed to start:', err);
  const reason = String(err?.message ?? err).split('\n').join(' ').slice(0, 400);
  app = express();
  app.use((_req, res) => {
    res.status(503).json({ error: { code: 'API_START_FAILED', message: 'The store API could not start. Check the Vercel function logs.', reason } });
  });
}

export default app;
