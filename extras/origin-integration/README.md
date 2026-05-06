# LabBook BKU — Origin Lab Integration

> Round 95: tích hợp tự động mở file đã upload bằng Origin Lab desktop app trên máy Windows.

## Cách hoạt động

Web browser **không thể** trực tiếp mở Origin Lab vì lý do bảo mật. Giải pháp dùng **Custom URL Protocol Handler** của Windows:

1. **Setup 1 lần**: chạy `install.bat` để đăng ký giao thức `labbook-origin://`
2. **Mỗi lần dùng**:
   - Trên web LabBook, bấm nút **Mở bằng Origin** (icon vuông teal) cạnh file
   - Web app tự động tải file về `Downloads/` rồi gọi `labbook-origin://<tên-file>`
   - Trình duyệt hỏi xác nhận → bấm **Open** (có thể tick "Always allow")
   - Windows chạy script wrapper → mở Origin với file vừa tải

## Yêu cầu

- Windows 10/11
- Origin Lab đã cài (Origin 2018 trở lên, 32-bit hoặc 64-bit)
- File được tải về thư mục Downloads mặc định (`%USERPROFILE%\Downloads\`)

## Cài đặt

```cmd
cd extras\origin-integration
install.bat
```

Script sẽ:
1. Tự động tìm Origin.exe trong các thư mục thông thường (Origin2018-2025, x86 + x64). Nếu không thấy, hỏi user nhập path.
2. Tạo `%USERPROFILE%\labbook-origin.bat` (wrapper script)
3. Import registry vào `HKEY_CURRENT_USER\Software\Classes\labbook-origin`

⚠️ **KHÔNG chạy với quyền admin** — registry phải ghi vào `HKEY_CURRENT_USER`, không phải `HKEY_LOCAL_MACHINE`.

## Files được Origin hỗ trợ

**Native Origin formats** (mở thẳng):
- `.opj` / `.opju` — project files
- `.otp` — graph templates
- `.ogg` / `.ogw` / `.ogm` — graph / worksheet / matrix windows
- `.org` — legacy project

**Import-able formats** (Origin tự nhận diện):
- `.xlsx` / `.xls` — Excel
- `.csv` / `.tsv` — delimited text
- `.txt` / `.dat` / `.asc` — generic text
- `.cor` — CorrWare electrochemistry data

Web app sẽ chỉ hiển thị nút **Mở bằng Origin** với các file thuộc danh sách trên.

## Workflow chi tiết

```
[User]                            [Web App]                   [Browser]                [Windows]
  │                                  │                            │                       │
  ├ Click "Mở bằng Origin" ─────────►│                            │                       │
  │                                  │                            │                       │
  │                                  ├ fetch(downloadURL)         │                       │
  │                                  ├ blob → <a download>        │                       │
  │                                  ├ trigger save dialog ──────►│                       │
  │                                  │                            │                       │
  ◄──── (browser saves to Downloads/) ───────────────────────────┤                       │
  │                                  │                            │                       │
  │                                  ├ wait 1.2s (file write)     │                       │
  │                                  ├ <iframe src="labbook-origin://file.xlsx">          │
  │                                  │                            ├ "Open Origin?" prompt │
  ├ Click "Open" ────────────────────────────────────────────────►│                       │
  │                                  │                            ├ launch handler ──────►│
  │                                  │                            │                       ├ run labbook-origin.bat
  │                                  │                            │                       │   "labbook-origin://file.xlsx"
  │                                  │                            │                       ├ strip prefix → "file.xlsx"
  │                                  │                            │                       ├ Origin64.exe \
  │                                  │                            │                       │   "C:\Users\X\Downloads\file.xlsx"
  ◄────────── Origin opens with file imported ─────────────────────────────────────────┤
```

## Gỡ cài đặt

```cmd
cd extras\origin-integration
uninstall.bat
```

Xoá:
- Registry key `HKEY_CURRENT_USER\Software\Classes\labbook-origin`
- File `%USERPROFILE%\labbook-origin.bat`

## Troubleshooting

### "Khong tim thay Origin.exe"
Origin cài ở vị trí khác thông thường. Khi script hỏi, nhập path đầy đủ:
```
C:\Program Files\OriginLab\Origin2024\Origin64.exe
```

### Click nút "Mở bằng Origin" → trình duyệt không hỏi gì
Có thể browser đã chọn "Always deny" trước đó. Vào browser settings:
- Chrome: `chrome://settings/handlers`
- Edge: `edge://settings/content/protocolHandlers`
- Reset permission cho `labbook-origin://`

### Origin mở nhưng không có file
Kiểm tra:
1. File đã được tải xuống `%USERPROFILE%\Downloads\` chưa? (mở File Explorer)
2. Tên file có ký tự đặc biệt? Wrapper script chỉ decode `%20`, `%28`, `%29`. Nếu cần decode thêm, sửa `%USERPROFILE%\labbook-origin.bat`.

### "File not found" khi click Mở bằng Origin
Browser tải file vào thư mục khác (không phải `~/Downloads`). Sửa browser settings về Downloads default, hoặc edit `labbook-origin.bat` thay đổi path.

## Bảo mật

- Protocol handler đăng ký tại `HKEY_CURRENT_USER` (chỉ user hiện tại, không cần admin)
- Wrapper script CHỈ pass filename argument tới Origin, không chạy lệnh khác
- Filename được sanitize: strip path separators (`/`, `\`)
- Browser hỏi xác nhận trước khi launch (security default)


## Round 96 Update: Auto-plot LabTalk Script

Web app generates a `.ogs` (LabTalk script) alongside data file. Origin runs the
script via `Origin64.exe -r script.ogs` — auto-imports data + creates plot with
axis labels and range matching the web preview.

Workflow with auto-plot:

```
[User] click "Mở bằng Origin"
  ↓
[Web] generate ogs script (axis labels by category, ranges from preview controls)
  ↓
[Web] download (1) data file + (2) ogs script (both → ~/Downloads)
  ↓
[Web] navigate to labbook-origin://file.xlsx?withScript=1
  ↓
[Browser] confirm prompt → Open
  ↓
[Wrapper batch] detect ?withScript=1 → check for matching .ogs in Downloads
  ↓
[Wrapper] start Origin64.exe -r <path>/file.ogs
  ↓
[Origin] runs script:
    1. Open new workbook
    2. impMSExcel / impASC the data file
    3. Set column long names (X label / Y label)
    4. plotxy iy:=(1,2) plot:=200 (line plot)
    5. Apply axis range from preview (layer.x.from / .to / .inc)
    6. Set teal color (RGB 13,148,136 to match Chart.js preview)
  ↓
[Origin] graph window appears — user can edit further
```

If `.ogs` script is not found (e.g. user disabled the second download), wrapper
falls back to plain mode (open data file in Origin without auto-plot).

### LabTalk syntax quick reference (used by generator)

| Command                   | Purpose                                         |
|---------------------------|-------------------------------------------------|
| `newbook name:="X";`      | Create new workbook named X                     |
| `impMSExcel fname:="..."` | Import .xlsx                                    |
| `impASC fname:="..."`     | Import .csv/.tsv/.txt/.cor                      |
| `wks.colN.lname$ = "L";`  | Set column N's long name (label)                |
| `wks.colN.type = 4;`      | Set column N as X (1=Y, 4=X)                    |
| `plotxy iy:=(1,2) plot:=200;` | Line plot col1=X, col2=Y                    |
| `layer.x.from = 0;`       | X axis min                                       |
| `layer.x.to = 80;`        | X axis max                                       |
| `layer.x.inc = 10;`       | X axis major step                                |
| `layer.x.type = 2;`       | X axis log scale (1=linear, 2=log)              |
| `xb.text$ = "X label";`   | Bottom X axis title                              |
| `yl.text$ = "Y label";`   | Left Y axis title                                |
| `set %C -c color(R,G,B);` | Set active plot line color                       |
| `set %C -w 1500;`         | Line thickness 1.5pt (units: 1/1000 pt)         |
