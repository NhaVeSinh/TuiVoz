/** Analytics signals. */

import { api } from '../api.js';
import { isDataSaving } from './dataSaving.js';
import { state } from '../core/dom.js';

const queue = [];
let timer = null;

function flush() {
  if (!queue.length || !state.loggedIn) { queue.length = 0; return; }
  const events = queue.splice(0, queue.length);
  api.signals(events).catch(() => {});
}

export function signal(event) {
  // Data-saving skips analytics POSTs; nothing user-visible depends on them.
  if (!state.loggedIn || !event?.type || isDataSaving()) return;
  queue.push({ timestamp: Math.floor(Date.now() / 1000), ...event });
  clearTimeout(timer);
  timer = setTimeout(flush, 5000);
  if (queue.length >= 20) flush();
}

export const signalImpression = (threadId, surface, position) =>
  signal({ type: 'impression', thread_id: Number(threadId), surface, position });
export const signalOpen = (threadId, source, position) =>
  signal({ type: 'open', thread_id: Number(threadId), source: source || 'other', position });
export const signalRead = (threadId, seconds, posts, depth, pages) =>
  signal({ type: 'read', thread_id: Number(threadId), seconds, posts, depth, pages });

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
