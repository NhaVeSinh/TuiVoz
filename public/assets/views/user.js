/** Member profile view. */

import { app, state } from '../core/dom.js';
import { esc, num, unix, timeAgo, fullDate, postDate } from '../core/utils.js';
import { api, ApiError } from '../api.js';
import { userPath } from '../core/paths.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { loading, errorBox, toast } from '../ui/feedback.js';
import { pagination, wirePageJump } from '../ui/pagination.js';
import { avatarMarkup } from '../lib/avatar.js';
import { userBadges } from '../lib/userBadges.js';
import { sanitizeHtml, bbcodeToPlain } from '../lib/bbcode.js';
import { signatureHtml } from '../lib/signature.js';
import { memberContentRow, memberPostRow, memberActivityRow, profilePostCommentRow, wireThreadRowBans } from '../ui/threadRow.js';
import { applyBannedMark, bannedFeatureOn } from '../lib/bannedUsers.js';
import { wireMemberTooltips } from '../ui/memberTooltip.js';
import { wireEditor, clearEditorDraft } from '../ui/editor.js';
import { registerAttachments } from '../lib/attachments.js';
import { editorHtml } from '../ui/editor.js';

// voz tab order; activity reuses member posts (no latest-activity API).
const PROFILE_TABS = ['wall', 'activity', 'postings', 'about'];
const PROFILE_TAB_LABELS = {
  wall: 'Bài trên tường',
  activity: 'Hoạt động gần đây',
  postings: 'Bài đã đăng',
  about: 'Giới thiệu',
};
// voz tab slugs; wall uses the base path.
const PROFILE_TAB_SLUG = { wall: '', activity: 'latest-activity', postings: 'recent-content', about: 'about' };
const SLUG_TO_TAB = Object.fromEntries(Object.entries(PROFILE_TAB_SLUG).map(([k, v]) => [v, k]));

function bannerStyle(user) {
  const url = (user.profile_banner_urls || {}).l || '';
  return url ? ` style="background-image:url('${esc(url)}');background-position-y:50%"` : '';
}

function memberHeaderHtml(user, tab) {
  const isMe = state.me && state.me.user_id === user.user_id;
  const hasBanner = !!(user.profile_banner_urls || {}).l;
  const joinDate = user.register_date ? new Date(unix(user.register_date)) : null;
  const lastSeen = user.last_activity ? new Date(unix(user.last_activity)) : null;
  const search = (content) => `/search?${new URLSearchParams({ member: user.username, ...(content ? { content } : {}) })}`;
  return `
  <div class="memberHeader${hasBanner ? ' memberHeader--withBanner' : ''}">
    <div class="memberProfileBanner memberHeader-main"${hasBanner ? bannerStyle(user) : ''}>
      <div class="memberHeader-mainContent">
        <span class="memberHeader-avatar">
          <span class="avatarWrapper">
            <a href="${esc((user.avatar_urls || {}).o || '#')}" class="avatar avatar--l" target="_blank" rel="noopener">${avatarMarkup(user, 'l')}</a>
          </span>
        </span>
        <div class="memberHeader-content memberHeader-content--info">
          <h1 class="memberHeader-name"><span class="memberHeader-nameWrapper"><span class="username" data-member-id="${Number(user.user_id)}">${esc(user.username)}</span></span></h1>
          <div class="memberHeader-blurbContainer">
            ${user.user_title ? `<div class="memberHeader-blurb"><span class="userTitle">${esc(user.user_title)}</span>${user.location ? ` <span aria-hidden="true">·</span> Từ ${esc(user.location)}` : ''}</div>` : user.location ? `<div class="memberHeader-blurb">Từ ${esc(user.location)}</div>` : ''}
            ${(user.banners || []).length ? `<div class="memberHeader-blurb memberHeader-badges">${userBadges(user)}</div>` : ''}
            ${joinDate ? `<div class="memberHeader-blurb"><dl class="pairs pairs--inline"><dt>Tham gia</dt><dd>${joinDate.toLocaleDateString('vi-VN')}</dd></dl></div>` : ''}
            ${lastSeen ? `<div class="memberHeader-blurb"><dl class="pairs pairs--inline"><dt>Hoạt động gần nhất</dt><dd>${timeAgo(user.last_activity)}</dd></dl></div>` : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="memberHeader-content">
      <div class="memberHeader-stats">
        <div class="pairJustifier">
          <dl class="pairs pairs--rows pairs--rows--centered fauxBlockLink"><dt>Bài viết</dt><dd><a href="${search('post')}" class="fauxBlockLink-linkRow u-concealed">${num(user.message_count)}</a></dd></dl>
          <dl class="pairs pairs--rows pairs--rows--centered"><dt>Điểm tương tác</dt><dd>${num(user.reaction_score)}</dd></dl>
          <dl class="pairs pairs--rows pairs--rows--centered"><dt title="Trophy">Điểm thành tích</dt><dd>${num(user.trophy_points)}</dd></dl>
        </div>
      </div>
      <hr class="memberHeader-separator">
      <div class="memberHeader-buttons">
        ${!isMe && user.can_converse ? `<div class="buttonGroup"><a href="/direct-messages/new?to=${encodeURIComponent(user.username)}" class="button button--link"><span class="button-text">Gửi tin nhắn</span></a></div>` : ''}
        <div class="buttonGroup">
          <a href="${search('')}" class="button button--link"><span class="button-text">Tất cả nội dung</span></a>
          <div class="buttonGroup-buttonWrapper">
            <a href="${search('thread')}" class="button button--link"><span class="button-text">Chủ đề đã đăng</span></a>
          </div>
        </div>
        <a href="https://voz.vn${esc(user.view_url ? new URL(user.view_url).pathname : `/u/${user.user_id}/`)}" target="_blank" rel="noopener" class="button button--link" style="display:none"><span class="button-text">Xem trên voz.vn</span></a>
      </div>
    </div>
  </div>
  <h2 class="block-tabHeader block-tabHeader--memberTabs tabs hScroller" role="tablist">
    <span class="hScroller-scroll">
      ${PROFILE_TABS.map((name) => `<a href="${memberTabUrl(user, name)}" id="${PROFILE_TAB_SLUG[name] || 'profile-posts'}" class="tabs-tab${name === tab ? ' is-active' : ''}" role="tab" aria-selected="${name === tab}">${PROFILE_TAB_LABELS[name]}</a>`).join('')}
    </span>
  </h2>`;
}

// Wall: posts as .message blocks with inline comments, like voz

function commentHtml(comment) {
  const author = comment.User || { user_id: comment.user_id, username: comment.username };
  const cid = comment.profile_post_comment_id || comment.id;
  return `
    <div class="message-responseRow">
      <div class="comment" id="profile-post-comment-${cid}">
        <div class="comment-inner">
          <span class="comment-avatar"><a href="${userPath(author)}" class="avatar avatar--xxs">${avatarMarkup(author, 's')}</a></span>
          <div class="comment-main">
            <div class="comment-content">
              <div class="comment-contentWrapper">
                <a href="${userPath(author)}" class="username comment-user" data-member-id="${Number(author.user_id)}">${esc(author.username)}</a>
                <article class="comment-body"><div class="bbWrapper">${sanitizeHtml(comment.message_parsed || esc(comment.message || ''), comment.message)}</div></article>
              </div>
            </div>
            <footer class="comment-footer">
              <div class="comment-actionBar actionBar">
                <div class="actionBar-set actionBar-set--internal">
                  <span class="actionBar-action"><time>${timeAgo(comment.comment_date || comment.post_date)}</time></span>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>`;
}

function profilePostMessageHtml(post) {
  const author = post.User || { user_id: post.user_id, username: post.username };
  const latest = post.LatestComments || post.latest_comments || [];
  const hidden = Math.max(0, (post.comment_count || 0) - latest.length);
  return `
    <article class="message message--simple" id="profile-post-${post.profile_post_id}">
      <span class="u-anchorTarget"></span>
      <div class="message-inner">
        <div class="message-cell message-cell--user">
          <header class="message-user">
            <div class="message-avatar"><div class="message-avatar-wrapper">
              <a href="${userPath(author)}" class="avatar avatar--s" data-member-id="${Number(author.user_id || post.user_id)}">${avatarMarkup(author, 's')}</a>
            </div></div>
            <span class="message-userArrow"></span>
          </header>
        </div>
        <div class="message-cell message-cell--main">
          <div class="message-main">
            <div class="message-content">
              <header class="message-attribution message-attribution--plain">
                <ul class="listInline listInline--bullet">
                  <li class="message-attribution-user">
                    <a href="${userPath(author)}" class="avatar avatar--xxs">${avatarMarkup(author, 's')}</a>
                    <h4 class="attribution"><a href="${userPath(author)}" class="username" data-member-id="${Number(author.user_id)}">${esc(author.username)}</a></h4>
                  </li>
                  <li><a href="/pp/${post.profile_post_id}" class="u-concealed"><time title="${esc(fullDate(post.post_date))}">${postDate(post.post_date, 'thread')}</time></a></li>
                </ul>
              </header>
              <div class="message-userContent">
                <article class="message-body"><div class="bbWrapper">${sanitizeHtml(post.message_parsed || esc(post.message || ''), post.message)}</div></article>
              </div>
            </div>
            <footer class="message-footer">
              <section class="message-responses">
                ${hidden > 0 ? `<div class="message-responseRow u-jsOnly"><a href="/pp/${post.profile_post_id}">Xem ${num(hidden)} bình luận trước…</a></div>` : ''}
                ${latest.map(commentHtml).join('')}
                ${post.comment_count > latest.length ? '' : ''}
              </section>
            </footer>
          </div>
        </div>
      </div>
    </article>`;
}

async function wallTabHtml(user, page) {
  const res = await api.profilePosts(user.user_id, page).catch((err) => {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return { profile_posts: [], denied: true };
    throw err;
  });
  const posts = res.profile_posts || [];
  const canPost = state.loggedIn && (state.me?.user_id === user.user_id || user.can_post_profile);
  const composeBox = canPost
    ? `<div class="block block--messages"><form id="wall-post-form">
        <div class="message message--simple message--quickReply block-topRadiusContent block-bottomRadiusContent">
          <div class="message-inner">
            <div class="message-cell message-cell--user">
              <div class="message-user"><div class="message-avatar"><div class="message-avatar-wrapper">
                <a href="${userPath(state.me)}" class="avatar avatar--s">${avatarMarkup(state.me, 's')}</a>
              </div></div><span class="message-userArrow"></span></div>
            </div>
            <div class="message-cell message-cell--main"><div class="message-editorWrapper">
              <div class="editorPlaceholder" id="wall-post-placeholder">
                <div class="editorPlaceholder-editor is-hidden">
                  ${editorHtml('wall-post-message', '', 'Viết gì đó…')}
                </div>
                <div class="editorPlaceholder-placeholder"><div class="input"><span class="u-muted">Viết gì đó…</span></div></div>
              </div>
              <div class="formButtonGroup formButtonGroup--simple" hidden><div class="formButtonGroup-primary"><button class="button button--primary" type="submit"><span class="button-text">Đăng</span></button></div></div>
            </div></div>
          </div>
        </div>
      </form></div>`
    : '';
  return `
    ${composeBox}
    <div class="block block--messages">
      ${posts.length ? `<div class="block-body">${posts.map(profilePostMessageHtml).join('')}</div>` : `<div class="block-body block-body--pad"><div class="empty">${res.denied ? 'Bức tường này không công khai — đăng nhập lại để cấp quyền profile_post:read.' : 'Chưa có bài nào trên tường.'}</div></div>`}
      ${pagination(res.pagination, (p) => `${userPath(user)}?${new URLSearchParams(p > 1 ? { page: p } : {})}`)}
    </div>`;
}

// Member search tabs: activity=posts, postings=all content

async function memberSearchTabHtml(user, content, page, emptyText, tabKey) {
  const created = await api.searchMember(user.user_id, content);
  const id = created.search && created.search.search_id;
  if (!id) return `<div class="empty">${emptyText}</div>`;
  const res = await api.searchResults(id, page);
  const results = res.results || [];
  // Fetch profile-post owners; search results don't embed them.
  const ppIds = [...new Set(results.filter((i) => i.type === 'profile_post' || i.type === 'profile_post_comment').map((i) => i.result?.profile_post_id).filter(Boolean))];
  const owners = {};
  await Promise.all(ppIds.map(async (pid) => {
    const pp = await api.profilePost(pid).catch(() => null);
    const u = pp?.profile_post?.User || pp?.profile_post?.user;
    if (u?.username) owners[pid] = u.username;
  }));
  const rows = results
    .map((item) => {
      if (item.type === 'profile_post' || item.type === 'profile_post_comment') return profilePostCommentRow(item, owners[item.result?.profile_post_id]);
      const c = item.result || item.content || item;
      if (item.type === 'thread' || item.content_type === 'thread') {
        const snippet = c.FirstPost ? bbcodeToPlain(c.FirstPost.message || '').replace(/\s+/g, ' ').slice(0, 240) : '';
        return memberContentRow(c, snippet);
      }
      const thread = c.Thread || c.thread || {};
      const snippet = bbcodeToPlain(c.message || '').replace(/\s+/g, ' ').slice(0, 240);
      if (tabKey === PROFILE_TAB_SLUG.activity) return memberActivityRow(c, thread, snippet, res.pagination?.per_page);
      return memberPostRow(c, thread, snippet, res.pagination?.per_page);
    })
    .join('');
  const qs = (p) => `${memberTabUrl(user, SLUG_TO_TAB[tabKey] || 'wall')}?${new URLSearchParams({ page: String(p) })}`;
  return `
    ${results.length ? `<ul class="block-body">${rows}</ul>` : `<div class="empty">${emptyText}</div>`}
    ${pagination(res.pagination, qs)}`;
}

function aboutTabHtml(user) {
  const fields = user.custom_fields || {};
  const contact = [
    fields.facebook ? ['Facebook', fields.facebook] : null,
    fields.twitter ? ['Twitter', fields.twitter] : null,
    fields.skype ? ['Skype', fields.skype] : null,
    user.website ? ['Website', `<a href="${esc(user.website)}" target="_blank" rel="noopener nofollow">${esc(user.website)}</a>`] : null,
    user.location ? ['Nơi ở', esc(user.location)] : null,
  ].filter(Boolean);
  return `
    <div class="block-body block-body--pad">
      ${user.about ? `<div class="profile-section"><h3>Giới thiệu</h3><div class="bbWrapper">${sanitizeHtml(user.about)}</div></div>` : ''}
      ${contact.length ? `<div class="profile-section"><h3>Liên hệ</h3><dl class="pairs pairs--columns">${contact.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>` : ''}
      ${user.signature ? `<div class="profile-section"><h3>Chữ ký</h3><div class="bbWrapper">${sanitizeHtml(signatureHtml(user.signature))}</div></div>` : ''}
      ${!user.about && !contact.length && !user.signature ? '<div class="empty">Thành viên này chưa điền thông tin giới thiệu.</div>' : ''}
    </div>`;
}

async function renderTab(user, tab, page) {
  if (tab === 'activity') return `<div class="block">${await memberSearchTabHtml(user, 'post', page, 'Không có hoạt động này.', PROFILE_TAB_SLUG.activity)}</div>`;
  if (tab === 'postings') return `<div class="block">${await memberSearchTabHtml(user, '', page, 'Chưa có nội dung nào.', PROFILE_TAB_SLUG.postings)}</div>`;
  if (tab === 'about') return `<div class="block">${aboutTabHtml(user)}</div>`;
  return wallTabHtml(user, page);
}

function wireWallForm(user) {
  const form = document.getElementById('wall-post-form');
  if (!form) return;
  const placeholder = document.getElementById('wall-post-placeholder');
  const expanded = () => {
    placeholder.classList.add('is-expanded');
    placeholder.querySelector('.editorPlaceholder-editor').classList.remove('is-hidden');
    placeholder.querySelector('.editorPlaceholder-placeholder').classList.add('is-hidden');
    form.querySelector('.formButtonGroup').hidden = false;
    form.querySelector('.editor-visual')?.focus();
  };
  placeholder.querySelector('.editorPlaceholder-placeholder').addEventListener('click', expanded);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const textarea = document.getElementById('wall-post-message');
    const message = textarea.value.trim();
    if (!message) return toast('Nội dung trống', true);
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      // OAuth may lack profile_post:write scope; expect missing_scope.
      await api.createProfilePost(user.user_id, message);
      clearEditorDraft(textarea);
      toast('Đã đăng lên tường');
      await viewUser(user.user_id);
    } catch (err) {
      toast(err.message || 'Đăng thất bại (cần scope profile_post:write)', true);
      submit.disabled = false;
    }
  });
}

// voz tab href: base for wall, /<slug> otherwise.
function memberTabUrl(user, tab) {
  const base = userPath(user);
  const slug = PROFILE_TAB_SLUG[tab] || '';
  return slug ? `${base}${slug}/` : base;
}

export async function viewUser(userId, params = new URLSearchParams(), tabSlug = '') {
  setActiveNav('');
  loading();
  const tab = SLUG_TO_TAB[tabSlug] || 'wall';
  const page = Math.max(1, Number(params.get('page')) || 1);
  try {
    const res = await api.user(userId);
    const user = res.user;
    const tabHtml = await renderTab(user, tab, page);
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: user.username }]);
    setTitle(user.username, page > 1 ? page : 1);
    app.innerHTML = `
      <div class="block block--member">
        ${memberHeaderHtml(user, tab)}
        ${tabHtml}
      </div>`;
    const profile = memberTabUrl(user, tab);
    wirePageJump((p) => `${profile}?${new URLSearchParams({ page: String(p) })}`);
    wireEditor(app);
    wireWallForm(user);
    wireMemberTooltips(app, [user]);
    wireThreadRowBans(app, [user]);
    // "smart" mode marks only the opened member.
    if (bannedFeatureOn()) {
      const names = [...app.querySelectorAll('.memberHeader-nameWrapper [class*="username"]')];
      applyBannedMark(names, user.user_id).catch(() => {});
    }
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

// /pp/{id}: wall post plus full comment thread.
export async function viewProfilePost(postId, page = 1, anchorId = '') {
  setActiveNav('');
  loading();
  try {
    const res = await api.profilePost(postId, page);
    const post = res.profile_post || res;
    const owner = post.ProfileUser || {};
    const comments = res.comments || post.latest_comments || post.comments || res.profile_post_comments || [];
    registerAttachments([post, ...comments]);
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: owner.username || 'Hồ sơ', href: owner.user_id ? userPath(owner) : '/' }, { label: 'Bài trên tường' }]);
    setTitle(`Bài trên tường — ${owner.username || ''}`);
    app.innerHTML = `
      <div class="block block--messages">
        <div class="block-header">Bài trên tường của ${esc(owner.username || '')}</div>
        <div class="block-body">
          ${profilePostMessageHtml({ ...post, LatestComments: comments })}
        </div>
        ${pagination(res.pagination, (p) => `/pp/${postId}?page=${p}`)}
      </div>`;
    wirePageJump((p) => `/pp/${postId}?page=${p}`);
    wireMemberTooltips(app, [post.User, owner, ...comments.map((c) => c.User).filter(Boolean)]);
    wireThreadRowBans(app, [post.User, owner, ...comments.map((c) => c.User).filter(Boolean)]);
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
