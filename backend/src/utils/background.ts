import { waitUntil } from '@vercel/functions';

/**
 * Lets work started during a request (emails, maintenance) finish after the
 * response has been sent.
 *  - On Vercel: tells the platform to keep the function alive until it settles.
 *  - Anywhere else (long-running server, Docker, tests): the promise simply runs.
 */
export function keepAlive(work: Promise<unknown>) {
  if (process.env.VERCEL) waitUntil(work);
}
