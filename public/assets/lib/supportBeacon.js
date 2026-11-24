// Mimics voz.vn's adblock-detection beacon so browsing through TuiVoz counts toward the supporter score
// like reading voz.vn with ads allowed. voz.vn fires this once per page load (10% sample) from an inline
// script: GET /xfmg.php?s=<seg>&n=<rand>, where <seg> is "<m|d>:<u|g>:p<p>b<b>r<r>e<early>". A clean report
// is p1 (powerAPITag ready) b0 (decoy ad not hidden) r1 (pubpower script reachable) e0 (not early flush).
//
// The request is a plain cross-origin Image: /xfmg.php answers 204 with no CORS needs, and xf_session is
// SameSite=None so the browser attaches the voz.vn login when the reader also has one (every OAuth login
// happens on voz.vn, so TuiVoz users do). Attribution is impossible to verify client-side — the endpoint
// is opaque — so the flag only claims what a clean session would report.
//
// Gated by the `vozSupport` setting (default off) and `state.loggedIn`; when off, nothing is sent.

import { state } from '../core/dom.js';
import { getVozSupport } from './settings.js';

const ENDPOINT = 'https://voz.vn/xfmg.php';
// voz.vn samples 10% of page loads; one ping per route change would over-report even for heavy readers,
// so keep a floor between pings.
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
