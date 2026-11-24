/** Title long-press. */

export function wireTitleHold(title, activate) {
  let timer;
  let pointerId;
  let startX;
  let startY;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pointerId = undefined;
  };
  title.addEventListener('pointerdown', (event) => {
    cancel();
    if (!matchMedia('(max-width: 620px)').matches || !event.isPrimary || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      cancel();
      if (title.isConnected) activate();
    }, 1500);
  });
  title.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId && Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
  });
  for (const name of ['pointerup', 'pointercancel', 'pointerleave']) title.addEventListener(name, cancel);
  title.addEventListener('contextmenu', (event) => {
    if (matchMedia('(max-width: 620px)').matches) event.preventDefault();
  });
  title.addEventListener('keydown', (event) => {
    if (matchMedia('(max-width: 620px)').matches && !event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      activate();
    }
  });
}
