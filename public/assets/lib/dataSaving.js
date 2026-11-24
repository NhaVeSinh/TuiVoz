/** Data-saving switch. */

import { loadSettings } from './settings.js';
import { toast } from '../ui/feedback.js';

const connection = typeof navigator !== 'undefined'
  ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
  : null;

// Latch so the activation toast fires once per activation.
let autoActive = null;

function evaluateAuto() {
  if (!connection) return false;
  const active = connection.saveData === true
    || ['slow-2g', '2g'].includes(connection.effectiveType)
    || connection.type === 'cellular';
  if (autoActive === true || active === autoActive) {
    autoActive = active;
  } else if (active) {
    // First activation: toast, or a silent flip reads as a bug.
    autoActive = true;
    toast('Tiết kiệm dữ liệu: bật tự động theo thiết bị');
  } else {
    autoActive = false;
  }
  return active;
}

export function isDataSaving() {
  const mode = loadSettings().dataSaving;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return evaluateAuto();
}

// Network changes mid-session: re-evaluate auto state (toasts on activation).
connection?.addEventListener?.('change', () => {
  if (loadSettings().dataSaving === 'auto') evaluateAuto();
});
