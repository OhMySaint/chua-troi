# SaintMia's World

**▶ Chơi ngay:** https://ohmysaint.github.io/chua-troi/

Phaser 4 + Vite + TypeScript, âm thanh tổng hợp bằng Web Audio (`src/audio/Audio.ts`). Bạn là chúa trời: kiến tạo địa hình, giáng thiên tai, đổi thời tiết — và xem các dân tộc ra đời, phát triển từ thời đồ đá đến hiện đại, thờ phụng, cầu xin và gây chiến.

```bash
npm install
npm run dev
```

## Điều khiển
- Công cụ: địa hình (nâng/hạ/phẳng/sông/rừng), thiên tai (lửa/núi lửa/động đất/thiên thạch), sự sống (người/hươu/sói), thần quyền (gây chiến/hòa bình/quan sát). Phím `1`–`9`, `i` = quan sát. ⚔️ Gây chiến: bấm nước tấn công rồi nước bị tấn công (Esc hủy), hoặc chọn trong thẻ quốc gia.
- `[` `]` cỡ cọ · `Space` tạm dừng · tốc độ 1x–8x
- **Trackpad Mac:** vuốt 2 ngón = di chuyển · chụm 2 ngón = zoom · giữ ⌥ Option + kéo = kéo bản đồ
- **Chuột:** con lăn = zoom · chuột phải/giữa kéo = di chuyển
- ✋ Kéo (phím `H`) · mũi tên / WASD = di chuyển · `+` `-` `0` = zoom

## Chơi chung (2 vị thần)
👥 Chơi chung → tạo phòng / nhập mã. Hai máy chạy cùng một mô phỏng tất định (`src/sim/rand.ts`, bước cố định 0.1 s, mọi thao tác là lệnh `src/sim/commands.ts`); chỉ lệnh được gửi qua mạng theo giao thức "chân trời cam kết" (`src/net/session.ts`), so checksum mỗi 100 bước và tự đồng bộ lại bằng bản lưu. Mỗi dân tộc có đức tin riêng cho từng thần, cầu nguyện đúng thần mình thờ. Kết nối P2P (WebRTC/PeerJS), không cần server; đăng nhập Google: xem [SETUP-MULTIPLAYER.md](SETUP-MULTIPLAYER.md).

## Thế giới
1280×800 ô, 5–7 đảo lớn cách mép bằng vành biển + quần đảo nhỏ; vẽ theo mảnh (`src/scenes/TerrainLayer.ts`: bản đồ tổng quan 1 px/ô + mảnh chi tiết 256 px theo camera). Thời tiết & nhiệt độ theo vùng 64×64 ô (front lan sang vùng bên), có hạn hán; nút 📍 Theo vùng để tô thời tiết từng vùng.

## Quốc gia, chiến tranh, ngoại giao
- **Thành phố & quốc gia:** mỗi khu dân cư là một thành phố; quốc gia gồm nhiều thành phố (thủ đô mang tên, màu, tước hiệu). Nước mở rộng bằng cách gửi dân lập thành phố mới, chiếm thành phố của địch, hoặc sáp nhập cả nước (chinh phục / hợp nhất hòa bình / khai hóa) — có thể đi tới một quốc gia duy nhất.
- **Ngoại giao (AI):** quan hệ, liên minh (đồng minh tham chiến), thương mại trao đổi lương thực/gỗ, đường cao tốc, giao lưu văn hóa.
- **Quân sự theo thời đại** (`src/sim/military.ts`): bộ binh, cung thủ, kỵ binh, lính súng, xe tăng, chiến giáp; quân tập hợp → hành quân theo đội hình → vây thành; máy bay ném bom và bom nguyên tử ở thời hiện đại.
- **Tiến trình:** công nghệ tính theo căn bậc hai dân số cả nước; nước tụt hậu bắt kịp nhanh, nước dẫn đầu chậm lại; ~50–60 phút ở 2x từ đồ đá tới vũ trụ. Thiên tai/chiến tranh gây tổn thương (suy thoái, có thể lùi thời đại).
- **Khởi tạo:** bản đồ ngẫu nhiên hoặc chia đôi (2 lục địa cho 2 thần), số bộ lạc ban đầu (0 = thế giới trống). Dân do thần nào tạo ra thì cầu nguyện thần đó.

## Lưu game
💾 trên thanh công cụ: 3 ô lưu + tự động lưu mỗi 3 phút (IndexedDB), ⌘S/Ctrl+S lưu nhanh, xuất/nhập file `.chuatroi` (vài MB, gzip; header JSON + các lớp bản đồ lượng tử hóa — `src/save.ts`, `Sim.snapshot()/restore()`).

## Hệ thống
- **Bối cảnh:** một đảo lớn (bắc lạnh, nam ấm) với các đảo nhỏ ngoài khơi. Thị tộc → liên minh → vương quốc → đế chế/cộng hòa; hợp nhất hòa bình hoặc chinh phục; từ thời đồ sắt có thuyền vượt biển khai phá đảo xa.
- **Nhịp lịch sử tăng tốc:** mỗi thời đại có `pace` riêng (`src/sim/eras.ts`) — đồ đá chậm (~12 phút ở 1x), công nghiệp/hiện đại/vũ trụ nhanh (~2–3 phút). 7 thời đại, tới Kỷ nguyên vũ trụ.
- **Dân số đại diện:** mỗi người trên bản đồ đại diện `popScale` người thật (1 → 50.000), nên bản đồ vẫn ~50–150 người/nước mà số liệu hiện hàng triệu.
- **Kiến trúc** (`src/art/buildings.ts`): nhà vẽ thủ tục theo văn hóa × thời đại, công trình dân sự (kho lúa, chợ, lò rèn, doanh trại, cối xay, thư viện, nhà máy, trường, bệnh viện, cao ốc, bến cảng, sân bay vũ trụ), cung điện và đền thờ riêng từng văn hóa. Hiển thị bằng sprite (`src/scenes/BuildingLayer.ts`) với lớp màu quốc gia và cửa sổ sáng ban đêm.
- **Giao thông** (`src/scenes/Traffic.ts`, chỉ hiển thị): xe bò/ngựa → xe ngựa → ô tô → xe bay trên đường sá; thuyền quanh bến; máy bay/phi thuyền giữa thủ đô; tên lửa phóng từ sân bay vũ trụ.
- **Thương mại & giao lưu văn hóa:** nước hòa bình có chợ gần nhau buôn bán, nối đường cao tốc, tăng tri thức, thấm văn hóa của nhau.
- **Thế giới** 320×200 ô (`src/world/`): độ cao, lớp phủ (rừng, lửa, tro, nhà, ruộng, dung nham, bazan), tuyết/băng, khí hậu theo vĩ độ + độ cao, mực nước biển theo thời tiết. Dung nham gặp biển thành đất mới.
- **Văn hóa** (`src/sim/cultures.ts`): 8 nền văn hóa lấy cảm hứng Á–Âu, hình thành theo địa hình nơi lập làng (lúa nước, Hoàng Hà, thảo nguyên, Bắc Âu, Hy Lạp, Slav, Tây Tạng, Nhật). Mỗi văn hóa có tên người/địa danh, tước hiệu theo thời đại, tín ngưỡng, lễ hội, phong tục và chỉ số sở trường.
- **Thời đại** (`src/sim/eras.ts`): 6 thời đại; tri thức tăng theo dân số, lan từ láng giềng. Nhà, công trình trung tâm, đền, vũ khí, năng suất đổi theo thời đại; mỗi ngôi nhà nhớ thời đại xây và được cải tạo dần.
- **Người** (`src/sim/Sim.ts`): AI ưu tiên sống còn → chiến đấu/phòng thủ → đuổi sói → trú ẩn → lễ hội → ăn → làm việc. Làng rút kinh nghiệm từ thiên tai. Clan quá đông sẽ tách đoàn đi khai hoang.
- **Chiến tranh**: quan hệ xấu đi do giáp ranh, thiếu đất/lương thực, khác tôn giáo, tính hiếu chiến; lính hành quân, giao chiến (cận chiến → cung → súng), đốt/chiếm nhà, sáp nhập nước thua.
- **Tôn giáo & ước nguyện**: đức tin vào bạn; cải đạo, đền thờ, lễ hội, bỏ đạo. Các dân tộc gửi lời cầu xin — đồng ý (phép màu) hoặc từ chối.
- **Động vật** (`src/sim/Animals.ts`): hươu (con mồi) và sói (săn hươu, tấn công người lẻ).
- **Lịch sử**: lịch năm (1 năm = 6 giây game), sử ký từng dân tộc, truyền thuyết (`src/sim/story.ts`), 32 thành tựu + dòng thời gian (`src/sim/achievements.ts`).
- **Hiển thị**: `src/world/render.ts` vẽ 8×8 px/ô theo dải; `src/scenes/WorldScene.ts` vẽ người/thú (chấm khi zoom xa), công trình, lãnh thổ, hiệu ứng.

Trong chế độ dev, `window.sim` và `window.game` có sẵn để debug (vd. tua nhanh: `for (let i=0;i<3000;i++) sim.update(0.1)`).
