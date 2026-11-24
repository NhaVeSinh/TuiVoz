/** DOM handles + global state. */

export const app = document.getElementById('app');
export const breadcrumbsEl = document.getElementById('breadcrumbs');
export const accountEl = document.getElementById('header-account');
export const navEl = document.getElementById('nav-list');
export const toastEl = document.getElementById('toast');
export const modalRoot = document.getElementById('modal-root');

export const state = {
  me: null,
  loggedIn: false,
  reactions: null,
  nodes: null,
  config: null,
};
