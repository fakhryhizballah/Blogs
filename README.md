# 📝 Personal Blog — Node.js + MongoDB + JWT

Blog pribadi full-stack dengan autentikasi **JSON Web Token (JWT)**.

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB + Mongoose
- **Template Engine**: EJS
- **Styling**: Tailwind CSS (CDN) + Custom CSS
- **Auth**: JWT via HttpOnly Cookie (`jsonwebtoken` + `cookie-parser`)

---

## 🔐 Cara Kerja JWT di Aplikasi Ini

```
LOGIN
  │
  ├─ User POST /admin/login (username + password)
  ├─ Server verifikasi password dengan bcrypt
  ├─ Server buat JWT token (payload: id, username, role, dll)
  └─ JWT disimpan sebagai HttpOnly Cookie di browser
        └─ Aman dari XSS (tidak bisa diakses JS)
        └─ SameSite: lax  → proteksi CSRF
        └─ Expires: 7 hari

SETIAP REQUEST KE HALAMAN ADMIN
  │
  ├─ Cookie dikirim otomatis oleh browser
  ├─ Middleware `isAuthenticated` ekstrak token dari cookie
  ├─ `jwt.verify()` validasi signature + expiry
  └─ Payload di-inject ke req.user dan res.locals.sessionUser

LOGOUT
  └─ Server hapus cookie (res.clearCookie)
        └─ Tidak perlu database call — stateless!
```

### File JWT Utama
| File | Fungsi |
|------|--------|
| `config/jwt.js` | `signToken`, `verifyToken`, `setTokenCookie`, `clearTokenCookie`, `extractToken` |
| `middleware/auth.js` | `isAuthenticated`, `isGuest`, `injectUser` |

---

## 🚀 Cara Menjalankan

### 1. Install dependencies
```bash
npm install
```

### 2. Konfigurasi `.env`
```env
MONGODB_URI=mongodb://localhost:27017/personalblog
JWT_SECRET=your-super-secret-jwt-key-ganti-ini-minimal-32-karakter
JWT_EXPIRES_IN=7d
PORT=3000
UPLOAD_API_URL=https://your-upload-api.com/upload
```

> ⚠️ **JWT_SECRET** harus panjang dan acak di production!
> Generate dengan: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 3. Jalankan
```bash
npm run dev    # development
npm start      # production
```

### 4. Akses
- Blog publik: `http://localhost:3000`
- Daftar akun: `http://localhost:3000/admin/register`
- Login admin: `http://localhost:3000/admin/login`

---

## 📁 Struktur Proyek

```
blog-app/
├── server.js
├── .env
├── config/
│   ├── database.js      # Koneksi MongoDB
│   └── jwt.js           # JWT utilities (sign, verify, cookie)
├── middleware/
│   └── auth.js          # isAuthenticated, isGuest, injectUser
├── models/
│   ├── User.js
│   └── Article.js
├── routes/
│   ├── admin.js         # Protected routes (JWT required)
│   └── public.js        # Public routes + comment/like API
└── views/
    ├── partials/
    ├── admin/
    └── *.ejs
```

---

## ✨ Fitur Lengkap

### Admin
- ✅ JWT auth via HttpOnly Cookie (aman XSS & CSRF)
- ✅ Token auto-refresh saat update profil
- ✅ Logout paksa setelah ganti password (keamanan)
- ✅ Editor artikel + preview Markdown
- ✅ Upload media via URL API eksternal
- ✅ Status: Draft / Publikasi / Private
- ✅ Kelola komentar

### Publik
- ✅ URL SEO-friendly
- ✅ Komentar + localStorage (nama & guestId)
- ✅ Like/Dislike per UUID unik
- ✅ Pencarian & filter topik

---

## 📦 Dependencies

```bash
npm install bcryptjs cookie-parser dotenv ejs express jsonwebtoken mongoose multer slugify
```
