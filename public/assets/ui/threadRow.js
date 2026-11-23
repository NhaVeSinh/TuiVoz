// One row of a XenForo thread list: icon | main | meta | latest | iconEnd.

import { esc, num, timeAgo } from '../core/utils.js';
import { threadPath, threadUnreadPath, forumPath, userPath, withPage, postPath } from '../core/paths.js';
import { avatarMarkup } from '../lib/avatar.js';
import { prefixLabel } from '../lib/prefix.js';
import { bbcodeToPlain } from '../lib/bbcode.js';
import { threadLastPage } from '../lib/unread.js';
import { wireBannedUsernames } from '../lib/bannedUsers.js';

// `extraClass`/`extraStyle` are applied to the <li> so the filter engine can colour a row inline.
export function threadRow(thread, { sticky = false, showForum = false, extraClass = '', extraStyle = '' } = {}) {
  const starter = thread.User || { user_id: thread.user_id, username: thread.username };
  const lastUser = { user_id: thread.last_post_user_id, username: thread.last_post_username };
  const lastPage = threadLastPage(thread);
  const unread = !!thread.is_unread;
  // An unread thread links to /unread, which resolves to the first unread post.
  const titleHref = unread ? threadUnreadPath(thread) : threadPath(thread);
  const statuses = [
    thread.discussion_open === false
      ? '<li><i class="structItem-status structItem-status--locked" title="Đã khóa"></i><span class="u-srOnly">Đã khóa</span></li>'
      : '',
    sticky
      ? '<li><i class="structItem-status structItem-status--sticky" title="Ghim"></i><span class="u-srOnly">Ghim</span></li>'
      : '',
  ].join('');
  const jumpCount = Math.min(3, lastPage);
  const jump =
    lastPage > 1
      ? `<span class="structItem-pageJump">${Array.from(
          { length: jumpCount },
          (_, i) => `<a href="${withPage(threadPath(thread), lastPage - jumpCount + 1 + i)}">${lastPage - jumpCount + 1 + i}</a>`
        ).join('')}</span>`
      : '';
  return `
    <li class="structItem structItem--thread${thread.is_unread ? ' is-unread' : ''}${extraClass ? ` ${extraClass}` : ''}"${extraStyle ? ` style="${extraStyle}"` : ''}>
      <div class="structItem-cell structItem-cell--icon">
        <div class="structItem-iconContainer">
          <a href="${userPath(starter)}" class="avatar avatar--s">${avatarMarkup(starter, 's')}</a>
        </div>
      </div>
      <div class="structItem-cell structItem-cell--main">
        ${statuses ? `<ul class="structItem-statuses">${statuses}</ul>` : ''}
        <div class="structItem-title">${prefixLabel(thread)}<a href="${titleHref}">${esc(thread.title)}</a></div>
        <div class="structItem-minor">
          <ul class="structItem-parts">
            <li><a href="${userPath(starter)}" class="username" data-member-id="${Number(starter.user_id)}">${esc(thread.username)}</a></li>
            <li class="structItem-startDate"><a href="${threadPath(thread)}">${timeAgo(thread.post_date)}</a></li>
            ${showForum && thread.Forum ? `<li><a href="${forumPath(thread.Forum)}">${esc(thread.Forum.title)}</a></li>` : ''}
          </ul>${jump}
        </div>
      </div>      <div class="structItem-cell structItem-cell--meta">
        <dl class="pairs pairs--justified"><dt>Trả lời</dt><dd>${num(thread.reply_count)}</dd></dl>
        <dl class="pairs pairs--justified structItem-minor"><dt>Lượt xem</dt><dd>${num(thread.view_count)}</dd></dl>
      </div>
      <div class="structItem-cell structItem-cell--latest">
        <a href="${withPage(threadPath(thread), lastPage)}"><time class="structItem-latestDate">${timeAgo(thread.last_post_date)}</time></a>
        <div class="structItem-minor"><a href="${userPath(lastUser)}" class="username" data-member-id="${Number(thread.last_post_user_id)}">${esc(thread.last_post_username || '')}</a></div>
      </div>
      <div class="structItem-cell structItem-cell--icon structItem-cell--iconEnd">
        <div class="structItem-iconContainer">
          <a href="${userPath(lastUser)}" class="avatar avatar--xxs">${avatarMarkup(lastUser, 's')}</a>
        </div>
      </div>
    </li>`;
}

// Thread list, post lists and member-content rows all carry data-member-id on their username links, so one
// scan covers the starter, the latest poster and any attribution. `users` lets visible accounts skip a request.
export function wireThreadRowBans(root, users) {
  wireBannedUsernames(root, users);
}

// Row for post-centric lists (bookmarks, search results). `perPage` is the thread's page size when the caller
// knows it: the row then links to the post's own page, so a post past page 1 has something to land on.
export function postRow(post, thread, perPage, { extraClass = '', extraStyle = '' } = {}) {
  const author = post.User || { user_id: post.user_id, username: post.username };
  const title = (thread && thread.title) || `Bài #${post.post_id}`;
  const href = postPath(post, { thread_id: post.thread_id, ...thread }, perPage);
  return `
    <li class="structItem structItem--thread${extraClass ? ` ${extraClass}` : ''}"${extraStyle ? ` style="${extraStyle}"` : ''}>
      <div class="structItem-cell structItem-cell--icon">
        <div class="structItem-iconContainer">
          <a href="${userPath(author)}" class="avatar avatar--s">${avatarMarkup(author, 's')}</a>
        </div>
      </div>
      <div class="structItem-cell structItem-cell--main">
        <div class="structItem-title"><a href="${href}">${esc(title)}</a></div>
        <div class="structItem-minor">
          <ul class="structItem-parts">
            <li><a href="${userPath(author)}" class="username" data-member-id="${Number(author.user_id)}">${esc(post.username)}</a></li>
            <li>${timeAgo(post.post_date)}</li>
          </ul>
        </div>
        <p class="structItem-snippet">${esc(bbcodeToPlain(post.message).replace(/\s+/g, ' ').slice(0, 240))}</p>
      </div>
    </li>`;
}

// Member recent-content / latest-activity rows — voz renders contentRow, not structItem.
// Thread variant: prefix+title link, snippet, minor = user · Thread · date · Replies · Forum.
export function memberContentRow(thread, snippetText) {
  const starter = thread.User || { user_id: thread.user_id, username: thread.username };
  const parts = [
    `<li><a href="${userPath(starter)}" class="username" data-member-id="${Number(starter.user_id)}">${esc(thread.username)}</a></li>`,
    `<li>Thread</li>`,
    `<li>${timeAgo(thread.post_date)}</li>`,
    `<li>Replies: ${num(thread.reply_count)}</li>`,
    thread.Forum ? `<li>Forum: <a href="${forumPath(thread.Forum)}">${esc(thread.Forum.title)}</a></li>` : '',
  ].filter(Boolean).join('');
  return `
    <li class="block-row block-row--separated js-inlineModContainer" data-author="${esc(thread.username || '')}">
      <div class="contentRow">
        <span class="contentRow-figure">
          <a href="${userPath(starter)}" class="avatar avatar--s">${avatarMarkup(starter, 's')}</a>
        </span>
        <div class="contentRow-main">
          <h3 class="contentRow-title"><a href="${threadPath(thread)}">${prefixLabel(thread)}${esc(thread.title)}</a></h3>
          ${snippetText ? `<div class="contentRow-snippet">${esc(snippetText)}</div>` : ''}
          <div class="contentRow-minor contentRow-minor--hideLinks">
            <ul class="listInline listInline--bullet">${parts}</ul>
          </div>
        </div>
      </div>
    </li>`;
}

// Post variant: title links to the post's own page and fragment, minor = user · Post #N · date · Forum.
export function memberPostRow(post, thread, snippetText, perPage) {
  const author = post.User || { user_id: post.user_id, username: post.username };
  const t = thread || {};
  const postUrl = t.thread_id ? postPath(post, t, perPage) : `/p/${post.post_id}/`;
  const title = t.title || `Bài #${post.post_id}`;
  const pos = post.position != null ? `Post #${Number(post.position) + 1}` : 'Post';
  const parts = [
    `<li><a href="${userPath(author)}" class="username" data-member-id="${Number(author.user_id)}">${esc(post.username)}</a></li>`,
    `<li>${pos}</li>`,
    `<li>${timeAgo(post.post_date)}</li>`,
    t.Forum ? `<li>Forum: <a href="${forumPath(t.Forum)}">${esc(t.Forum.title)}</a></li>` : '',
  ].filter(Boolean).join('');
  const threadPrefix = t.prefix ? prefixLabel(t) : '';
  return `
    <li class="block-row block-row--separated js-inlineModContainer" data-author="${esc(post.username || '')}">
      <div class="contentRow">
        <span class="contentRow-figure">
          <a href="${userPath(author)}" class="avatar avatar--s">${avatarMarkup(author, 's')}</a>
        </span>
        <div class="contentRow-main">
          <h3 class="contentRow-title"><a href="${postUrl}">${threadPrefix}${esc(title)}</a></h3>
          ${snippetText ? `<div class="contentRow-snippet">${esc(snippetText)}</div>` : ''}
          <div class="contentRow-minor contentRow-minor--hideLinks">
            <ul class="listInline listInline--bullet">${parts}</ul>
          </div>
        </div>
      </div>
    </li>`;
}

// Latest-activity variant: voz words the title as "<user> replied to the thread <title>."
// and drops the meta list down to just the timestamp.
export function memberActivityRow(post, thread, snippetText, perPage) {
  const author = post.User || { user_id: post.user_id, username: post.username };
  const t = thread || {};
  const postUrl = t.thread_id ? postPath(post, t, perPage) : `/p/${post.post_id}/`;
  const title = t.title || `Bài #${post.post_id}`;
  return `
    <li class="block-row block-row--separated js-inlineModContainer" data-author="${esc(post.username || '')}">
      <div class="contentRow">
        <span class="contentRow-figure">
          <a href="${userPath(author)}" class="avatar avatar--s">${avatarMarkup(author, 's')}</a>
        </span>
        <div class="contentRow-main">
          <h3 class="contentRow-title"><a href="${userPath(author)}" class="username" data-member-id="${Number(author.user_id)}">${esc(post.username)}</a> replied to the thread <a href="${postUrl}">${t.prefix ? prefixLabel(t) : ''}${esc(title)}</a>.</h3>
          ${snippetText ? `<div class="contentRow-snippet">${esc(snippetText)}</div>` : ''}
          <div class="contentRow-minor contentRow-minor--hideLinks">
            <ul class="listInline listInline--bullet"><li>${timeAgo(post.post_date)}</li></ul>
          </div>
        </div>
      </div>
    </li>`;
}

// Row for profile-post comments in mixed member-content results.
export function profilePostCommentRow(item, ownerName) {
  const c = item.result || item;
  const author = c.User || { user_id: c.user_id, username: c.username };
  const postId = c.profile_post_id || c.ProfilePost?.profile_post_id;
  const title = ownerName ? `Bài trên tường của ${ownerName}` : 'Bài trên tường';
  const kind = item.type === 'profile_post' ? 'Profile post' : 'Profile post comment';
  const parts = [
    `<li><a href="${userPath(author)}" class="username" data-member-id="${Number(author.user_id)}">${esc(c.username)}</a></li>`,
    `<li>${kind}</li>`,
    `<li>${timeAgo(c.comment_date || c.post_date)}</li>`,
  ].join('');
  return `
    <li class="block-row block-row--separated js-inlineModContainer" data-author="${esc(c.username || '')}">
      <div class="contentRow">
        <span class="contentRow-figure">
          <a href="${userPath(author)}" class="avatar avatar--s">${avatarMarkup(author, 's')}</a>
        </span>
        <div class="contentRow-main">
          <h3 class="contentRow-title"><a href="/pp/${postId}">${esc(title)}</a></h3>
          <div class="contentRow-snippet">${esc(bbcodeToPlain(c.message || '').replace(/\s+/g, ' ').slice(0, 240))}</div>
          <div class="contentRow-minor contentRow-minor--hideLinks">
            <ul class="listInline listInline--bullet">${parts}</ul>
          </div>
        </div>
      </div>
    </li>`;
}
