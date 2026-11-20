// Search form + results.

import { app } from '../core/dom.js';
import { esc, num } from '../core/utils.js';
import { navigate } from '../core/nav.js';
import { api } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { loading, errorBox } from '../ui/feedback.js';
import { pagination, wirePageJump } from '../ui/pagination.js';
import { postRow, wireThreadRowBans } from '../ui/threadRow.js';

export async function viewSearch(query, searchId, page) {
  setActiveNav('search');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Tìm kiếm' }]);
  setTitle('Search', searchId ? page : 1);
  const member = new URLSearchParams(location.search).get('member') || '';
  if (!searchId) {
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Tìm kiếm</div>
        <div class="block-body block-body--pad">
          <form id="search-form">
            <div class="formRow">
              <label for="search-keywords">Từ khoá</label>
              <input class="input" id="search-keywords" name="q" value="${esc(query || '')}" placeholder="Nhập từ khoá…">
            </div>
            <div class="formRow"><label for="search-member">Bởi thành viên</label><input class="input" id="search-member" value="${esc(member)}" placeholder="Tên tài khoản (tuỳ chọn)"></div>
            <p class="formHint">Tìm bài viết theo từ khoá hoặc thành viên. <a href="https://voz.vn/search/" target="_blank" rel="noopener">Bộ lọc nâng cao đầy đủ trên voz.vn</a></p>
            <button class="button button--primary" type="submit">Tìm</button>
          </form>
        </div>
      </div>`;
    document.getElementById('search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const value = document.getElementById('search-keywords').value.trim();
      const author = document.getElementById('search-member').value.trim();
      if (value || author) navigate(`/search?${new URLSearchParams({ q: value, member: author })}`);
    });
    if (query || member) await runSearch(query, 1, null, member);
    return;
  }
  await runSearch(query, page, searchId, member);
}

async function runSearch(query, page, searchId, member = '') {
  loading();
  try {
    let id = searchId;
    if (!id) {
      let created;
      if (member) {
        const found = await api.findUser(member);
        const user = found.exact || found.users?.find((item) => item.username.toLowerCase() === member.toLowerCase());
        if (!user) throw new Error('Không tìm thấy thành viên.');
        if (query) throw new Error('API không hỗ trợ kết hợp từ khoá với thành viên. Hãy dùng tìm kiếm nâng cao trên voz.vn.');
        created = await api.searchMember(user.user_id);
      } else {
        created = await api.search(query);
      }
      id = created.search.search_id;
    }
    const res = await api.searchResults(id, page);
    const results = res.results || [];
    const resultHref = (p) => `/search?${new URLSearchParams({ q: query || '', member, id: String(id), page: String(p) })}`;
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Kết quả cho “${esc(member || query || '')}”<span class="block-header-extra">${num(res.pagination && res.pagination.total)} kết quả</span></div>
        <div class="structItemContainer">
          <div class="structItemContainer-group">
            ${results
              .map((item) => {
                const p = item.result || {};
                return postRow(p, p.Thread || {}, res.pagination?.per_page);
              })
              .join('')}
          </div>
        </div>
        ${pagination(res.pagination, resultHref)}
      </div>`;
    wirePageJump(resultHref);
    wireThreadRowBans(document.querySelector('.structItemContainer'));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
