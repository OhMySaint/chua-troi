# Chơi chung & đăng nhập Google

**Link chơi:** https://ohmysaint.github.io/chua-troi/

## Chơi chung (không cần cấu hình gì)
Hai trình duyệt kết nối trực tiếp với nhau (WebRTC P2P, được giới thiệu qua máy chủ miễn phí của PeerJS).
1. Người thứ nhất: **👥 Chơi chung → Tạo phòng**, gửi mã phòng hoặc link mời.
2. Người thứ hai: mở link (hoặc nhập mã) → **Vào phòng**.
Thế giới của người tạo phòng được chia sẻ; cả hai cùng nâng núi, đổi thời tiết, trả lời lời cầu nguyện của tín đồ mình. Nên để tab game mở trong lúc chơi.

## Bật nút "Đăng nhập bằng Google"
Chỉ cần một **OAuth Client ID** (mã công khai, không có khóa bí mật):
1. https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID**
   (lần đầu Google sẽ yêu cầu cấu hình *OAuth consent screen*: chọn External, điền tên ứng dụng "Chúa Trời" và email).
2. Application type: **Web application**.
3. **Authorized JavaScript origins**: `https://ohmysaint.github.io` và `http://localhost:5174`.
4. Copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`), rồi:
   ```bash
   gh variable set VITE_GOOGLE_CLIENT_ID -R OhMySaint/chua-troi --body "xxxx.apps.googleusercontent.com"
   gh workflow run deploy.yml -R OhMySaint/chua-troi
   ```
   Khi chạy ở máy: thêm `VITE_GOOGLE_CLIENT_ID=...` vào `.env.local`.

## Tùy chọn: server Supabase
Nếu muốn dùng Supabase Realtime thay cho P2P (ví dụ mạng chặn WebRTC), đặt `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`; khi đó đăng nhập đi qua Supabase Auth (bật provider Google trong Supabase) và thế giới được truyền qua Storage bucket `worlds`:
```sql
insert into storage.buckets (id, name, public) values ('worlds', 'worlds', false) on conflict (id) do nothing;
create policy "gods upload worlds" on storage.objects for insert to authenticated with check (bucket_id = 'worlds');
create policy "gods read worlds" on storage.objects for select to authenticated using (bucket_id = 'worlds');
```

Ghi chú kỹ thuật: hai máy chạy cùng một mô phỏng tất định và chỉ gửi cho nhau lệnh (`src/net/session.ts`); cứ 100 bước so checksum, lệch thì chủ phòng gửi bản lưu và cả hai cùng tải lại.
