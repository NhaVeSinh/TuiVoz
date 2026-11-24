/** Modals. */

import { modalRoot } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { api } from '../api.js';
import { toast } from './feedback.js';

export function openModal(title, bodyHtml, footerHtml, { className = '' } = {}) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal${className ? ` ${className}` : ''}" role="dialog" aria-modal="true">
        <div class="modal-header">${esc(title)}<button type="button" data-close>&times;</button></div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  const close = () => {
    modalRoot.innerHTML = '';
  };
  modalRoot.querySelector('[data-close]').addEventListener('click', close);
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) close();
  });
  return { close, root: modalRoot };
}

export function openReportModal(postId) {
  const { close } = openModal(
    'Báo cáo bài viết',
    `<form id="report-form">
       <div class="formRow">
         <label for="report-message">Lý do</label>
         <textarea class="textarea" id="report-message" placeholder="Mô tả vấn đề…"></textarea>
       </div>
     </form>`,
    `<button class="button" type="button" data-cancel>Huỷ</button>
     <button class="button button--primary" type="submit" form="report-form">Gửi báo cáo</button>`
  );
  modalRoot.querySelector('[data-cancel]').addEventListener('click', close);
  modalRoot.querySelector('#report-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('report-message').value.trim();
    if (!message) return toast('Nhập lý do', true);
    try {
      await api.reportPost(postId, message);
      close();
      toast('Đã gửi báo cáo');
    } catch (err) {
      toast(err.message || 'Gửi báo cáo thất bại', true);
    }
  });
}
