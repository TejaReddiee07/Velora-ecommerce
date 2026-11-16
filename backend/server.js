// Vercel entry for the API (the `backend` service in /vercel.json).
// Vercel first runs `npm run build` (src/ → dist/), then serves the compiled app
// below. This file must stay in the repository: dist/ is built, never committed,
// so Vercel can only detect the Express service through a file that already exists.
// Locally and in Docker the API starts from dist/index.js instead (`npm start`).
import express from 'express'; // lets Vercel's Express preset recognise this entry
import app from './dist/serverless.js';

void express;
export default app;
