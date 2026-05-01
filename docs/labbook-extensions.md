# Hướng dẫn tích hợp `labbook-extensions.js`

## Cách thêm vào project

### Bước 1: Copy file vào project

```bash
cp labbook-extensions.js your-project/labbook/src/js/
```

### Bước 2: Import vào `main.js`

Thêm dòng này ở **đầu file** `src/js/main.js`, sau các import Firebase:

```js
// Ở cuối phần imports
import './labbook-extensions.js'
```

Hoặc thêm thẻ script riêng vào `index.html` (trước thẻ đóng `</body>`):

```html
<script type="module" src="/src/js/labbook-extensions.js"></script>
```

### Bước 3: Thêm CSS cho spinner (nếu chưa có)

Module dùng class `.spinner` đã có sẵn trong CSS của bạn — OK.

---

## Tính năng được thêm

### 1. 📊 Xuất Excel

Các nút **"📊 Xuất Excel"** sẽ tự động xuất hiện ở:

| Trang | File xuất |
|-------|-----------|
| Hóa chất | `HoaChat_YYYY-MM-DD.xlsx` (2 sheet: tất cả + sắp hết) |
| Thí nghiệm thủy nhiệt | `ThiNghiem_ThuyNhiet_YYYY-MM-DD.xlsx` |
| Điện hóa | `DienhHoa_YYYY-MM-DD.xlsx` (phân theo HER/OER) |
| Điện cực | `DienCuc_YYYY-MM-DD.xlsx` |
| Thiết bị | `ThietBi_YYYY-MM-DD.xlsx` |

Cũng có thể gọi trực tiếp từ console:
```js
window.exportChemicalsExcel()
window.exportHydroExcel()
window.exportElectrochemExcel()
window.exportElectrodeExcel()
window.exportEquipmentExcel()
```

---

### 2. 📈 Charts nâng cao Dashboard

4 biểu đồ tự động xuất hiện ở cuối trang Dashboard:

| Chart | Loại | Mô tả |
|-------|------|-------|
| Thí nghiệm theo tháng | Line (12 tháng) | TN thủy nhiệt vs điện hóa |
| Phân bố trạng thái | Doughnut | Hoàn thành / Đang chạy / Thất bại... |
| Tồn kho hóa chất | Bar nằm ngang | Top 10 hóa chất theo tồn kho |
| Kết quả η@10 | Bar grouped | HER / OER / ORR / CO₂RR |

---

### 3. 🤖 AI Phân tích điện hóa

Mỗi hàng trong bảng **Đo điện hóa** sẽ có nút `🤖 AI`.

Nhấn để mở modal phân tích với **4 chế độ**:

| Chế độ | Mô tả |
|--------|-------|
| Phân tích tổng quan | Đánh giá η, Tafel, EIS, ECSA toàn diện |
| So sánh tài liệu | So với Pt/C và benchmark trong lĩnh vực |
| Đề xuất cải thiện | 5 hướng tối ưu cụ thể |
| Soạn đoạn kết quả | Viết Results section bằng tiếng Anh |

Kết quả có thể **Copy** để dùng ngay trong bài báo.

---

## Lưu ý kỹ thuật

- **SheetJS** và **Chart.js** được load từ CDN khi cần (lazy load), không tăng bundle size.
- Module **hook vào `window.renderAll`** nên tự động chạy mà không cần sửa code cũ.
- Nếu `renderAll` chưa được define khi module load, nó sẽ **retry sau 500ms** tự động.
- AI API key được xử lý bởi Anthropic proxy — không cần config thêm trong môi trường Claude.ai.

## Tùy chỉnh màu chart

Chỉnh trong object `CHART_COLORS` ở đầu phần Chart:

```js
const CHART_COLORS = {
  teal:   'rgba(13,148,136,1)',  // màu chính lab
  amber:  'rgba(245,158,11,1)',  // màu phụ
  // ...
};
```
