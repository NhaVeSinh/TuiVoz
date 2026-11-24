/** Filter matching. */

import { bbcodeToPlain } from '../lib/bbcode.js';

export const FIELD_DEFS = {
  username:       { label: 'Tên người đăng',                kind: 'text'   },
  register_date:  { label: 'Ngày tham gia của người đăng',  kind: 'date'   },
  reaction_score: { label: 'Điểm tương tác của người đăng', kind: 'number' },
  message_count:  { label: 'Số bài viết của người đăng',    kind: 'number' },
  react_ratio:    { label: '% điểm tương tác / số bài viết', kind: 'number' },
  post_text:      { label: 'Nội dung bài viết',             kind: 'text',   postOnly: true },
  thread_title:   { label: 'Tiêu đề chủ đề',                kind: 'text',   threadOnly: true },
  thread_starter: { label: 'Tên người tạo chủ đề',          kind: 'text',   threadOnly: true },
};

export const FIELD_IDS = Object.keys(FIELD_DEFS);

// 'threads' gets threadOnly fields, 'posts' the rest, 'custom' everything.
export function fieldsForScope(scope) {
  if (scope === 'custom') return FIELD_IDS;
  return scope === 'threads'
    ? FIELD_IDS.filter((id) => FIELD_DEFS[id].threadOnly)
    : FIELD_IDS.filter((id) => !FIELD_DEFS[id].threadOnly);
}

export const TEXT_MODES = [
  ['contains', 'Chứa'],
  ['wildcard', 'Wildcard'],
  ['regex',    'Regex'],
];

export const OPERATORS = {
  text:   [['eq', 'Khớp'], ['ne', 'Không khớp']],
  number: [['eq', '='], ['ne', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥']],
  date:   [['lt', 'Trước ngày'], ['lte', 'Trước hoặc trong ngày'], ['gt', 'Sau ngày'], ['gte', 'Từ ngày']],
};

export const ACTIONS = {
  hide:      { label: 'Ẩn' },
  delete:    { label: 'Xoá' },
  highlight: { label: 'Nổi bật' },
};
export const ACTION_IDS = Object.keys(ACTIONS);

export const SCOPES = {
  posts:   'Bài viết trong chủ đề',
  threads: 'Danh sách chủ đề',
  custom:  'Tự chọn',
};
export const SCOPE_IDS = Object.keys(SCOPES);

// Reduce full/host URLs to pathname so patterns run on any origin.
export function normalizeUrlPattern(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.startsWith('//')) {
    try { return new URL(s, 'https://x.local').pathname || s; } catch { return s; }
  }
  const hostPath = s.match(/^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|[\w-]+\.[\w.-]+)(?::\d+)?(\/.*)$/i);
  if (hostPath) return hostPath[1];
  return s;
}

// URL rule = value + match mode; legacy bare strings infer wildcard from `*`/`?`.
export const URL_MODES = [
  ['plain', 'Đường dẫn'],
  ['wildcard', 'Wildcard'],
  ['regex', 'Regex'],
];

export function normalizeUrlRule(raw) {
  const isObject = raw && typeof raw === 'object';
  const v = normalizeUrlPattern(isObject ? raw.v : raw);
  if (!v) return null;
  // Mode inferred on normalized path, so a pasted query's '?' is no wildcard.
  const mode = isObject
    ? (['plain', 'wildcard', 'regex'].includes(raw.m) ? raw.m : 'plain')
    : (/[*?]/.test(v) ? 'wildcard' : 'plain');
  return { v, m: mode };
}

function urlRegex(pattern) {
  try {
    const literal = String(pattern).match(/^\/(.*)\/([a-z]*)$/i);
    return literal ? new RegExp(literal[1], literal[2] || 'i') : new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

// Editor validity check; plain/wildcard never fail when non-empty.
export function urlRuleError(rule) {
  const v = String(rule?.v ?? '').trim();
  if (!v) return 'Chưa nhập URL.';
  if (rule.m === 'regex' && !urlRegex(v)) return 'Mẫu regex không hợp lệ.';
  return '';
}

// 'custom' scope runs only on pages matching a user URL pattern (pathname only).
export function customUrlMatches(patterns, pathname) {
  const path = String(pathname || '');
  if (!path) return false;
  for (const raw of Array.isArray(patterns) ? patterns : []) {
    const rule = normalizeUrlRule(raw);
    if (!rule) continue;
    if (rule.m === 'wildcard') {
      const body = rule.v
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      try {
        if (new RegExp(`^${body}$`, 'i').test(path)) return true;
      } catch { /* bad glob → skip */ }
    } else if (rule.m === 'regex') {
      const re = urlRegex(rule.v);
      if (re && re.test(path)) return true;
    } else if (path.toLowerCase().includes(rule.v.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export const JOINS = {
  all: 'Thoả tất cả điều kiện (AND)',
  any: 'Thoả ít nhất một điều kiện (OR)',
};
export const JOIN_IDS = Object.keys(JOINS);

const REGEX_CACHE = new Map();

// Wildcard = whole-string glob; null when the pattern won't compile.
export function compilePattern(mode, value) {
  const key = `${mode}:${value}`;
  if (REGEX_CACHE.has(key)) return REGEX_CACHE.get(key);
  let re = null;
  const raw = String(value ?? '').trim();
  if (raw) {
    try {
      if (mode === 'wildcard') {
        const body = raw
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        re = new RegExp(`^${body}$`, 'i');
      } else if (mode === 'regex') {
        const literal = raw.match(/^\/(.*)\/([a-z]*)$/i);
        re = literal ? new RegExp(literal[1], literal[2] || 'i') : new RegExp(raw, 'i');
      }
    } catch {
      re = null;
    }
  }
  REGEX_CACHE.set(key, re);
  return re;
}

// Editor validity check; 'contains' never fails.
export function patternError(mode, value) {
  if (!String(value ?? '').trim()) return 'Chưa nhập giá trị.';
  if ((mode === 'regex' || mode === 'wildcard') && !compilePattern(mode, value)) {
    return 'Mẫu regex/wildcard không hợp lệ.';
  }
  return '';
}

function matchText(mode, op, value, subject) {
  const text = String(subject ?? '');
  const needle = String(value ?? '');
  let matched;
  if (mode === 'wildcard' || mode === 'regex') {
    const re = compilePattern(mode, needle);
    // Unparseable pattern must not match, or 'ne' would match every row.
    if (!re) return false;
    matched = re.test(text);
  } else {
    matched = text.toLowerCase().includes(needle.toLowerCase());
  }
  return op === 'ne' ? !matched : matched;
}

function matchNumber(op, value, subject) {
  const target = Number(value);
  const actual = Number(subject);
  if (!Number.isFinite(target) || !Number.isFinite(actual)) return false;
  switch (op) {
    case 'eq':  return actual === target;
    case 'ne':  return actual !== target;
    case 'lt':  return actual < target;
    case 'lte': return actual <= target;
    case 'gt':  return actual > target;
    case 'gte': return actual >= target;
    default:    return false;
  }
}

// YYYY-MM-DD input parsed as UTC; boundary days widen to end-of-day.
function matchDate(op, value, unixSeconds) {
  const actual = Number(unixSeconds);
  if (!Number.isFinite(actual) || !actual) return false;
  const start = Date.parse(`${String(value).trim()}T00:00:00Z`) / 1000;
  if (!Number.isFinite(start)) return false;
  const endOfDay = start + 86400 - 1;
  switch (op) {
    case 'lt':  return actual < start;
    case 'lte': return actual <= endOfDay;
    case 'gt':  return actual > endOfDay;
    case 'gte': return actual >= start;
    default:    return false;
  }
}

// Read a field off a thread row or post; post scope also sees the thread.
export function fieldValue(field, { kind, thread, post } = {}) {
  const isPost = kind === 'posts';
  const user = (isPost ? post?.User : thread?.User) || {};
  const starter = thread?.User || {};
  switch (field) {
    case 'username':
      return isPost ? (user.username ?? post?.username) : (user.username ?? thread?.username);
    case 'register_date':
      return user.register_date;
    case 'reaction_score':
      return user.reaction_score;
    case 'message_count':
      return user.message_count;
    case 'react_ratio': {
      const score = Number(user.reaction_score);
      const count = Number(user.message_count);
      return count > 0 && Number.isFinite(score) ? (score / count) * 100 : undefined;
    }
    case 'post_text':
      // Quote blocks stripped so matching hits what the author wrote.
      return post ? bbcodeToPlain(post.message || '') : undefined;
    case 'thread_title':
      return thread?.title;
    case 'thread_starter':
      return starter.username ?? thread?.username;
    default:
      return undefined;
  }
}

function conditionMatches(condition, context) {
  const def = FIELD_DEFS[condition.field];
  if (!def) return false;
  // postOnly field on a thread row has no data → fail.
  if (def.postOnly && context.kind !== 'posts') return false;
  // Thread-only fields are meaningless in post scope → fail.
  if (def.threadOnly && context.kind !== 'threads') return false;
  const subject = fieldValue(condition.field, context);
  if (subject === undefined || subject === null) return false;
  if (def.kind === 'text') {
    if (!String(condition.value ?? '').trim()) return false;
    return matchText(condition.mode || 'contains', condition.op || 'eq', condition.value, subject);
  }
  if (def.kind === 'date') return matchDate(condition.op, condition.value, subject);
  return matchNumber(condition.op, condition.value, subject);
}

// Later conditions combine left-to-right per-connector or the filter join.
export function filterMatches(filter, context) {
  const conditions = Array.isArray(filter?.conditions) ? filter.conditions : [];
  if (!conditions.length) return false;
  let result = conditionMatches(conditions[0], context);
  for (let i = 1; i < conditions.length; i += 1) {
    const next = conditionMatches(conditions[i], context);
    const useOr = filter.join === 'any' ? true : filter.join === 'all' ? false : !!conditions[i].or;
    result = useOr ? result || next : result && next;
  }
  return result;
}

// Topmost enabled filter matching scope; 'custom' needs a page-URL match.
export function matchingFilter(filters, context) {
  if (!Array.isArray(filters)) return null;
  const pathname = typeof window !== 'undefined' ? window.location?.pathname : '';
  for (const filter of filters) {
    if (!filter || filter.enabled === false) continue;
    const scopes = Array.isArray(filter.scopes) ? filter.scopes : [];
    const inScope = scopes.includes(context.kind)
      || (scopes.includes('custom') && customUrlMatches(filter.customUrls, pathname));
    if (!inScope) continue;
    if (filterMatches(filter, context)) return filter;
  }
  return null;
}
