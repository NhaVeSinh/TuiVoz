# TuiVoz

Web diễn đàn theo phong cách voz.vn — thin client chạy trực tiếp trên REST API của voz.vn, không có database riêng.

## Tính năng

- Đọc diễn đàn / chủ đề / bài mới, tìm kiếm bài viết
- Đăng nhập OAuth2 + PKCE, phiên lưu trong cookie `HttpOnly`
- Đăng bài, trả lời, trích dẫn, sửa / xoá bài, cảm xúc
- Hộp thư, thông báo, đánh dấu, theo dõi kèm badge chưa đọc
- Trình soạn BBCode trực quan, tải ảnh lên pik.vn, sticker, smilies
- Giao diện mobile, sáng / tối, 7 phông chữ, trang cài đặt `/cai-dat-tuivoz` (phím tắt, sao lưu JSON)

## Kiến trúc

- `api/handler.js` — Vercel Edge Function (region `sin1`): proxy `/api/xf/*` → `voz.vn/api` + các endpoint OAuth
- `api/og.js` — Edge Function render `og:*` / `twitter:*` cho crawler (link preview), chỉ route request có User-Agent crawler
- `public/` — SPA thuần ES modules (router History API), không framework, không bundler

## Chạy local

```powershell
node dev-server.mjs 3111
# → http://localhost:3111
```

## Deploy

```powershell
vercel --prod
```
Giấy phép: GPL-3.0
