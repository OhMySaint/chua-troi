# Bật chơi chung qua Internet + đăng nhập Google

Không cấu hình gì thì game vẫn chạy bình thường; "Chơi chung" khi đó chỉ chạy được bằng 2 tab trên cùng trình duyệt (để thử). Để hai người ở hai máy chơi với nhau cần một project **Supabase** (miễn phí).

## 1. Tạo project Supabase
1. Vào https://supabase.com → **New project**.
2. Mở **Project Settings → API**, lấy **Project URL** và **anon public key**.
3. Tạo file `.env.local` ở thư mục game:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
   (anon key là khóa công khai, được phép nằm trong mã phía trình duyệt.)
4. Chạy lại `npm run dev`.

## 2. Bật đăng nhập Google
1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID** (loại *Web application*).
2. **Authorized redirect URIs**: `https://xxxxxxxx.supabase.co/auth/v1/callback`
3. Copy *Client ID* và *Client secret* vào Supabase: **Authentication → Providers → Google** → bật.
4. Supabase **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5174` (hoặc địa chỉ bạn deploy)
   - Redirect URLs: thêm `http://localhost:5174/**`, `http://localhost:5173/**` và domain thật nếu có.

## 3. Kho lưu thế giới (để người thứ hai tải thế giới về)
Supabase → **SQL Editor**, chạy:
```sql
insert into storage.buckets (id, name, public) values ('worlds', 'worlds', false)
on conflict (id) do nothing;

create policy "gods upload worlds" on storage.objects
  for insert to authenticated with check (bucket_id = 'worlds');
create policy "gods read worlds" on storage.objects
  for select to authenticated using (bucket_id = 'worlds');
create policy "gods replace worlds" on storage.objects
  for update to authenticated using (bucket_id = 'worlds');
```

Realtime (kênh phát tin giữa hai vị thần) không cần cấu hình thêm.

## Chơi
1. Người thứ nhất: **👥 Chơi chung → Đăng nhập bằng Google → Tạo phòng**, gửi mã hoặc link mời.
2. Người thứ hai: mở link (hoặc nhập mã) → đăng nhập → **Vào phòng**.
3. Thế giới của người tạo phòng được chia sẻ; hai bên cùng nâng núi, đổi thời tiết, trả lời lời cầu nguyện của tín đồ mình.

Ghi chú kỹ thuật: hai máy chạy cùng một mô phỏng tất định và chỉ gửi cho nhau lệnh (`src/net/session.ts`); cứ 100 bước so checksum, lệch thì chủ phòng gửi bản lưu và cả hai tải lại. Nên để tab game mở (trình duyệt làm chậm tab ẩn quá lâu).
