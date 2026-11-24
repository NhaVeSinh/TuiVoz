/** Editor toolbar. */
import { esc } from '../core/utils.js';
import { safeEditorUrl } from '../lib/editorCodec.js';
import { loadSmilies, smilieChoices } from '../lib/smilies.js';
import { renderStickerPicker } from './stickerPicker.js';
import { uploadImageFiles, pikBbcode } from '../lib/pikUpload.js';

// FA5 Pro glyphs as voz.vn paints them, filled not stroked.
const paths = {
  bold: ['0 0 384 512', 'M314.52 238.78A119.76 119.76 0 0 0 232 32H48a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h16v352H48a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h208a128 128 0 0 0 128-128c0-49.49-28.38-91.92-69.48-113.22zM128 80h88a72 72 0 0 1 0 144h-88zm112 352H128V272h112a80 80 0 0 1 0 160z'],
  italic: ['0 0 320 512', 'M320 48v16a16 16 0 0 1-16 16h-67l-88 352h59a16 16 0 0 1 16 16v16a16 16 0 0 1-16 16H16a16 16 0 0 1-16-16v-16a16 16 0 0 1 16-16h67l88-352h-59a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h192a16 16 0 0 1 16 16z'],
  underline: ['0 0 448 512', 'M32 48h32v208c0 88.22 71.78 160 160 160s160-71.78 160-160V48h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H288a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h32v208a96 96 0 0 1-192 0V48h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H32a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16zm400 416H16a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16z'],
  strikeThrough: ['0 0 512 512', 'M150.39 208h113.17l-46.31-23.16a45.65 45.65 0 0 1 0-81.68A67.93 67.93 0 0 1 247.56 96H310a45.59 45.59 0 0 1 36.49 18.25l15.09 20.13a16 16 0 0 0 22.4 3.21l25.62-19.19a16 16 0 0 0 3.21-22.4L397.7 75.84A109.44 109.44 0 0 0 310.1 32h-62.54a132.49 132.49 0 0 0-58.94 13.91c-40.35 20.17-64.19 62.31-60.18 108 1.76 20.09 10.02 38.37 21.95 54.09zM496 240H16a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h480a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zm-92.5 80h-91.07l14.32 7.16a45.65 45.65 0 0 1 0 81.68 67.93 67.93 0 0 1-30.31 7.16H234a45.59 45.59 0 0 1-36.49-18.25l-15.09-20.13a16 16 0 0 0-22.4-3.21L134.4 393.6a16 16 0 0 0-3.21 22.4l15.11 20.17A109.44 109.44 0 0 0 233.9 480h62.54a132.42 132.42 0 0 0 58.93-13.91c40.36-20.17 64.2-62.31 60.19-108-1.19-13.69-5.89-26.27-12.06-38.09z'],
  list: ['0 0 512 512', 'M80 48H16A16 16 0 0 0 0 64v64a16 16 0 0 0 16 16h64a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16zm0 160H16a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h64a16 16 0 0 0 16-16v-64a16 16 0 0 0-16-16zm0 160H16a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h64a16 16 0 0 0 16-16v-64a16 16 0 0 0-16-16zm416-136H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zm0 160H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zm0-320H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16V88a16 16 0 0 0-16-16z'],
  ordered: ['0 0 512 512', 'M61.77 401l17.5-20.15a19.92 19.92 0 0 0 5.07-14.19v-3.31C84.34 356 80.5 352 73 352H16a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h22.84a154.82 154.82 0 0 0-11 12.31l-5.61 7c-4 5.07-5.25 10.13-2.8 14.88l1.05 1.93c3 5.76 6.3 7.88 12.25 7.88h4.73c10.33 0 15.94 2.44 15.94 9.09 0 4.72-4.2 8.22-14.36 8.22a41.54 41.54 0 0 1-15.47-3.12c-6.49-3.88-11.74-3.5-15.6 3.12l-5.59 9.31c-3.73 6.13-3.2 11.72 2.62 15.94 7.71 4.69 20.39 9.44 37 9.44 34.16 0 48.5-22.75 48.5-44.12-.03-14.38-9.12-29.76-28.73-34.88zM496 392H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zm0-320H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16V88a16 16 0 0 0-16-16zm0 160H176a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zM16 160h64a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8H64V40a8 8 0 0 0-8-8H32a8 8 0 0 0-7.14 4.42l-8 16A8 8 0 0 0 24 64h8v64H16a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8zm-3.9 160H80a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8H41.33c3.28-10.29 48.33-18.68 48.33-56.44 0-29.06-25-39.56-44.47-39.56-21.36 0-33.8 10-40.45 18.75-4.38 5.59-3 10.84 2.79 15.37l8.58 6.88c5.61 4.56 11 2.47 16.13-2.44a13.4 13.4 0 0 1 9.45-3.84c3.33 0 9.28 1.56 9.28 8.75C51 248.19 0 257.31 0 304.59v4C0 316 5.08 320 12.1 320z'],
  url: ['0 0 512 512', 'M314.222 197.78c51.091 51.091 54.377 132.287 9.75 187.16-6.242 7.73-2.784 3.865-84.94 86.02-54.696 54.696-143.266 54.745-197.99 0-54.711-54.69-54.734-143.255 0-197.99 32.773-32.773 51.835-51.899 63.409-63.457 7.463-7.452 20.331-2.354 20.486 8.192a173.31 173.31 0 0 0 4.746 37.828c.966 4.029-.272 8.269-3.202 11.198L80.632 312.57c-32.755 32.775-32.887 85.892 0 118.8 32.775 32.755 85.892 32.887 118.8 0l75.19-75.2c32.718-32.725 32.777-86.013 0-118.79a83.722 83.722 0 0 0-22.814-16.229c-4.623-2.233-7.182-7.25-6.561-12.346 1.356-11.122 6.296-21.885 14.815-30.405l4.375-4.375c3.625-3.626 9.177-4.594 13.76-2.294 12.999 6.524 25.187 15.211 36.025 26.049zM470.958 41.04c-54.724-54.745-143.294-54.696-197.99 0-82.156 82.156-78.698 78.29-84.94 86.02-44.627 54.873-41.341 136.069 9.75 187.16 10.838 10.838 23.026 19.525 36.025 26.049 4.582 2.3 10.134 1.331 13.76-2.294l4.375-4.375c8.52-8.519 13.459-19.283 14.815-30.405.621-5.096-1.938-10.113-6.561-12.346a83.706 83.706 0 0 1-22.814-16.229c-32.777-32.777-32.718-86.065 0-118.79l75.19-75.2c32.908-32.887 86.025-32.755 118.8 0 32.887 32.908 32.755 86.025 0 118.8l-45.848 45.84c-2.93 2.929-4.168 7.169-3.202 11.198a173.31 173.31 0 0 1 4.746 37.828c.155 10.546 13.023 15.644 20.486 8.192 11.574-11.558 30.636-30.684 63.409-63.457 54.733-54.735 54.71-143.3-.001-197.991z'],
  img: ['0 0 512 512', 'M464 64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V112c0-26.51-21.49-48-48-48zm-6 336H54a6 6 0 0 1-6-6V118a6 6 0 0 1 6-6h404a6 6 0 0 1 6 6v276a6 6 0 0 1-6 6zM128 152c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zM96 352h320v-80l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L192 304l-39.515-39.515c-4.686-4.686-12.284-4.686-16.971 0L96 304v48z'],
  media: ['0 0 640 512', 'M608 0H160c-17.67 0-32 13.13-32 29.33V112h48V48h48v64h48V48h224v304h112c17.67 0 32-13.13 32-29.33V29.33C640 13.13 625.67 0 608 0zm-16 304h-48v-56h48zm0-104h-48v-48h48zm0-96h-48V48h48zM128 320a32 32 0 1 0-32-32 32 32 0 0 0 32 32zm288-160H32a32 32 0 0 0-32 32v288a32 32 0 0 0 32 32h384a32 32 0 0 0 32-32V192a32 32 0 0 0-32-32zm-16 240L299.31 299.31a16 16 0 0 0-22.62 0L176 400l-36.69-36.69a16 16 0 0 0-22.62 0L48 432V208h352z'],
  quote: ['0 0 576 512', 'M200 32H72C32.3 32 0 64.3 0 104v112c0 39.7 32.3 72 72 72h56v8c0 22.1-17.9 40-40 40h-8c-26.5 0-48 21.5-48 48v48c0 26.5 21.5 48 48 48h8c101.5 0 184-82.5 184-184V104c0-39.7-32.3-72-72-72zm24 264c0 75-61 136-136 136h-8v-48h8c48.5 0 88-39.5 88-88v-56H72c-13.2 0-24-10.8-24-24V104c0-13.2 10.8-24 24-24h128c13.2 0 24 10.8 24 24v192zM504 32H376c-39.7 0-72 32.3-72 72v112c0 39.7 32.3 72 72 72h56v8c0 22.1-17.9 40-40 40h-8c-26.5 0-48 21.5-48 48v48c0 26.5 21.5 48 48 48h8c101.5 0 184-82.5 184-184V104c0-39.7-32.3-72-72-72zm24 264c0 75-61 136-136 136h-8v-48h8c48.5 0 88-39.5 88-88v-56H376c-13.2 0-24-10.8-24-24V104c0-13.2 10.8-24 24-24h128c13.2 0 24 10.8 24 24v192z'],
  spoiler: ['0 0 640 512', 'M634 471L36 3.51A16 16 0 0 0 13.51 6l-10 12.49A16 16 0 0 0 6 41l598 467.49a16 16 0 0 0 22.49-2.49l10-12.49A16 16 0 0 0 634 471zM296.79 146.47l134.79 105.38C429.36 191.91 380.48 144 320 144a112.26 112.26 0 0 0-23.21 2.47zm46.42 219.07L208.42 260.16C210.65 320.09 259.53 368 320 368a113 113 0 0 0 23.21-2.46zM320 112c98.65 0 189.09 55 237.93 144a285.53 285.53 0 0 1-44 60.2l37.74 29.5a333.7 333.7 0 0 0 52.9-75.11 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64c-36.7 0-71.71 7-104.63 18.81l46.41 36.29c18.94-4.3 38.34-7.1 58.22-7.1zm0 288c-98.65 0-189.08-55-237.93-144a285.47 285.47 0 0 1 44.05-60.19l-37.74-29.5a333.6 333.6 0 0 0-52.89 75.1 32.35 32.35 0 0 0 0 29.19C89.72 376.41 197.08 448 320 448c36.7 0 71.71-7.05 104.63-18.81l-46.41-36.28C359.28 397.2 339.89 400 320 400z'],
  ispoiler: ['0 0 640 512', 'M320.67 64c-442.6 0-357.57 384-158.46 384 39.9 0 77.47-20.69 101.42-55.86l25.73-37.79c7.83-11.5 19.57-17.25 31.31-17.25 11.74 0 23.49 5.75 31.31 17.25l25.73 37.79C401.66 427.31 439.23 448 479.13 448c189.86 0 290.63-384-158.46-384zm158.46 331.64c-24.57 0-48.08-12.98-62.88-34.72l-25.73-37.79c-16.61-24.39-42.07-38.38-69.85-38.38-27.78 0-53.24 13.99-69.85 38.38l-25.73 37.79c-14.8 21.74-38.31 34.72-62.88 34.72C93.89 395.64 48 332.11 48 272.77c0-38.62 18.1-73.1 52.35-99.7 33.3-25.87 98.55-56.71 220.32-56.71 122.22 0 187.15 30.17 220.1 55.48 33.52 25.75 51.23 59.42 51.23 97.37 0 59.8-46.35 126.43-112.87 126.43zM192 186.18c-39.11 0-64.53 25.66-76.27 41.05-4.98 6.53-4.98 16.1 0 22.63 11.73 15.4 37.16 41.05 76.27 41.05s64.53-25.66 76.27-41.05c4.98-6.53 4.98-16.09 0-22.63-11.74-15.39-37.16-41.05-76.27-41.05zm256 0c-39.11 0-64.53 25.66-76.27 41.05-4.98 6.53-4.98 16.1 0 22.63 11.73 15.4 37.16 41.05 76.27 41.05s64.53-25.66 76.27-41.05c4.98-6.53 4.98-16.09 0-22.63-11.74-15.39-37.16-41.05-76.27-41.05z'],
  code: ['0 0 576 512', 'M234.8 511.7L196 500.4c-4.2-1.2-6.7-5.7-5.5-9.9L331.3 5.8c1.2-4.2 5.7-6.7 9.9-5.5L380 11.6c4.2 1.2 6.7 5.7 5.5 9.9L244.7 506.2c-1.2 4.3-5.6 6.7-9.9 5.5zm-83.2-121.1l27.2-29c3.1-3.3 2.8-8.5-.5-11.5L72.2 256l106.1-94.1c3.4-3 3.6-8.2.5-11.5l-27.2-29c-3-3.2-8.1-3.4-11.3-.4L2.5 250.2c-3.4 3.2-3.4 8.5 0 11.7L140.3 391c3.2 3 8.2 2.8 11.3-.4zm284.1.4l137.7-129.1c3.4-3.2 3.4-8.5 0-11.7L435.7 121c-3.2-3-8.3-2.9-11.3.4l-27.2 29c-3.1 3.3-2.8 8.5.5 11.5L503.8 256l-106.1 94.1c-3.4 3-3.6 8.2-.5 11.5l27.2 29c3.1 3.2 8.1 3.4 11.3.4z'],
  icode: ['0 0 640 512', 'M41.678 38.101l209.414 209.414c4.686 4.686 4.686 12.284 0 16.971L41.678 473.899c-4.686 4.686-12.284 4.686-16.971 0L4.908 454.101c-4.686-4.686-4.686-12.284 0-16.971L185.607 256 4.908 74.87c-4.686-4.686-4.686-12.284 0-16.971L24.707 38.1c4.686-4.686 12.284-4.686 16.971.001zM640 468v-28c0-6.627-5.373-12-12-12H300c-6.627 0-12 5.373-12 12v28c0 6.627 5.373 12 12 12h328c6.627 0 12-5.373 12-12z'],
  smilies: ['0 0 496 512', 'M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z'],
  // Fluent "sticker" glyph; stroked too since its hairlines sit beside solid FA icons.
  stickers: ['0 0 20 20', 'M15.1111 2C16.6516 2 17.9104 3.20574 17.9954 4.72496L18 4.88889V10.9303C18 11.4607 17.8104 11.9716 17.4686 12.3723L17.3491 12.5016L12.5016 17.3491C12.1266 17.7242 11.6312 17.9513 11.1062 17.993L10.9303 18H4.88889C3.34842 18 2.08956 16.7943 2.00457 15.275L2 15.1111V4.88889C2 3.34842 3.20574 2.08956 4.72496 2.00457L4.88889 2H15.1111ZM15.0312 3H4.96875C3.92674 3 3.07381 3.80952 3.00454 4.83396L3 4.96875V15.0312C3 16.0733 3.80952 16.9262 4.83396 16.9955L4.96875 17H10.9975L10.9978 13.9081C9.29 14.2258 7.45995 13.7199 6.1449 12.3932C5.95049 12.1971 5.95189 11.8805 6.148 11.6861C6.34412 11.4917 6.6607 11.4931 6.8551 11.6892C7.98504 12.8291 9.58103 13.2262 11.0356 12.8779C11.0412 12.8195 11.0478 12.7692 11.055 12.7237C11.4394 11.6918 12.4071 11.0688 13.5574 11.0045L13.7188 11H17V4.96875C17 3.92674 16.1905 3.07381 15.166 3.00454L15.0312 3ZM16.5846 12.0003L13.8232 12C12.8582 12 12.0684 12.7497 12.0042 13.6984L12 13.8232V16.584L12.0869 16.506L16.506 12.0869C16.5337 12.0592 16.5599 12.0303 16.5846 12.0003ZM7 7C7.55228 7 8 7.44772 8 8C8 8.55228 7.55228 9 7 9C6.44772 9 6 8.55228 6 8C6 7.44772 6.44772 7 7 7ZM13 7C13.5523 7 14 7.44772 14 8C14 8.55228 13.5523 9 13 9C12.4477 9 12 8.55228 12 8C12 7.44772 12.4477 7 13 7Z', '1.1'],
  table: ['0 0 512 512', 'M464 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V80c0-26.51-21.49-48-48-48zM232 432H54a6 6 0 0 1-6-6V296h184v136zm0-184H48V112h184v136zm226 184H280V296h184v130a6 6 0 0 1-6 6zm6-184H280V112h184v136z'],
  hr: ['0 0 640 512', 'M640 247.5v17a16 16 0 0 1-16 16H16a16 16 0 0 1-16-16v-17a16 16 0 0 1 16-16h608a16 16 0 0 1 16 16z'],
  undo: ['0 0 512 512', 'M12 8h27.711c6.739 0 12.157 5.548 11.997 12.286l-2.347 98.568C93.925 51.834 170.212 7.73 256.793 8.001 393.18 8.428 504.213 120.009 504 256.396 503.786 393.181 392.835 504 256 504c-63.926 0-122.202-24.187-166.178-63.908-5.113-4.618-5.354-12.561-.482-17.433l19.738-19.738c4.498-4.498 11.753-4.785 16.501-.552C160.213 433.246 205.895 452 256 452c108.322 0 196-87.662 196-196 0-108.322-87.662-196-196-196-79.545 0-147.941 47.282-178.675 115.302l126.389-3.009c6.737-.16 12.286 5.257 12.286 11.997V212c0 6.627-5.373 12-12 12H12c-6.627 0-12-5.373-12-12V20C0 13.373 5.373 8 12 8z'],
  redo: ['0 0 512 512', 'M500 8h-27.711c-6.739 0-12.157 5.548-11.997 12.286l2.347 98.568C418.075 51.834 341.788 7.73 255.207 8.001 118.82 8.428 7.787 120.009 8 256.396 8.214 393.181 119.165 504 256 504c63.926 0 122.202-24.187 166.178-63.908 5.113-4.618 5.354-12.561.482-17.433l-19.738-19.738c-4.498-4.498-11.753-4.785-16.501-.552C351.787 433.246 306.105 452 256 452c-108.322 0-196-87.662-196-196 0-108.322 87.662-196 196-196 79.545 0 147.941 47.282 178.675 115.302l-126.389-3.009c-6.737-.16-12.286 5.257-12.286 11.997V212c0 6.627 5.373 12 12 12h192c6.627 0 12-5.373 12-12V20c0-6.627-5.373-12-12-12z'],
  clear: ['0 0 512 512', 'M497.94 273.94a48 48 0 0 0 0-67.88l-160-160a48 48 0 0 0-67.88 0l-256 256a48 48 0 0 0 0 67.88l96 96A48 48 0 0 0 144 480h356a12 12 0 0 0 12-12v-24a12 12 0 0 0-12-12H339.88l158.06-158.06zM304 80l160 160-103 103-160-160zM144 432l-96-96 119-119 160 160-55 55z'],
  mode: ['0 0 448 512', 'M128 32H32A32 32 0 0 0 0 64v384a32 32 0 0 0 32 32h96a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16H48V80h80a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zm288 0h-96a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h80v352h-80a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h96a32 32 0 0 0 32-32V64a32 32 0 0 0-32-32z'],
  preview: ['0 0 640 512', 'M603.32 473.39l-81.48-81.46a128 128 0 1 0-33.93 33.93l81.48 81.46a16 16 0 0 0 22.62 0L603.32 496a16 16 0 0 0 0-22.61zM416 400a80 80 0 1 1 80-80 80.09 80.09 0 0 1-80 80zM80 464V48.09h160v104a23.93 23.93 0 0 0 24 24h83.29c20.89-10 44-16.06 68.71-16.06V132a48.23 48.23 0 0 0-14.1-34L318 14.1A48 48 0 0 0 284.1 0H80a48.16 48.16 0 0 0-48 48.09V464a48 48 0 0 0 48 48h288a47.86 47.86 0 0 0 45.15-32.29A158.48 158.48 0 0 1 347.43 464zM288 52l76.1 76.08H288z'],
  more: ['0 0 128 512', 'M64 208c26.5 0 48 21.5 48 48s-21.5 48-48 48-48-21.5-48-48 21.5-48 48-48zM16 104c0 26.5 21.5 48 48 48s48-21.5 48-48-21.5-48-48-48-48 21.5-48 48zm0 304c0 26.5 21.5 48 48 48s48-21.5 48-48-21.5-48-48-48-48 21.5-48 48z'],
  size: ['0 0 640 512', 'M624 32H272a16 16 0 0 0-16 16v80a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V96h112v336h-48a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16h-48V96h112v32a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM304 224H16a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16v-32h80v160H96a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16h-32V272h80v32a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16v-64a16 16 0 0 0-16-16z'],
  color: ['0 0 512 512', 'M128 224c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.4-32-32-32zM418.6 58.1C359.2 9.3 281.3-10 204.6 5 104.9 24.4 24.7 104.2 5.1 203.7c-16.7 84.2 8.1 168.3 67.8 230.6 47.3 49.4 109.7 77.8 167.9 77.8 8.8 0 17.5-.6 26.1-2 24.2-3.7 44.6-18.7 56.1-41.1 12.3-24 12.3-52.7.2-76.6-6.1-12-5.5-26.2 1.8-38 7-11.8 18.7-18.4 32-18.4h72.2c46.4 0 82.8-35.7 82.8-81.3-.2-76.4-34.3-148.1-93.4-196.6zM429.2 288H357c-29.9 0-57.2 15.4-73 41.3-16 26.1-17.3 57.8-3.6 84.9 5.1 10.1 5.1 22.7-.2 32.9-2.6 5-8.7 13.7-20.6 15.6-49.3 7.7-108.9-16.6-152-61.6-48.8-50.9-69-119.4-55.4-188 15.9-80.6 80.8-145.3 161.6-161 62.6-12.3 126.1 3.5 174.3 43.1 48.1 39.5 75.7 97.6 75.9 159.6 0 18.6-15.3 33.2-34.8 33.2zM160 128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.4-32-32-32zm96-32.1c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32c0-17.6-14.3-32-32-32zm96 32.1c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32z'],
  font: ['0 0 448 512', 'M432 432h-33.32l-135-389.24A16 16 0 0 0 248.55 32h-49.1a16 16 0 0 0-15.12 10.76L49.32 432H16a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16h-35.44l33.31-96h164.26l33.31 96H304a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zM158.53 288L224 99.31 289.47 288z'],
  align: ['0 0 448 512', 'M12.83 344h262.34A12.82 12.82 0 0 0 288 331.17v-22.34A12.82 12.82 0 0 0 275.17 296H12.83A12.82 12.82 0 0 0 0 308.83v22.34A12.82 12.82 0 0 0 12.83 344zm0-256h262.34A12.82 12.82 0 0 0 288 75.17V52.83A12.82 12.82 0 0 0 275.17 40H12.83A12.82 12.82 0 0 0 0 52.83v22.34A12.82 12.82 0 0 0 12.83 88zM432 168H16a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16zm0 256H16a16 16 0 0 0-16 16v16a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16v-16a16 16 0 0 0-16-16z'],
  paragraph: ['0 0 448 512', 'M415 32H191a160 160 0 0 0 0 320h48v112a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V80h48v384a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V80h32a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM239 304h-48a112 112 0 0 1 0-224h48z'],
};
// Third tuple entry adds a stroke so thin glyphs match the solid ones.
export const editorIcon = (name) => {
  const [viewBox, d, strokeWidth] = paths[name] || paths.more;
  const stroke = strokeWidth
    ? ` stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round"`
    : '';
  return `<svg viewBox="${viewBox}" aria-hidden="true" fill="currentColor"${stroke}><path d="${d}"/></svg>`;
};
const labels = { bold: 'Đậm', italic: 'Nghiêng', underline: 'Gạch chân', strikeThrough: 'Gạch ngang', list: 'Danh sách', ordered: 'Danh sách số', url: 'Liên kết', img: 'Ảnh từ URL', media: 'Media từ URL', quote: 'Trích dẫn', spoiler: 'Spoiler', ispoiler: 'Spoiler trong dòng', code: 'Mã nguồn', icode: 'Mã trong dòng', smilies: 'Emoji', stickers: 'Sticker', table: 'Bảng', hr: 'Đường kẻ', undo: 'Hoàn tác', redo: 'Làm lại', clear: 'Xoá định dạng đoạn chọn', mode: 'Chuyển chế độ BBCode', preview: 'Xem trước', size: 'Cỡ chữ to' };
const panelTools = ['url', 'img', 'media', 'table', 'spoiler', 'quote', 'smilies', 'stickers'];
const button = (tool) => `<button type="button" data-tool="${tool}" title="${labels[tool]}" aria-label="${labels[tool]}"${tool === 'mode' ? ' aria-pressed="false"' : tool === 'preview' || panelTools.includes(tool) ? ' aria-expanded="false"' : ''}>${editorIcon(tool)}</button>`;
export { panelTools };
export function editorToolbar(id) {
  const more = (name, label) => `<button type="button" class="editor-more" data-menu="${name}" aria-label="${label}" title="${label}" aria-expanded="false" aria-controls="${esc(id)}-${name}">${editorIcon('more')}</button>`;
  const option = (name, label, content) => `<label class="editor-option" title="${label}">${editorIcon(name)}${content}</label>`;
  return `<div class="editor-toolbar" role="toolbar" aria-label="Định dạng nội dung">
    <div class="editor-group">${button('bold')}${button('italic')}${more('text', 'Thêm định dạng chữ')}</div>
    <div class="editor-group">${button('url')}${button('img')}${more('rich', 'Thêm nội dung')}</div>
    <div class="editor-group">${['quote','spoiler','smilies','stickers'].map(button).join('')}</div>
    <div class="editor-group editor-history">${button('undo')}${more('misc', 'Thêm công cụ')}</div>
    <div class="editor-group editor-preview-toggle">${button('preview')}</div>
    <div class="editor-overflow" id="${esc(id)}-text" data-menu-panel="text" hidden>
      ${option('size', 'Cỡ chữ', '<select data-option="size" aria-label="Cỡ chữ"><option value="">Cỡ chữ</option>' + [1,2,3,4,5,6,7].map(n => `<option>${n}</option>`).join('') + '</select>')}
      ${option('color', 'Màu chữ', '<input type="color" data-option="color" value="#223366" aria-label="Màu chữ">')}
      ${option('font', 'Phông chữ', '<select data-option="font" aria-label="Phông chữ"><option value="">Phông chữ</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Courier New</option></select>')}
      ${button('list')}${button('ordered')}
      ${option('align', 'Căn đoạn', '<select data-option="align" aria-label="Căn đoạn"><option value="">Căn đoạn</option><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option><option value="justify">Đều</option></select>')}
      ${option('paragraph', 'Định dạng đoạn', '<select data-option="paragraph" aria-label="Định dạng đoạn"><option value="">Định dạng đoạn</option><option value="normal">Văn bản thường</option><option value="large">Tiêu đề</option></select>')}
      ${['strikeThrough','underline','icode','ispoiler'].map(button).join('')}
    </div>
    <div class="editor-overflow" id="${esc(id)}-rich" data-menu-panel="rich" hidden>${['media','table','hr','spoiler','code'].map(button).join('')}</div>
    <div class="editor-overflow editor-misc" id="${esc(id)}-misc" data-menu-panel="misc" hidden>
      <div class="editor-menu-icons">${['redo','mode','clear'].map(button).join('')}</div>
      <div class="editor-drafts"><button type="button" data-tool="restore">Khôi phục nháp</button><button type="button" data-tool="discard">Xoá nháp</button></div>
    </div>
  </div>`;
}

// pik.vn upload strip; panel stays open after a batch.
function renderUploadStrip(container, insert) {
  container.innerHTML = `
    <div class="editor-upload">
      <label class="editor-upload-drop">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif" multiple hidden>
        <span>Chọn ảnh hoặc kéo thả vào đây</span>
      </label>
      <div class="editor-upload-status" role="status"></div>
      <ul class="editor-upload-list"></ul>
    </div>`;
  const input = container.querySelector('input[type=file]');
  const drop = container.querySelector('.editor-upload-drop');
  const status = container.querySelector('.editor-upload-status');
  const list = container.querySelector('.editor-upload-list');

  let busy = false;
  const row = (text, tone = '') => {
    const item = document.createElement('li');
    item.className = `editor-upload-row${tone ? ` is-${tone}` : ''}`;
    item.textContent = text;
    list.prepend(item);
    return item;
  };

  const handle = async (files) => {
    if (busy || !files?.length) return;
    busy = true;
    drop.classList.add('is-busy');
    list.replaceChildren();
    status.textContent = 'Đang tải ảnh lên…';
    try {
      // Image panel posts [IMG] via pik.vn, never the attachment API.
      const { results, skipped } = await uploadImageFiles(files, (done, total) => {
        status.textContent = `Đang tải ảnh lên… ${done}/${total}`;
      });
      const ok = results.filter((result) => result.ok && result.url);
      if (ok.length) insert(ok.map((result) => pikBbcode(result.url)).join('\n'));
      for (const result of ok) row(`${result.file.name || 'ảnh'} → đã chèn`, 'ok');
      for (const result of results.filter((item) => !item.ok)) row(`${result.file.name || 'ảnh'} → ${result.error}`, 'error');
      if (skipped) row(`${skipped} tệp không phải ảnh đã bỏ qua`, 'error');
      status.textContent = ok.length ? `Đã chèn ${ok.length} ảnh.` : 'Không chèn được ảnh nào.';
    } catch (error) {
      status.textContent = error.message || 'Tải ảnh lên thất bại.';
    } finally {
      busy = false;
      drop.classList.remove('is-busy');
      input.value = '';
    }
  };

  input.addEventListener('change', () => handle(input.files));
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => { event.preventDefault(); handle(event.dataTransfer?.files); });
}

export function showToolPanel(panel, kind, insert, selectionText) {
  panel.hidden = false;
  // Not data-tool, or the toolbar button lookup would match it.
  panel.dataset.panelKind = kind;
  panel.dataset.panelFor = panel.closest('.rich-editor')?.dataset.editorId || 'ed';
  const close = () => panel.dispatchEvent(new Event('editor:panel-close'));
  const add = (code) => { insert(code); close(); };
  if (kind === 'stickers') {
    renderStickerPicker(panel, insert);
    return;
  }
  if (kind === 'smilies') {
    // Floating emoji popup under the toolbar.
    panel.innerHTML = `<div class="editor-popup editor-popup--emoji"><div class="editor-popup-body"><div class="editor-smilies"></div></div></div>`;
    const grid = panel.querySelector('.editor-smilies');
    const choice = (smilie, code) => {
      const label = smilie.title;
      const button = document.createElement('button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
      if (smilie.image_url && safeEditorUrl(smilie.image_url)) {
        const img = document.createElement('img');
        img.src = smilie.image_url;
        img.alt = code;
        img.loading = 'lazy';
        // `sizes` pins layout to the 1x size so 2x stays sharp, not bigger.
        if (smilie.image_url_2x && safeEditorUrl(smilie.image_url_2x)) {
          img.srcset = `${smilie.image_url} 1x, ${smilie.image_url_2x} 2x`;
          img.sizes = '24px';
        }
        button.append(img);
      } else button.textContent = code;
      // Picker stays open for repeated picks.
      button.onclick = () => insert(code);
      grid.append(button);
    };
    const message = document.createElement('span'); message.textContent = 'Đang tải emoji VOZ…'; grid.append(message);
    loadSmilies().then(() => {
      if (!grid.isConnected) return;
      message.textContent = smilieChoices().length ? '' : 'Không tải được emoji VOZ.';
      for (const smilie of smilieChoices()) if (smilie.codes?.[0]) choice(smilie, smilie.codes[0]);
    });
    return;
  }
  const urlTool = ['url', 'img', 'media'].includes(kind);
    // Floating-label fields like voz.vn's link popup.
    const field = (key, label, attrs = '') => `<div class="editor-field"><input data-field="${key}" id="${esc(panel.dataset.panelFor || 'ed')}-${key}" ${attrs}><label for="${esc(panel.dataset.panelFor || 'ed')}-${key}">${label}</label></div>`;
    const fields = urlTool
      ? field('url', 'URL', `type="url" placeholder=" " value="${esc(/^https?:\/\//i.test(selectionText) ? selectionText : '')}"`) + (kind === 'url' ? field('label', 'Văn bản', `placeholder=" " value="${esc(selectionText)}"`) : '')
      : kind === 'table'
        ? field('rows', 'Hàng', 'type="number" min="1" max="20" value="2"') + field('cols', 'Cột', 'type="number" min="1" max="10" value="2"')
        : field('label', kind === 'spoiler' ? 'Tiêu đề' : 'Tác giả', 'placeholder=" "');
    // "Ảnh từ URL" also accepts files.
  const upload = kind === 'img' ? '<div class="editor-upload-slot"></div>' : '';
    panel.innerHTML = `<div class="editor-popup"><div class="editor-popup-body">${fields}${upload}<div class="editor-popup-actions"><button type="button" class="editor-popup-submit" data-insert>Chèn</button></div><span class="editor-popup-alert" role="alert"></span></div></div>`;
    panel.querySelector('[data-dismiss]')?.remove();
  if (kind === 'img') renderUploadStrip(panel.querySelector('.editor-upload-slot'), insert);
  panel.querySelector('[data-insert]').onclick = () => {
    const get = (key) => panel.querySelector(`[data-field="${key}"]`)?.value.trim() || '';
    if (urlTool) {
      const url = safeEditorUrl(get('url'));
      if (!url) { panel.querySelector('[role="alert"]').textContent = 'Chỉ chấp nhận URL http(s) hợp lệ, không có thông tin đăng nhập.'; return; }
      if (kind === 'media') {
        const parsed = new URL(url);
        let site, key;
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
          site = 'youtube'; key = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
          if (!/^[\w-]{11}$/.test(key || '')) key = null;
        } else if (['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'].includes(parsed.hostname)) {
          site = 'twitter'; key = parsed.pathname.match(/\/status\/(\d+)/)?.[1];
        } else if (['tiktok.com', 'www.tiktok.com'].includes(parsed.hostname)) {
          site = 'tiktok'; key = parsed.pathname.match(/\/video\/(\d+)/)?.[1];
        } else if (['reddit.com', 'www.reddit.com'].includes(parsed.hostname)) {
          site = 'reddit'; key = parsed.pathname.match(/^\/r\/(\w+\/comments\/[a-z0-9]+(?:\/[\w-]*)?)/i)?.[1];
        } else if (['imgur.com', 'www.imgur.com', 'i.imgur.com', 'm.imgur.com'].includes(parsed.hostname)) {
          site = 'imgur'; key = parsed.pathname.match(/^\/(?:gallery\/|a\/)?([\w-]{5,12})(?:\.[a-z0-9]+)?\/?(?:embed)?\/?$/i)?.[1];
          if (!/^[\w-]{5,12}$/.test(key || '')) key = null;
        }
        if (!key) { panel.querySelector('[role="alert"]').textContent = 'Hỗ trợ URL YouTube, X/Twitter, TikTok, Reddit, Imgur. Với nguồn khác, dùng Liên kết.'; return; }
        add(`[MEDIA=${site}]${key}[/MEDIA]`);
      } else add(kind === 'url' ? `[URL=${url}]${get('label') || url}[/URL]` : `[IMG]${url}[/IMG]`);
    } else if (kind === 'table') {
      const rows = Number(get('rows')), cols = Number(get('cols'));
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || rows > 20 || cols < 1 || cols > 10) { panel.querySelector('[role="alert"]').textContent = 'Bảng: 1–20 hàng, 1–10 cột.'; return; }
      add(`[TABLE]${Array.from({ length: rows }, () => `[TR]${'[TD]…[/TD]'.repeat(cols)}[/TR]`).join('')}[/TABLE]\n`);
    } else {
      const label = get('label').replace(/[\[\]"\r\n]/g, '');
      add(`[${kind.toUpperCase()}${label ? `="${label}"` : ''}]${selectionText || '…'}[/${kind.toUpperCase()}]\n`);
    }
  };
  panel.querySelector('input')?.focus();
}
