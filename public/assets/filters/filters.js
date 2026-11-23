// Bộ lọc — lưu trữ và chuẩn hoá dữ liệu (localStorage `voz-filters:v1`).
// Thứ tự trong mảng = độ ưu tiên: filter phía trên được kiểm tra trước, filter đầu tiên khớp sẽ thắng.

import { makeId } from '../lib/settings.js';
import { FIELD_DEFS, ACTIONS, SCOPES, JOINS, customUrlMatches, normalizeUrlRule } from './match.js';

const KEY = 'voz-filters:v1';
const MAX_FILTERS = 200;
const MAX_NAME = 80;
const DEFAULT_COLOR = '#ff6600';

// 'custom' keeps each condition's own AND/OR connector; 'all'/'any' force every connector.
const joinIds = new Set(['all', 'any', 'custom']);

function normalizeCondition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const field = String(raw.field ?? '');
  const def = FIELD_DEFS[field];
  if (!def) return null;
  const ops = { text: ['eq', 'ne'], number: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'], date: ['lt', 'lte', 'gt', 'gte'] }[def.kind];
  const op = ops.includes(raw.op) ? raw.op : ops[0];
  const modes = ['contains', 'wildcard', 'regex'];
  const mode = def.kind === 'text' && modes.includes(raw.mode) ? raw.mode : 'contains';
  const value = String(raw.value ?? '').slice(0, 500);
  return { field, op, mode, or: raw.or === true, value };
}

export function normalizeFilter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scopes = (Array.isArray(raw.scopes) ? raw.scopes : []).filter((s) => SCOPES[s]);
  const action = ACTIONS[raw.action] ? raw.action : 'hide';
  const join = joinIds.has(raw.join) ? raw.join : 'all';
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .map(normalizeCondition)
    .filter(Boolean)
    .slice(0, 20);
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color ?? '')) ? String(raw.color) : DEFAULT_COLOR;
  const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  // Mỗi URL rule là {v: pattern, m: 'plain'|'wildcard'|'regex'}; full/partial URLs
  // chỉ giữ pathname (host/port/query bị bỏ) nên mẫu chạy trên mọi origin. Chuỗi
  // trần cũ được suy ra mode (có `*`/`?` → wildcard, còn lại plain).
  const seenUrls = new Set();
  const customUrls = [];
  for (const rule of (Array.isArray(raw.customUrls) ? raw.customUrls : []).map(normalizeUrlRule)) {
    if (!rule) continue;
    const key = `${rule.m}:${rule.v}`;
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    customUrls.push(rule);
    if (customUrls.length >= 50) break;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : makeId(),
    enabled: raw.enabled !== false,
    name,
    scopes,
    action,
    color,
    join,
    conditions,
    customUrls,
  };
}

export function loadFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.filters) ? raw.filters : [];
    const seen = new Set();
    const out = [];
    for (const item of list.slice(0, MAX_FILTERS)) {
      const filter = normalizeFilter(item);
      if (!filter || seen.has(filter.id)) continue;
      seen.add(filter.id);
      out.push(filter);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveFilters(list) {
  const filters = (Array.isArray(list) ? list : []).map(normalizeFilter).filter(Boolean).slice(0, MAX_FILTERS);
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    /* Storage full/disabled — the change still applies for this session via the in-memory array. */
  }
  window.dispatchEvent(new CustomEvent('voz:filters-change'));
  return filters;
}

export function addFilter(raw) {
  const filter = normalizeFilter(raw);
  if (!filter) return { ok: false, error: 'Bộ lọc không hợp lệ.' };
  const filters = loadFilters();
  if (filters.length >= MAX_FILTERS) return { ok: false, error: `Tối đa ${MAX_FILTERS} bộ lọc.` };
  filters.push(filter);
  saveFilters(filters);
  return { ok: true, filter };
}

export function updateFilter(id, raw) {
  const filters = loadFilters();
  const index = filters.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Không tìm thấy bộ lọc.' };
  const merged = normalizeFilter({ ...raw, id });
  if (!merged) return { ok: false, error: 'Bộ lọc không hợp lệ.' };
  filters[index] = merged;
  saveFilters(filters);
  return { ok: true, filter: merged };
}

export function removeFilter(id) {
  saveFilters(loadFilters().filter((item) => item.id !== id));
}

// Swap a filter to another index (reorder = re-prioritise).
export function moveFilter(id, toIndex) {
  const filters = loadFilters();
  const from = filters.findIndex((item) => item.id === id);
  if (from < 0) return filters;
  const target = Math.max(0, Math.min(filters.length - 1, toIndex));
  if (from === target) return filters;
  const [item] = filters.splice(from, 1);
  filters.splice(target, 0, item);
  return saveFilters(filters);
}

export function setFilterEnabled(id, enabled) {
  const filters = loadFilters();
  const filter = filters.find((item) => item.id === id);
  if (!filter) return;
  filter.enabled = enabled === true;
  saveFilters(filters);
}

// Restore path: replace the whole list from a backup payload. `addOnly` merges new ids.
export function restoreFilters(list, { addOnly = false } = {}) {
  const incoming = (Array.isArray(list) ? list : []).map(normalizeFilter).filter(Boolean);
  if (addOnly) {
    const filters = loadFilters();
    const ids = new Set(filters.map((item) => item.id));
    const merged = [...filters, ...incoming.filter((item) => !ids.has(item.id))];
    return saveFilters(merged);
  }
  return saveFilters(incoming);
}

// Only the scopes a filter is enabled for decide whether it can act; kept here so callers can short-circuit
// a whole render when no filter covers the scope at all. Scope 'custom' (Tự chọn) tham gia mọi scope
// khi URL trang hiện tại khớp một trong `customUrls`.
export function filtersForScope(scope) {
  if (!SCOPES[scope]) return [];
  const pathname = typeof window !== 'undefined' ? window.location?.pathname : '';
  return loadFilters().filter((item) => {
    if (item.enabled === false) return false;
    if (item.scopes.includes(scope)) return true;
    return item.scopes.includes('custom') && customUrlMatches(item.customUrls, pathname);
  });
}
