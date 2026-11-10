// One row of a XenForo thread list: icon | main | meta | latest | iconEnd.

import { esc, num, timeAgo } from '../core/utils.js';
import { threadPath, threadUnreadPath, forumPath, userPath, withPage } from '../core/paths.js';
import { avatarMarkup } from '../lib/avatar.js';
import { prefixLabel } from '../lib/prefix.js';
import { bbcodeToPlain } from '../lib/bbcode.js';
import { threadLastPage } from '../lib/unread.js';

export function threadRow(thread, { sticky = false, showForum = false } = {}) {
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
    <li class="structItem structItem--thread${thread.is_unread ? ' is-unread' : ''}">
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
            <li><a href="${userPath(starter)}">${esc(thread.username)}</a></li>
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
        <div class="structItem-minor"><a href="${userPath(lastUser)}">${esc(thread.last_post_username || '')}</a></div>
      </div>
      <div class="structItem-cell structItem-cell--icon structItem-cell--iconEnd">
        <div class="structItem-iconContainer">
          <a href="${userPath(lastUser)}" class="avatar avatar--xxs">${avatarMarkup(lastUser, 's')}</a>
        </div>
      </div>
    </li>`;
}

// Row for post-centric lists (bookmarks, search results).
export function postRow(post, thread) {
  const author = post.User || { user_id: post.user_id, username: post.username };
  const title = (thread && thread.title) || `Bài #${post.post_id}`;
  const href = `${threadPath({ thread_id: post.thread_id, title })}?post=${post.post_id}`;
  return `
    <li class="structItem structItem--thread">
      <div class="structItem-cell structItem-cell--icon">
        <div class="structItem-iconContainer">
          <a href="${userPath(author)}" class="avatar avatar--s">${avatarMarkup(author, 's')}</a>
        </div>
      </div>
      <div class="structItem-cell structItem-cell--main">
        <div class="structItem-title"><a href="${href}">${esc(title)}</a></div>
        <div class="structItem-minor">
          <ul class="structItem-parts">
            <li><a href="${userPath(author)}">${esc(post.username)}</a></li>
            <li>${timeAgo(post.post_date)}</li>
          </ul>
        </div>
        <p class="structItem-snippet">${esc(bbcodeToPlain(post.message).replace(/\s+/g, ' ').slice(0, 240))}</p>
      </div>
    </li>`;
}
