// Bộ lọc — điều kiện và so khớp (thuần logic, không DOM).
//
// Mỗi điều kiện có một `field` và một `op` (toán tử), giá trị nhập theo `mode`:
//   - text: `mode` là 'contains' | 'wildcard' | 'regex', op là 'eq' (khớp) / 'ne' (không khớp)
//   - number: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'
//   - date (register_date, unix seconds): 'lt' | 'lte' | 'gt' | 'gte', giá trị `YYYY-MM-DD`
// `or` trên điều kiện i>0 chọn connector với điều kiện trước; join 'all'/'any' ép toàn bộ connector
// thành AND/OR. Điều kiện thiếu dữ liệu (field rỗng trên payload, ngày/số sai định dạng, regex lỗi) → false.

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

// Fields the editor offers per scope: 'threads' chỉ cho tiêu đề/người tạo chủ đề,
// 'posts' cho mọi trường còn lại (không gồm hai trường threadOnly), 'custom' cho tất cả
// vì URL tuỳ chọn có thể trỏ tới cả trang danh sách lẫn trang bài viết.
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

// Chuẩn hoá một mẫu URL thành phần path: full URL với scheme (`http://localhost:3111/t/x`,
// `https://voz.vn/t/x`), protocol-relative (`//voz.vn/t/x`) hay `host[:port]/path`
// (`localhost:3111/t/x`, `voz.vn/t/x`) đều chỉ giữ lại pathname — bỏ host/port/query,
// nên mẫu chạy được trên mọi origin. Đường dẫn/chuỗi con thường (`/t/x`, `tong-hop`)
// giữ nguyên.
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

// Một mẫu URL gồm giá trị + cách khớp: 'plain' (chuỗi con của path, mặc định),
// 'wildcard' (`*`/`?` glob khớp cả đường dẫn) hoặc 'regex' (dạng /mẫu/flags hoặc mẫu
// trần, khớp một phần). Chuỗi trần cũ (trước khi có mode) tự suy ra wildcard khi có
// `*`/`?` để giữ nguyên hành vi cũ; chuỗi mới từ editor luôn đi kèm mode rõ ràng.
export const URL_MODES = [
  ['plain', 'Đường dẫn'],
  ['wildcard', 'Wildcard'],
  ['regex', 'Regex'],
];

export function normalizeUrlRule(raw) {
  const isObject = raw && typeof raw === 'object';
  const v = normalizeUrlPattern(isObject ? raw.v : raw);
  if (!v) return null;
  // Mode suy ra trên path đã chuẩn hoá — `?` trong query của URL paste không được tính là wildcard.
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

// Editor-side validity check for a URL rule (plain/wildcard never fail once non-empty).
export function urlRuleError(rule) {
  const v = String(rule?.v ?? '').trim();
  if (!v) return 'Chưa nhập URL.';
  if (rule.m === 'regex' && !urlRegex(v)) return 'Mẫu regex không hợp lệ.';
  return '';
}

// Scope 'custom' (Tự chọn): filter chỉ chạy trên trang có URL khớp một trong các
// mẫu người dùng nhập, theo mode của từng mẫu. Paste nguyên URL đầy đủ cũng được
// — chỉ pathname được dùng để so khớp.
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

// Wildcard/regex value → RegExp; wildcard mode is a whole-string glob (* = .*, ? = .).
// Returns null when the pattern does not compile.
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

// Editor-side validity check for the pattern modes ('contains' never fails).
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
    // An unparseable pattern must not match — 'ne' would otherwise invert it into matching every row.
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

// `value` is a YYYY-MM-DD date input. Boundary days are widened to end-of-day so "sau ngày X" excludes all
// of X itself. The input is parsed as UTC to stay timezone-independent.
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

// Reads one field off a thread-list item or a post. `kind` is 'threads' (Danh sách chủ đề) or 'posts'
// (Bài viết trong chủ đề / tin nhắn). Post scope also sees the containing thread when provided.
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
      // bbcodeToPlain strips quote blocks, so the match targets what the author wrote, not what they quoted.
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
  // A post-only field on a thread-list row has no data → the condition fails.
  if (def.postOnly && context.kind !== 'posts') return false;
  // Thread fields (tiêu đề/người tạo) chỉ dùng cho scope 'threads' — trên bài viết
  // chúng không còn nghĩa (post scope dùng các trường của người đăng bài).
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

// The first condition is unconditional; each later condition combines left-to-right with its own AND/OR
// connector — or the filter-wide join when 'all'/'any' is picked.
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

// Highest-priority (topmost) enabled filter that applies to this scope AND matches; null when none do.
// Scope 'custom' counts when the current page URL matches the filter's customUrls.
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
