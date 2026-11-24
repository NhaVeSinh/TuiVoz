/** Image resizer. */

const MIN_WIDTH = 16;
const HANDLES = ['nw', 'ne', 'sw', 'se'];

export function attachImageResizer(editor, visual) {
  const box = document.createElement('div');
  box.className = 'image-resizer';
  box.hidden = true;
  box.innerHTML = HANDLES.map((h) => `<span class="image-resizer-handle image-resizer-handle--${h}" data-handle="${h}"></span>`).join('');
  const badge = document.createElement('span');
  badge.className = 'image-resizer-badge';
  box.append(badge);
  document.body.append(box);

  let target = null;
  let drag = null;

  const picture = (element) => element?.closest?.('img[data-bb-tag], img[data-bb-attach-id]') || null;

  const natural = (img) => {
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    return { width, height };
  };

  const place = () => {
    if (!target || !target.isConnected) { box.hidden = true; target = null; return; }
    const rect = target.getBoundingClientRect();
    box.hidden = false;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    badge.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  };

  // Keeps aspect ratio, like the plugin's `imageResize` default.
  const applyWidth = (width) => {
    if (!target) return;
    const { width: naturalWidth, height: naturalHeight } = natural(target);
    const next = Math.max(MIN_WIDTH, Math.round(width));
    target.style.width = `${next}px`;
    if (naturalWidth && naturalHeight) {
      target.style.height = '';
      target.style.objectFit = 'contain';
      target.style.height = `${Math.round((naturalHeight * next) / naturalWidth)}px`;
    }
    target.dataset.bbResized = '1';
    place();
  };

  const select = (img) => {
    if (target === img) { place(); return; }
    target = img;
    if (img) img.classList.add('is-image-resizing');
    place();
  };

  document.querySelectorAll('.is-image-resizing').forEach((el) => el.classList.remove('is-image-resizing'));
  const clear = () => {
    target?.classList.remove('is-image-resizing');
    target = null;
    box.hidden = true;
  };

  visual.addEventListener('click', (event) => {
    const img = picture(event.target);
    if (img) select(img); else clear();
  });
  visual.addEventListener('keydown', (event) => { if (event.key === 'Escape') clear(); });

  for (const handle of box.querySelectorAll('.image-resizer-handle')) {
    handle.addEventListener('pointerdown', (event) => {
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      const west = handle.dataset.handle.includes('w');
      drag = { startX: event.clientX, startWidth: rect.width, west };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const delta = drag.west ? drag.startX - event.clientX : event.clientX - drag.startX;
      applyWidth(drag.startWidth + delta);
    });
    const end = () => {
      if (drag) visual.dispatchEvent(new Event('input', { bubbles: true }));
      drag = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // Type-a-width dialog; the badge doubles as the trigger.
  badge.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!target) return;
    const value = window.prompt('Chiều rộng ảnh (px)', String(Math.round(target.getBoundingClientRect().width)));
    if (value === null || value === undefined) return;
    const width = parseInt(value, 10);
    if (Number.isFinite(width)) {
      applyWidth(width);
      visual.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const observer = new ResizeObserver(() => place());
  observer.observe(visual);
  const reposition = () => { if (target) place(); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  new MutationObserver(() => { if (target && !target.isConnected) clear(); }).observe(visual, { childList: true, subtree: true });

  return { clear, refresh: place };
}
