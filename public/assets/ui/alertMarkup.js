/** Alert markup. */
import { esc } from '../core/utils.js';
import { api } from '../api.js';
import { cachedCatalog } from '../lib/catalogs.js';
import { state } from '../core/dom.js';

// Shared cached catalog, seeded by views/thread.js.
async function reactionsCatalog() {
  if (state.reactions) return state.reactions;
  try {
    state.reactions = await cachedCatalog('reactions', () => api.reactions().then((res) => res.reactions || []));
  } catch {
    // Leave state.reactions unset so a later alert can retry.
    return [];
  }
  return state.reactions;
}

export async function alertTextMarkup(alert) {
  const text = alert.alert_text || alert.content_title || '';
  if (alert.action !== 'reaction' || !alert.reaction_title) return esc(text);
  const reaction = (await reactionsCatalog()).find((item) => item.title === alert.reaction_title);
  if (!reaction) return esc(text);
  const suffix = `with ${alert.reaction_title}.`;
  if (!text.endsWith(suffix)) return esc(text);
  return `${esc(text.slice(0, -suffix.length))}<img src="${esc(reaction.image_url)}" alt="${esc(reaction.title)}" title="${esc(reaction.title)}" class="reaction-image alert-reaction-image" referrerpolicy="no-referrer">`;
}
