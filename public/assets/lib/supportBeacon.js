/** Supporter beacon. */

import { state } from '../core/dom.js';
import { getVozSupport } from './settings.js';

// Via /forum proxy: carries the proxied xf session (direct voz.vn hits would
// be guest — xf_* cookies live on this origin — and fail where voz is blocked).
const ENDPOINT = '/forum/xfmg.php';
// voz.vn samples 10% of loads; a floor between pings avoids over-reporting.
const MIN_INTERVAL_MS = 60_000;

let lastSentAt = 0;

export function supportPing() {
  if (!getVozSupport() || !state.loggedIn) return;
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return;
  lastSentAt = now;
  const device = matchMedia('(max-width: 650px)').matches ? 'm' : 'd';
  const img = new Image();
  img.src = `${ENDPOINT}?s=${device}:u:p1b0r1e0&n=${Math.random().toString(36).slice(2)}`;
}
