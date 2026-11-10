// Page navigator (‹ Trước / numbers / Sau ›) with the "…" jump-to-page input.

import { app } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { navigate } from '../core/nav.js';
import { getInfiniteScroll } from '../lib/settings.js';
import { armInfiniteScroll } from './infiniteScroll.js';

export function pagination(p, makeHref, extraHtml = '', { scrollArm = true } = {}) {
  if (!p || !p.last_page || p.last_page <= 1) return '';
  const current = p.current_page || 1;
  const last = p.last_page;
  const pages = new Set([1, last, current, current - 1, current + 1, current - 2, current + 2]);
  const list = [...pages].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  let items = '';
  let prev = 0;
  for (const n of list) {
    if (prev && n - prev > 1) {
      items += `<li class="pageNav-skip"><button type="button" class="pageNav-jumpBtn" data-last="${last}" title="Đi tới trang">…</button></li>`;
    }
    // `--edge` marks the first and last page, `--far` the pages two steps out. Narrow screens drop `--far` so
    // the first, last and neighbouring pages stay reachable.
    const classes = ['pageNav-page'];
    if (n === current) classes.push('is-current');
    if (n === 1 || n === last) classes.push('pageNav-page--edge');
    else if (Math.abs(n - current) > 1) classes.push('pageNav-page--far');
    const cls = classes.join(' ');
    items +=
      n === current
        ? `<li class="${cls}"><span class="current">${n}</span></li>`
        : `<li class="${cls}"><a href="${esc(makeHref(n))}">${n}</a></li>`;
    prev = n;
  }

  // "Kích hoạt theo người dùng yêu cầu": a one-click opt-in for this page. A thread renders two pagers, so only
  // the bottom one carries the control.
  const scrollBtn =
    scrollArm && current < last && getInfiniteScroll() === 'manual'
      ? `<button type="button" class="pageNav-scrollBtn" data-scroll-arm title="Bật cuộn liên tục cho trang này" aria-label="Bật cuộn liên tục cho trang này"><span class="pageNav-scrollIcon" aria-hidden="true">⇣</span></button>`
      : '';

  return `<div class="pageNav">
    ${current > 1 ? `<a href="${esc(makeHref(current - 1))}" class="pageNav-jump">‹ Trước</a>` : ''}
    <ul class="pageNav-main">${items}</ul>
    ${current < last ? `<a href="${esc(makeHref(current + 1))}" class="pageNav-jump">Sau ›</a>` : ''}
    ${scrollBtn}
    ${extraHtml ? `<span class="pageNav-extra">${extraHtml}</span>` : ''}
  </div>`;
}

// Arms infinite scrolling for the current page from the pager button.
export function wireScrollArm() {
  for (const btn of app.querySelectorAll('[data-scroll-arm]')) {
    if (btn.dataset.wired) continue;
    btn.dataset.wired = '1';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      if (!armInfiniteScroll()) return;
      btn.disabled = true;
      btn.classList.add('is-active');
      btn.innerHTML = '<span class="pageNav-scrollIcon" aria-hidden="true">⇣</span>';
      btn.title = 'Đang cuộn liên tục';
      btn.setAttribute('aria-label', 'Đang cuộn liên tục');
    });
  }
}

// Clicking "…" swaps it for a number input so any page can be jumped to.
export function wirePageJump(makeHref) {
  for (const btn of app.querySelectorAll('.pageNav-jumpBtn')) {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      if (btn.dataset.active === '1') return;
      btn.dataset.active = '1';
      const last = Number(btn.dataset.last) || 1;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = String(last);
      input.className = 'pageNav-input';
      input.placeholder = `1-${last}`;
      btn.replaceWith(input);
      input.focus();
      const go = () => {
        const n = Math.min(Math.max(Number(input.value) || 0, 1), last);
        if (n) navigate(makeHref(n));
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        } else if (e.key === 'Escape') {
          input.replaceWith(btn);
          btn.dataset.active = '0';
        }
      });
      input.addEventListener('blur', () => {
        if (input.isConnected) {
          input.replaceWith(btn);
          btn.dataset.active = '0';
        }
      });
    });
  }
}
