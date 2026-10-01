# GitLab Pipeline Dashboard

Dashboard xem **tất cả pipeline** của mọi project mà tài khoản GitLab của bạn có quyền truy cập, trong một màn hình duy nhất.

- Chạy hoàn toàn trên trình duyệt: **không backend, không database, không Docker**.
- Không cần quyền Admin, chỉ cần một Personal Access Token.
- Dùng cho GitLab Self-Managed (cũng chạy với gitlab.com).
- Công nghệ: Vite, React, TypeScript, Tailwind CSS.

## Chạy nhanh

Yêu cầu: Node.js 18 trở lên.

```bash
cp .env.example .env     # sửa VITE_GITLAB_URL thành địa chỉ GitLab của bạn
npm install              # hoặc: yarn
npm run dev
```

Mở http://localhost:5173, nhập **GitLab URL** và **Personal Access Token**, bấm **Connect to GitLab**.

Cách tạo token: GitLab → Preferences → Access Tokens → chọn scope **`read_api`** (quyền đọc là đủ).

Các lệnh khác:

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy môi trường phát triển |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build production vào thư mục `dist/` |
| `npm run preview` | Chạy thử bản build |

## Dashboard làm được gì

1. **Tự tìm project**: gọi `GET /api/v4/projects?membership=true`, đi hết mọi trang. Bạn không phải nhập Project ID hay Group ID.
2. **Lấy pipeline của từng project**, tối đa **10 request song song** để không làm GitLab quá tải. Một project lỗi (403, 404…) không làm hỏng cả dashboard; lỗi được liệt kê ở mục **View errors**.
3. **Thẻ tổng hợp**: số project, Active, Running, Pending, Failed.
4. **Bảng pipeline**: project, pipeline, branch/tag, status, commit, thời gian tạo/cập nhật, duration. Bấm tên project hoặc `#id` để mở trên GitLab (tab mới).
5. **Lọc và sắp xếp**
   - Tìm theo tên project, `namespace/project`, pipeline ID, branch/tag, commit SHA.
   - Lọc theo Status, Project, Branch. Công tắc **Active Only** (mặc định bật).
   - Bấm tiêu đề cột để sắp xếp (bấm lần lượt: tăng → giảm → mặc định). Mặc định: pipeline đang hoạt động lên đầu, mới nhất trước.
6. **Chi tiết pipeline**: bấm nút mũi tên ở **cột cuối** để mở một dòng ngay dưới, vẽ graph giống GitLab: các stage, từng job, job trigger và các **downstream pipeline** (child / multi-project) cùng stage của chúng.
7. **Status tổng**: cột Status không chỉ lấy status của pipeline cha. Nếu stage hoặc downstream còn đang chạy thì hiện `RUNNING`, nếu có lỗi thì `FAILED`; pipeline xong nhưng có job `allow_failure` bị fail thì hiện `WARNING` như GitLab. Rê chuột vào badge để xem status gốc của pipeline cha.
8. **Auto refresh**: Off / 10s / 30s / 60s / 5m (mặc định 30s), có đếm ngược. Chỉ tải lại pipeline, không tải lại danh sách project. Nút **Rediscover Projects** để lấy lại danh sách project.
9. **Lịch sử**: ô chọn phạm vi ở đầu trang. *Live* chỉ lấy 20 pipeline mới nhất mỗi project; *History 24h / 7 days / 30 days* lấy mọi pipeline tạo trong khoảng đó (tối đa 1000 pipeline mỗi project). Chế độ lịch sử tốn nhiều request nên tự tắt Auto Refresh.
10. **Disconnect / Clear Token** (trong Settings): xóa token khỏi bộ nhớ, `localStorage` và dữ liệu đang hiển thị.

## Vấn đề CORS (đọc phần này nếu bị lỗi "Network or CORS error")

Trang chạy ở `http://localhost:5173` mà gọi thẳng tới `https://gitlab.company.local` thì trình duyệt thường chặn, vì GitLab không cho phép CORS.

Cách xử lý khi phát triển: đặt địa chỉ GitLab trong file `.env`

```
VITE_GITLAB_URL=https://gitlab.company.local
```

rồi **khởi động lại** `npm run dev`. Nếu URL bạn nhập trong form trùng với `VITE_GITLAB_URL`, app sẽ gọi `/api/gitlab/...` và Vite dev server chuyển tiếp sang GitLab (chấp nhận cả chứng chỉ tự ký).

Giới hạn cần biết:

- Proxy **chỉ tồn tại khi chạy `npm run dev`**, và chỉ cho đúng một GitLab. Bản `npm run build` không có proxy; nếu đem đi host ở nơi khác, GitLab phải bật CORS hoặc bạn tự dựng reverse proxy.
- Token vẫn do **trình duyệt** gửi đi (header `PRIVATE-TOKEN`). Proxy chỉ chuyển tiếp, không lưu và không log token. Đây không phải backend riêng.

## Bảo mật

- Token được dùng trực tiếp từ trình duyệt. Hãy dùng token **quyền tối thiểu** (`read_api`).
- Tích **Remember configuration on this browser** sẽ lưu URL và token **dạng chữ thường trong `localStorage`**. Không bật trên máy dùng chung.
- Token không bị đưa vào URL, không in ra console, và chỉ gửi tới GitLab URL bạn nhập.
- Không commit token. `.env` đã nằm trong `.gitignore`, và `.env` chỉ cần chứa địa chỉ GitLab, không chứa token.

## Giới hạn hiện tại

- Chế độ Live chỉ lấy 20 pipeline mới nhất mỗi project; pipeline cũ hơn chỉ xem được ở chế độ History.
- Duration chỉ là **xấp xỉ** (API danh sách không có `started_at`): đang chạy = bây giờ − lúc tạo; đã xong = lúc cập nhật − lúc tạo.
- Chi tiết (stage/job/downstream) tự tải cho pipeline đang chạy hoặc cập nhật trong **60 phút** gần nhất (để tính status tổng); pipeline cũ hơn chỉ tải khi bạn bấm mở rộng. Chỉ đi **một cấp** downstream, mỗi pipeline lấy tối đa 100 job đầu.
- Project archived bị bỏ qua.
- Công tắc **Active Only** chỉ có tác dụng khi filter Status là "All"; chọn một status cụ thể thì status đó được ưu tiên.
- Các thẻ tổng hợp tính trên những pipeline đã tải, không phải toàn bộ lịch sử.
- Chưa có nút Retry / Cancel / Delete pipeline (chỉ xem).

## Cấu trúc thư mục

```
src/
├── api/gitlab.ts                 Client GitLab: phân trang, giới hạn song song, xử lý lỗi,
│                                 lấy user / project / pipeline / job / downstream
├── types/gitlab.ts               Kiểu dữ liệu: GitLabUser, GitLabProject, GitLabPipeline...
├── hooks/useGitLab.ts            Kết nối, tải dữ liệu, auto refresh, disconnect
├── components/
│   ├── ConnectionForm.tsx        Form nhập URL + token
│   ├── Header.tsx                Thông tin kết nối, auto refresh, nút Refresh / Settings
│   ├── SummaryCards.tsx          Các thẻ tổng hợp
│   ├── PipelineFilters.tsx       Tìm kiếm và bộ lọc
│   ├── PipelineTable.tsx         Bảng pipeline + dòng mở rộng
│   ├── PipelineGraph.tsx         Graph stage / job / downstream kiểu GitLab
│   └── LoadingProgress.tsx       Thanh tiến trình tải
├── App.tsx   main.tsx   index.css
vite.config.ts                    Cấu hình Vite + proxy dev
.env.example                      Mẫu VITE_GITLAB_URL
```

## Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
| --- | --- |
| `Authentication failed` | Sai URL hoặc token hết hạn / thiếu scope `read_api` |
| `Network or CORS error` | GitLab chặn CORS: đặt `VITE_GITLAB_URL` và khởi động lại dev server |
| `Forbidden (403)` ở một project | Token không có quyền xem pipeline của project đó |
| `Rate limited (429)` | Gọi quá nhiều: tăng khoảng Auto Refresh, tránh chế độ History liên tục |
| `Jobs unavailable` ở dòng chi tiết | Token không đọc được job của pipeline / project đó |
