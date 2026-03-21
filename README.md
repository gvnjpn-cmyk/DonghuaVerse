# 🐉 Noctyra Watch

Web streaming Donghua Sub Indo — scraper otomatis dari Anichin.cafe ke Supabase, serve via Express di Pterodactyl.

---

## 📁 Struktur Project

```
anichin-web/
├── server.js                   ← Express server
├── package.json
├── .env.example                ← Template env
├── scraper/
│   └── index.js                ← Scraper anichin → supabase
├── .github/
│   └── workflows/
│       └── scraper.yml         ← GitHub Actions cron (tiap 4 jam)
├── supabase/
│   └── schema.sql              ← SQL setup tabel
└── public/
    ├── index.html              ← Beranda
    ├── series.html             ← Detail series + episode list
    ├── episode.html            ← Player + download + komentar
    ├── schedule.html           ← Jadwal tayang
    ├── search.html             ← Cari + filter genre
    ├── css/style.css
    └── js/app.js
```

---

## 🚀 Setup Step by Step

### 1. Supabase
1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** → paste isi `supabase/schema.sql` → Run
3. Catat:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY`

### 2. GitHub Repository
1. Push project ini ke GitHub repo baru
2. Buka **Settings → Secrets and variables → Actions**
3. Tambah secrets:
   ```
   SUPABASE_URL          = https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY  = eyJxxx...
   ```
4. GitHub Actions akan otomatis scrape tiap 4 jam
5. Untuk trigger manual: **Actions → Anichin Scraper → Run workflow**

### 3. Pterodactyl (Node.js egg)
1. Buat server baru dengan egg **Node.js**
2. Upload semua file (atau clone dari GitHub)
3. Buat file `.env`:
   ```env
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJxxx...
   SUPABASE_SERVICE_KEY=eyJxxx...
   PORT=3000
   ```
4. Di Pterodactyl startup command: `npm start`
5. Install dependencies: `npm install`

---

## ⚙️ Environment Variables

| Variable | Keterangan |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Public key (untuk frontend) |
| `SUPABASE_SERVICE_KEY` | Private key (untuk scraper, bypass RLS) |
| `PORT` | Port server (default: 3000) |

---

## 🕷️ Scraper Manual

```bash
# Install dulu
npm install

# Isi .env dengan SUPABASE_URL dan SUPABASE_SERVICE_KEY
cp .env.example .env

# Jalankan scraper
npm run scrape
```

---

## 🌐 Fitur Web

| Halaman | URL | Fitur |
|---|---|---|
| Beranda | `/` | Hero terbaru, latest episodes, ongoing series |
| Detail Series | `/series.html?slug=<slug>` | Info + daftar semua episode |
| Episode/Player | `/episode.html?url=<url>` | Embed player, server pilihan, download, komentar |
| Jadwal | `/schedule.html` | Jadwal tayang per hari, highlight hari ini |
| Search | `/search.html` | Cari judul, filter genre & status |

---

## 📝 Catatan

- **Video embed** diambil dari HTML (iframe, data-video). Beberapa server mungkin perlu JS untuk load → fallback ke link download
- **Komentar** disimpan ke Supabase (tabel `comments`), tidak perlu auth
- **RLS** sudah dikonfigurasi: publik bisa read semua tabel + insert komentar
- Scraper delay 2 detik antar request agar tidak diblokir anichin
