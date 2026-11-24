# TuiVoz — Kiến trúc & Triển khai

**TuiVoz**: SPA thin-client phong cách voz.vn — Vanilla ES modules, **zero build tool** — + Edge Proxy (Vercel `sin1` / `dev-server.mjs` local). Không database riêng: mọi đọc/ghi đi qua XenForo 2 REST API của `voz.vn`.

- **Token**: client không giữ Bearer/Guest Key. Session lưu trong cookie HttpOnly `voz_session`; Edge proxy gắn `Authorization`/`XF-Api-Key`.
- **OAuth2 + PKCE**: userscript `public/userscript/` bắt `authorization_code` trên voz.vn → `/api/oauth/exchange`. Yêu cầu đủ 14 scope (`SCOPES` trong `api/handler.js`).
- **Upstream**: voz.vn API + HTML scrape (`/p/:id/reactions`), data.voz.vn (avatar, Range), api.imgur.com, pik.vn/api/upload, v.douyin.com, Flickr oEmbed.
- **Comments**: mọi file JS/CSS/HTML mở đầu bằng 1 dòng kdoc mô tả file (`/** … */` / `/* … */` / `<!-- … -->`; userscript đặt sau khối `==UserScript==`); mọi comment trong code đều 1 dòng ngắn (~≤10 từ) chỉ giữ "why"/gotcha, comment nói-lại-code bị xoá, divider `// foo` / `/* foo */`.
- **Verify**: `node --check` từng file JS/MJS

## Cấu trúc thư mục

```
TuiVoz/
├── api/handler.js        # Edge Function: API gateway duy nhất (Xem bảng route bên dưới)
├── api/index.js          # Re-export handler cho /api
├── dev-server.mjs        # Dev server local: Request/Response web-standard + static + SPA fallback
├── vercel.json           # Rewrites + cache headers (region sin1, outputDirectory public)
├── package.json · README.md · LICENSE · AGENTS.md   # AGENTS.md: hướng dẫn AI agent (đọc file này trước)
├── public/
│   ├── index.html        # SPA shell (font preload, anti-FOUC theme script, route-only CSS load async print-onload + noscript)
│   ├── favicon.ico · robots.txt · site.webmanifest · sw.js
│   ├── userscript/voz-oauth-helper.user.js   # Tampermonkey: PKCE + bắt OAuth code trên voz.vn
│   └── assets/
│       ├── api.js        # Client SDK gọi /api/*
│       ├── app.js        # Entry: boot, listener toàn cục, wire module UI
│       ├── app.css       # CSS bundle stale — không file nào tham chiếu
│       ├── core/         # dom, router, nav, paths, icons, utils
│       ├── lib/          # Logic nghiệp vụ (bbcode, media, settings, stickers, upload…)
│       ├── filters/      # Engine Bộ lọc (match/filters/apply/editor) — xem §7.4
│       ├── ui/           # Component (editor, post, lightbox, modal, chrome…)
│       ├── views/        # Màn hình theo route (forum, thread, dm, settings, user…)
│       ├── css/          # Stylesheet
│       ├── fonts/ img/   # 6 bộ webfont WOFF2 subset latin+vi (Be Vietnam/Pro, Roboto, Cantarell, Segoe UI, SF Pro); icon/logo
```

## Bản đồ module

### `api/` + dev server

| File | Vai trò |
|---|---|
| `api/handler.js` | Route: `/api/oauth/*` (exchange/status/logout/refresh, cookie `voz_session` Base64URL); `/api/xf/*` proxy XenForo (Bearer nếu login, fallback `XF-Api-Key` guest; retry refresh khi 401; hỗ trợ multipart); `/api/pik/upload` → pik.vn; `/api/image-download` (bypass Cloudflare, Range cho GIF); `/api/attachment-download?id=[&name=]` (voz.vn `/attachments/<id>/` trả **403 guest**, phải tải server-side: metadata → `direct_url` → stream; `?name=` → `inline` cho `<img>`/lightbox, ngược lại `attachment`); `/api/xf/imgur/*`; `/api/xf/douyin`; `/api/xf/oembed`; `/api/forum/*` full-page voz.vn proxy (login/`xf_session`/push — §7.7); scrape `/p/:id/reactions` (cache 60s). |
| `api/index.js` | Re-export handler. |
| `dev-server.mjs` | `node dev-server.mjs [port]` (`argv[2]`/`PORT`, default 3000) — chuyển `http.IncomingMessage` → web `Request`, gọi `handler()` cho `/api/*` + `/forum/*` (map `/forum/x` → `/api/forum/x`, kèm multi `set-cookie`); static `public/` `no-store`; asset/root-file (`/assets`, `/userscript`, `favicon.ico`, `site.webmanifest`, `robots.txt`) thiếu → **404** không fallback shell; route khác → `index.html`. |

### `assets/` gốc

| File | Chức năng |
|---|---|
| `api.js` | Client SDK: `xf(path, {method,query,body,json,form})` → `/api/xf/*`; object `api` (endpoint helper) + `auth` (OAuth status/exchange/logout); `ApiError` với `code`/`params`. |
| `app.js` | Boot: import + `wire*()` toàn bộ (theme, header menus, nav shortcuts, auto-hide, image fallback/download, static avatar, screenshot, quotes, lightbox, filtered reveals), `route()` handler, dynamic import `bannedUsers`. |

### `core/`

| File | Chức năng |
|---|---|
| `dom.js` | Handle DOM gốc + `state` toàn cục (`me`, `loggedIn`, `reactions`, `activeNav`, `breadcrumbs`). |
| `router.js` | History router: tách `page-N`, dispatch view, redirect `/p/:id` và `/t/:id/unread`, `?post=<id>` → `/t/<slug>.<id>/page-N/#post-<id>` (`postLocation`, §7.1). Views lazy `await import()` trừ forum/thread (§7.6). |
| `nav.js` | `navigate()` không reload; lưu/khôi phục scroll per history entry; `keepCurrentScroll`/`keepScroll` cho anchor. |
| `paths.js` | Path chuẩn SEO: `threadPath`, `forumPath`, `userPath`, `dmPath`, `withPage`, `postPage`/`postPath` → `/t/<slug>.<id>/page-N/#post-<id>`. |
| `icons.js` | SVG icon inline dạng hàm. |
| `utils.js` | `esc`, `num` (K/M), `timeAgo`, `fullDate`, `postDate`, `joinDate`. |

### `lib/`

| File | Chức năng |
|---|---|
| `attachments.js` | Map `[ATTACH]id[/ATTACH]` → URL; `attachmentViewUrl` (CDN dùng thẳng, còn lại qua proxy), `attachmentViewUrlForId`. |
| `uploadAttachments.js` | Upload đính kèm native voz: `new-key` → `/attachments` → `attachment_key` → `DELETE`; `AttachmentUploads` trên `editor._uploads`; fallback `[IMG]` pik.vn. |
| `avatar.js` / `avatarStatic.js` | URL avatar `data.voz.vn/avatars` bucket `id/1000` + fallback ký tự; đóng băng GIF/APNG frame đầu. |
| `bbcode.js` | `sanitizeHtml`, `bbcodeToPlain`, `rewriteAttachmentImages()` (sửa `voz.vn/attachments/<id>/` bị 403). |
| `editorCodec.js` | Biên dịch BBCode ↔ DOM editor 2 chiều (AST). |
| `imageDownload.js` / `imageFallback.js` | Nút tải ảnh (proxy nếu CORS); `data-onerror="hide-parent"`. |
| `imgurImport.js` | Import album sticker Imgur qua proxy. |
| `jumpToAnchor.js` | Scroll tới `#post-N` dưới sticky header; bù ảnh tải muộn; `revealFilteredBlock` cho post bị ẩn. |
| `media.js` | Embed YouTube/TikTok/Facebook/Reddit/Twitter/SoundCloud/Douyin/Flickr. |
| `pikUpload.js` | Upload ảnh pik.vn: resize ≤1920px JPEG 0.85, song song 3 luồng → `[IMG]`. |
| `postLinks.js` | Rewrite link nội bộ voz.vn → URL SPA. |
| `postScreenshot.js` | `renderPostPng` (SVG foreignObject, proxy ảnh → dataURI chống taint; `data:` SVG cho Chrome) + popup Sao chép / Chia sẻ / Tải xuống (Web Share L2; Firefox không share file → fallback URL). |
| `prefix.js` / `userBadges.js` | Màu/nhãn prefix thread; huy hiệu member. |
| `quotes.js` / `spoilers.js` / `signature.js` | Collapse quote >800px; toggle spoiler; render chữ ký. |
| `settings.js` | `localStorage['voz-settings:v1']`: theme, font, scale, auto-hide, sticker albums, `vozSupport`, `postScreenshot` (default BẬT); import/export JSON. |
| `signals.js` | Analytics `/voz/signals`: queue open/read, flush 5s/20 events/pagehide (chỉ logged-in). |
| `smilies.js` | Danh mục `/voz/smilies` + regex thay emoticon → `<img>`. |
| `stickers.js` | Sticker IndexedDB (`TuiVozStickerStorage`): album, recent, cache offline. |
| `supportBeacon.js` | Beacon `voz.vn/xfmg.php` (opt-in `vozSupport`, throttle 60s, 1 ping/route). |
| `unread.js` | Dò bài chưa đọc đầu tiên từ `visitor_read_date`. |
| `bannedUsers.js` | Đánh dấu user bị ban (KIA): phát hiện qua errcode `this_users_profile_is_not_available`, thêm class `username--banned`; `wireBannedUsernames`/`clearBannedMarks` (import động từ `app.js`). |
| `catalogs.js` | Cache `localStorage` TTL 24h cho catalog ít đổi (nodes, reactions, smilies) + cache memory. |
| `dataSaving.js` | Chế độ tiết kiệm dữ liệu: 3 trạng thái + auto theo Network Information API; consumer dùng thumbnail thay ảnh gốc (media, lightbox). |

### `filters/` — engine Bộ lọc (chi tiết §7.4)

| File | Chức năng |
|---|---|
| `match.js` | `FIELD_DEFS`/`OPERATORS`/`ACTIONS`/`SCOPES`/`JOINS`; `compilePattern`, `fieldValue`, `filterMatches` (joiner VÀ/HOẶC trái→phải, **không short-circuit**), `matchingFilter` (đầu tiên khớp thắng), `URL_MODES` (`plain`="Đường dẫn"/`wildcard`/`regex`), `normalizeUrlRule`, `customUrlMatches`. Mọi lỗi → `false` (fail-safe). |
| `filters.js` | Store `localStorage['voz-filters:v1']`: CRUD, `moveFilter`, `setFilterEnabled`, `restoreFilters`, `filtersForScope`; bắn `voz:filters-change`. |
| `apply.js` | `threadEntriesHtml`/`postEntriesHtml` bọc render: `delete` bỏ hẳn; `highlight` viền 4 cạnh; `hide` → `.filtered-block` + nút `.filtered-reveal` (id `post-N` giữ trên wrapper `<div>`); `revealFilteredBlock`/`wireFilteredReveals`. |
| `editor.js` | UI tab Bộ lọc + modal: scopes radio (`posts`→`threads`→`custom`), actions, joiner per-condition, URL rules nhiều dòng (`{v,m}` + select mode, nút +). |

### `ui/`

| File | Chức năng |
|---|---|
| `editor.js` / `editorTools.js` / `stickerPicker.js` / `mentionMenu.js` | Visual editor BBCode (draft, drag-paste → pik.vn); toolbar; picker sticker `[IMG size="80x80"]`; gợi ý `@user` (`/users/find-name`). |
| `post.js` | Template `.message`; `postHtml`/`messageHtml` nhận `{id, extraClass, extraStyle}`; `attachmentsBlockHtml` (thumb → lightbox, file → `/api/attachment-download?id=`). |
| `lightbox.js` | Overlay xem ảnh: capture-click trên `.message-userContent`, gallery DOM order, nút zoom `−`/`+` (×1.5, max ×6), wheel/double-click/drag-pan; **chỉ đóng bằng ✕/Esc**. |
| `threadRow.js` | Row chủ đề/kết quả; `threadRow`/`postRow`/`member*Row` nhận `perPage` + `extraClass`/`extraStyle` + link qua `postPath`. |
| `inlineEdit.js`, `reactions.js`, `postNumberPopup.js`, `memberTooltip.js`, `threadModeration.js`, `imageResizer.js`, `titleHold.js` | Sửa tại chỗ; reaction bar + danh sách người thả; popup permalink #post; hover card member; mod tools; overlay kéo-resize ảnh trong editor; nhấn giữ tiêu đề. |
| `forumNodes.js`, `headerMenus.js`, `unreadCounts.js`, `chrome.js`, `chromeAutoHide.js`, `infiniteScroll.js`, `pagination.js`, `theme.js`, `modal.js`, `feedback.js`, `title.js`, `session.js`, `alertMarkup.js` | Cây node; dropdown header; badge đỏ; header/breadcrumb/menu + nav shortcuts; auto-hide khi cuộn (REVEAL_THRESHOLD 8px); infinite scroll 3 chế độ; phân trang + `wirePageJump`; theme/scale biến CSS; modal/toast/errorBox; `document.title`; `loadSession`/`requireLogin`; markup thông báo. |

### `views/`

| File | Route |
|---|---|
| `forum.js` | `viewHome` (node tree), `viewForum`, `viewSearchForum`, `viewNewThreads` (`/new`). |
| `thread.js` | `/t/<slug>.<id>/` — danh sách post, anchor, watch, quick reply + editor; signals `open`/`read` qua `voz:leave-thread`. |
| `compose.js` | `/f/:id/post-thread` — tạo chủ đề. |
| `dm.js` | `/direct-messages/` — `viewDmList`, `viewDm` (reply + rời hội thoại), `viewNewDm`. |
| `lists.js` | `viewAlerts` (mark read), `viewBookmarks`, `viewWatched`. |
| `search.js` | `/search`. |
| `user.js` | `/u/<slug>.<id>/` + `/pp/{id}` — memberHeader, 4 tab (tường/hoạt động/bài đăng/giới thiệu); follow/ignore không có API → link voz.vn. |
| `login.js` | `/login` — OAuth2 PKCE qua userscript hoặc nhập tay. |
| `settings.js` | `/cai-dat-tuivoz` — tab: Giao diện, Hệ thống, Phím tắt, **Bộ lọc**, Sticker, Sao lưu (export/import JSON kèm `filters`). |

### `css/` (tên = vai trò)
`base` (biến theme sáng/tối) · `font-default` + `fonts` (webfont) · `layout` `forum` `post` `account` `home` · `editor` `forms` `media` `reaction` `headerMenus` `settings` `filters` `stickers` `avatar` `misc` `responsive` (breakpoints mobile) · `app` = gộp.

## Định tuyến & Cache (`vercel.json` + `handler.js`)

- `vercel.json`: `regions:["sin1"]`, `outputDirectory:"public"`; rewrite `/api` + `/api/(.*)` → `/api/handler?__path=`, `/forum(.*)` → `/api/handler?__path=forum$1`; SPA fallback → `index.html` trừ `api/`, `assets/`, `userscript/`, `robots.txt`, `sitemap.xml`, `sw.js` (`/forum/*` đã khớp rewrite riêng trước catch-all).
- Headers trong `vercel.json` chỉ có: `/assets/fonts/*` → `max-age=31536000, immutable`; `/assets/*` còn lại → `max-age=3600, stale-while-revalidate=86400`; `robots.txt` → `text/plain` + `max-age=3600`.
- `/api/*` **không** có header trong `vercel.json` — `handler.js` tự set `Cache-Control` per route: GET `/voz/*` pass-through ETag/`max-age` theo upstream (86400/3600/300 tuỳ tier), còn lại `private, no-store, max-age=0`.
- `image-download` có **in-memory server cache** (`IMAGE_CACHE` Map, 6h TTL, max 500, ≤512KB) — avatar URL immutable nên tránh gọi lại `data.voz.vn` mỗi trang; `X-Image-Cache: hit`; probe `limit=` không cache (sniff 64KB cho GIF frame-1).

## Triển khai

- **Yêu cầu**: Node.js 18+ (khuyên 20+).
- **Local**: `node dev-server.mjs 3000` → `http://localhost:3000` (đã gồm proxy `/api/*` + static, y hệt Edge).
- **Vercel**: `vercel` / `vercel --prod`; hoặc import repo trên dashboard — Root `TuiVoz`, Framework **Other**, Output `public`.

## Nhật ký sửa lỗi (tóm tắt + gotchas)

### §7.1 Permalink post thiếu trang → nhảy sai bài
Link `?post=<id>`/`post-<id>` không mang số trang → thread mở trang 1, anchor thiếu, scroll reset về đầu.
- `paths.js`: `postPage`/`postPath` → `/t/<slug>.<id>/page-N/#post-<id>` (dùng `position` + `perPage`).
- `threadRow.js` `postRow`/`memberPostRow`/`memberActivityRow` + views (search/lists/user) truyền `perPage`.
- `router.js` `postLocation(postId)` chuẩn hoá mọi `?post=` cũ trước render; `/p/:id` dùng chung.
- `views/thread.js`: có `focusPost` thì luôn `keepCurrentScroll()` trước khi jump.

### §7.2 Attachments không hiển thị
`message_parsed` chỉ render `[ATTACH]` inline; ảnh `voz.vn/attachments/<id>/` bị Cloudflare 403 guest.
- `api/handler.js` `/api/attachment-download` (xem §3.1); `lib/attachments.js` `attachmentViewUrl*`; `bbcode.js` `rewriteAttachmentImages`.
- `ui/post.js` `attachmentsBlockHtml`; `ui/lightbox.js` mới (zoom/pan, đóng bằng ✕/Esc); style trong `css/post.css`.

### §7.3 Nút "Chụp bài viết" → popup hành động
`lib/postScreenshot.js`: `renderPostPng` → `.post-share-popup` (pattern `postNumberPopup`): Sao chép / Chia sẻ / Tải xuống.
- **Gotcha**: Chrome taint canvas nếu SVG load qua `blob:` → dùng `data:image/svg+xml`. Firefox (mọi nền tảng) không hỗ trợ `navigator.share({files})` → fallback permalink.
- Timeout 60s + settle 15s/img để không treo khi ảnh hỏng.
- Setting `postScreenshot` default **BẬT** (chỉ `=== false` mới tắt); toggle tại `/cai-dat-tuivoz#system`.

### §7.4 Tab "Bộ lọc" (`/cai-dat-tuivoz#filters`)
Engine client-side RES-style ở `filters/`; storage `voz-filters:v1`; filter đầu tiên khớp thắng (ưu tiên = vị trí, ↑/↓ mobile, drag desktop).
- **Joiner**: `join:'custom'` — mỗi điều kiện (trừ đầu) có select VÀ/HOẶC, đánh giá trái→phải **không short-circuit** (`A VÀ B HOẶC C` = `(A∧B)∨C`). Legacy `all`/`any` vẫn hiểu.
- **Scopes** radio: `posts` (mặc định, cũng áp cho DM/search/bookmark) → `threads` → `custom` (Tự chọn). Field giới hạn theo scope: `threadOnly`/`postOnly`.
- **Custom URLs**: `filter.customUrls` = mảng rule `{v, m}`; `m ∈ URL_MODES` — `plain` ("Đường dẫn", substring CI của `location.pathname`, `*`/`?` là ký tự thường), `wildcard` (glob neo cả path), `regex` (`/re/flags` hoặc trần, default `i`). `urlRuleError` chặn regex lỗi. `normalizeUrlPattern` cắt scheme/host/query — **chỉ lưu pathname**; suy mode cho string cũ **sau** khi chuẩn hoá (dấu `?` trong query không tính wildcard).
- **Hide**: wrapper `.filtered-block` luôn `<div>` (**không** `<li>` — parser tách khỏi list-item scope), giữ `id="post-N"`/`conversation-message-N`; article trong đổi `filtered-post-N`; `jumpToAnchor`/hash-click gọi `revealFilteredBlock`.
- **Fail-safe**: regex lỗi, `ne` pattern hỏng, value rỗng, thiếu `User`, ngày hỏng → `false` (không match).
- Màu "Nổi bật": `COLOR_PRESETS` + ô nhập `CSS.supports` (không `input[type=color]`); `border: 1.5px solid` inline đủ 4 cạnh; cần `.filter-color-pick[hidden]{display:none}` vì `display:flex` override `hidden`.
- Mọi `.map(row).join()` ở views đổi sang `threadEntriesHtml`/`postEntriesHtml`; backup export/import kèm `filters` (`lib/settings.js`).

### §7.5 Beacon `/xfmg.php` (hỗ trợ tăng điểm voz)
- `lib/supportBeacon.js` `supportPing()`: gate `getVozSupport()` + `state.loggedIn`, throttle 60s, `new Image()` → `voz.vn/xfmg.php?s=<m|d>:u:p1b0r1e0&n=<rand>`; gọi trong `finally` của `route()` (1 ping/navigation).
- `xf_session` là `SameSite=None` nên cross-site vẫn kèm cookie. **Gotcha**: trình duyệt chặn 3rd-party cookie → beacon đến như guest (vô hại).

### §7.6 Hiệu năng tải trang (code split + cache)
- `core/router.js`: chỉ `forum.js`/`thread.js` eager; còn lại lazy `await import()` (compose/search/dm/lists/user/login/settings).
- `app.js`: `appConfig()` ∥ `loadSession()` chạy `Promise.all`; đăng ký `sw.js` ngay (guard `serviceWorker in navigator`, **không** bọc `load` — module eval chậm bỏ lỡ event).
- `index.html`: `editor.css`/`account.css` chuyển sang async `media="print" onload` (+ `<noscript>`).
- `public/sw.js`: cache-first chỉ `/assets/{css,icons,lib,ui,views,fonts}/`; `/api/*` + cross-origin bỏ qua. `vercel.json`: exclude `sw.js` khỏi SPA rewrite + header `no-cache`.
- `/api/image-download`: `IMAGE_CACHE` Map 6h/500 mục/≤512KB (`X-Image-Cache: hit`); probe `limit=` không cache.

### §7.7 Thông báo đẩy XenForo (web push)
voz.vn có XenForo push sẵn (`service_worker.js`, `enablePush:true`, `pushAppServerKey`). Hai rào cản cũ: `_xfToken` + `xf_session` chỉ sống trong phiên HTML của voz.vn (TuiVoz dùng OAuth Bearer, không có cookie session).
- **`/forum/*` proxy** (`handleForumProxy` trong `api/handler.js`, port từ `vercel-proxy`): full-page proxy `voz.vn` cùng origin → rebind `Set-Cookie` (`xf_session`/`xf_user`/`xf_csrf`) về domain TuiVoz, rewrite `https://voz.vn`→`/forum`, inject `<base href="/forum/">`, strip CF headers + `accept-encoding`. Đây là chỗ **login forum lần đầu** (`/forum/login/`) để có `xf_session`.
- **Subscribe flow** (`lib/push.js`): `fetchPushConfig()` scrape `XF.config.csrf`+`userId`+`pushAppServerKey` từ `/forum/index.php` → `pushManager.subscribe({applicationServerKey: <voz VAPID>})` → POST `application/x-www-form-urlencoded` tới `/forum/index.php?misc/update-push-subscription` với `{endpoint,key(p256dh),token(auth),encoding:'aesgcm',unsubscribed:0,_xfToken}`. Endpoint của browser thuộc domain TuiVoz → push vẫn về SW của TuiVoz. Toggle-off POST `unsubscribed:1` + `sub.unsubscribe()`.
- **SW** (`sw.js`): thêm `push` (parse `{title,body,dir,icon,badge,total_unread}` → `showNotification` + `setAppBadge`) và `notificationclick` (`data.url` rewrite `voz.vn`→same-origin rồi `navigate`/`openWindow`).
- **UI**: toggle "Nhận thông báo voz" trong `/cai-dat-tuivoz#system` (setting `pushEnabled`, chỉ UI state — trạng thái thật check qua `pushManager.getSubscription()`). Lỗi map: `guest` → chưa login qua `/forum/login/`; `denied` → browser chặn; `upstream` → voz từ chối.
- **HTML rewrite**: ngoài `voz.vn`→`/forum`, còn rewrite **root-relative** `src/href/action/formaction/poster/data-*` (`="/` → `="/forum/`), từng URL trong `srcset`, và `XF.config.basePath: '/'` → `'/forum/'` — `<base>` chỉ cứu URL tương đối, URL bắt đầu `/` vẫn trốn khỏi `/forum/` (login hỏng vì XF JS 404).
- **Gotcha**: subscribe endpoint là POST form (XenForo `XF.ajax`), **không** phải REST JSON. Chỉ test được trên deploy (Vercel `sin1` bypass Cloudflare **khi** UA giống browser — curl UA vẫn bị challenge); local VN IP bị chặn HTML mọi path.
