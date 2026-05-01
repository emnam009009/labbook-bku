# LabBook BKU

**Hệ thống quản lý Lab Vật liệu BKU**
*Lab Materials Management System for BKU*

Web app quản lý phòng thí nghiệm: thí nghiệm thủy nhiệt/điện cực/điện hóa, hóa chất, thiết bị, đặt lịch sử dụng, thành viên, và lịch sử thao tác.

A web application for managing a materials science lab: hydrothermal/electrode/electrochemistry experiments, chemicals, equipment, booking system, members, and activity history.

---

## 🚀 Quick start

### Yêu cầu / Requirements

- **Node.js** ≥ 18 (khuyến nghị / recommended: 20 LTS)
- **npm** ≥ 9
- Tài khoản Firebase với project đã setup Realtime Database + Authentication
- *Firebase project with Realtime Database + Authentication enabled*

### Cài đặt / Installation

```bash
# Clone repo
git clone <repo-url>
cd labbook

# Cài dependencies / Install dependencies
npm install

# Tạo file .env (xem mẫu bên dưới) / Create .env file (see template below)
cp .env.example .env
# Sau đó điền các giá trị Firebase config vào .env
# Then fill in Firebase config values in .env

# Chạy dev server / Start dev server
npm run dev
```

Dev server mở ở `http://localhost:5173`. *Dev server runs at `http://localhost:5173`.*

### Biến môi trường / Environment variables

File `.env` cần có 7 biến Firebase config / `.env` requires 7 Firebase config variables:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Lấy giá trị từ Firebase Console → Project Settings → General → Your apps.
*Get these values from Firebase Console → Project Settings → General → Your apps.*

⚠️ **Không commit `.env` lên git!** Đã có sẵn trong `.gitignore`.
*Do NOT commit `.env`! Already in `.gitignore`.*

---

## 📦 Scripts

| Lệnh / Command | Mô tả / Description |
|---|---|
| `npm run dev` | Chạy dev server với hot reload / Run dev server with HMR |
| `npm run build` | Build production vào `dist/` / Build to `dist/` |
| `npm run preview` | Preview bản build local / Preview build locally |

---

## 🏗 Tech stack

- **Frontend:** Vanilla JavaScript (ES modules) + Vite 8
- **Styling:** Tailwind CSS 3 + CSS variables
- **Backend:** Firebase (Realtime Database + Authentication + Hosting)
- **Charting:** Chart.js 4
- **Excel:** SheetJS (xlsx)
- **Animation:** OGL (WebGL)

---

## 🎯 Tính năng chính / Main features

- **Quản lý thí nghiệm** *(Experiment management)* — Hydrothermal, Electrode, Electrochemistry
- **Quản lý hóa chất** *(Chemicals)* — Stock tracking, alerts, formulas
- **Quản lý thiết bị** *(Equipment)* — Groups, lock/unlock status
- **Đặt lịch sử dụng thiết bị** *(Booking)* — List view + Week time-grid (Google Calendar style), drag/drop reschedule, resize
- **Quản lý thành viên** *(Members)* — Sinh viên, học viên, NCS, giảng viên
- **Quản lý mực in** *(Ink)* — Công thức và tồn kho
- **Hệ thống thông báo realtime** *(Notifications)* — Bell icon + dropdown
- **Online presence** — Hiển thị ai đang online realtime
- **Chat group** — Tin nhắn, mention, reactions
- **Phân quyền** *(Role-based access)* — Superadmin / Admin / Member / Viewer
- **Lịch sử thao tác** *(History log)*
- **Export Excel** — Tất cả các bảng
- **Theme picker** — Multiple color themes + dark mode

---

## 🔐 Phân quyền / Roles

| Role | Quyền / Permissions |
|---|---|
| `superadmin` | Toàn quyền + xóa admin khác / Full access including admin management |
| `admin` | Toàn quyền trong app / Full app access |
| `member` | Đọc/ghi dữ liệu, không quản lý user / Read/write data, no user management |
| `viewer` | Chỉ đọc / Read-only |
| `pending` | Chờ duyệt / Awaiting approval |
| `rejected` | Bị từ chối / Rejected |

User mới đăng ký có role `pending`, cần admin duyệt qua trang **Quản lý tài khoản**.
*New users register with `pending` role, requiring admin approval via the **Account Management** page.*

---

## 📁 Cấu trúc thư mục / Project structure

Xem chi tiết trong [`ARCHITECTURE.md`](./ARCHITECTURE.md).
*See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for details.*

```
labbook/
├── index.html              # Entry HTML (single page app)
├── src/
│   ├── css/                # Stylesheets
│   └── js/
│       ├── main.js         # Entry point, ties everything together
│       ├── firebase.js     # Firebase init + helpers
│       ├── auth.js         # Authentication core
│       ├── pages/          # Page renderers (dashboard, booking, ...)
│       ├── services/       # Business logic (notifications, presence, ...)
│       ├── ui/             # UI primitives (modal, toast, navigation)
│       └── utils/          # Pure utilities (format, dom, async, ...)
├── database.rules.json     # Firebase security rules
├── firebase.json           # Firebase Hosting config
└── vite.config.js          # Vite build config
```

---

## 🚢 Deploy

```bash
# Build
npm run build

# Deploy lên Firebase Hosting
firebase deploy --only hosting

# Deploy rules database
firebase deploy --only database

# Deploy cả 2
firebase deploy
```

Cần đăng nhập Firebase CLI trước (`firebase login`).
*Login to Firebase CLI first (`firebase login`).*

---

## 🤝 Đóng góp / Contributing

Xem [`CONTRIBUTING.md`](./CONTRIBUTING.md) để biết quy ước commit, branch, và quy trình PR.
*See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit conventions, branching strategy, and PR workflow.*

---

## 📝 License

Dự án nội bộ BKU. Không phân phối ra ngoài khi chưa có sự đồng ý.
*Internal project for BKU. Do not redistribute without permission.*

---

## 📞 Liên hệ / Contact

Lab Vật liệu BKU — Khoa Kỹ thuật Hóa học, Đại học Bách Khoa TP.HCM
*Materials Lab — Faculty of Chemical Engineering, HCMUT*
