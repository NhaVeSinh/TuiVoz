// Tiết kiệm dữ liệu. `isDataSaving()` is the one switch every saving lever asks at the moment it would spend
// data: the 3-state setting (Tự động/Bật/Tắt) plus, in auto mode, only what the browser itself reports —
// cellular, Data Saver (saveData), or a 2G effective type. Auto targets mobile-data users and nobody else:
// on WiFi, desktop, or browsers without the connection API (Firefox, iOS), auto stays off and the manual
// toggle is the path. Connection changes (WiFi ↔ cellular, Data Saver toggled) re-evaluate and toast once on
// activation; consumers don't listen — they re-check at their own trigger points, so mode changes only affect
// content fetched after them.

import { loadSettings } from './settings.js';
import { toast } from '../ui/feedback.js';

const connection = typeof navigator !== 'undefined'
  ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
  : null;

// Remembered between evaluations so the activation toast fires once per activation, not on every call.
let autoActive = null;

function evaluateAuto() {
  if (!connection) return false;
  const active = connection.saveData === true
    || ['slow-2g', '2g'].includes(connection.effectiveType)
    || connection.type === 'cellular';
  if (autoActive === true || active === autoActive) {
    autoActive = active;
  } else if (active) {
    // First activation this page load: say so, or a silent behaviour flip reads as a bug.
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

// WiFi ↔ cellular or Data Saver toggled mid-session: refresh the remembered auto state (which toasts on a new
// activation). Consumers re-check isDataSaving() at their own trigger points.
connection?.addEventListener?.('change', () => {
  if (loadSettings().dataSaving === 'auto') evaluateAuto();
});
