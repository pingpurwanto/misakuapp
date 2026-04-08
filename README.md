# MisaKu — v0.1

> "Saya di sini, sekarang jam segini — misa terdekat yang masih bisa saya kejar ada di mana?"

Web app mobile-first untuk umat Katolik Jakarta.

---

## Struktur Folder

```
misakу/
├── index.html          ← Entry point. Struktur halaman utama.
├── style.css           ← Semua styling (mobile-first, warm editorial)
├── app.js              ← Logic: geolokasi, filter jadwal, hitung jarak, render
├── data/
│   └── gereja.json     ← Data statis 12 paroki KAJ + jadwal misa
└── README.md
```

---

## Cara Jalankan Secara Lokal

```bash
# Opsi 1: VS Code + Live Server extension (paling gampang)
# Klik kanan index.html → "Open with Live Server"

# Opsi 2: Python
python -m http.server 3000
# Buka http://localhost:3000

# Opsi 3: Node
npx serve .
```

> ⚠️ Harus dijalankan via server (bukan buka file langsung), karena `fetch('./data/gereja.json')` butuh HTTP.

---

## Deploy ke Vercel / Netlify

```bash
# Vercel
npm i -g vercel
vercel

# Netlify
# Drag-and-drop folder ke netlify.com/drop
```

---

## Logika Utama (app.js)

| Fungsi | Tugasnya |
|---|---|
| `minta_lokasi()` | Trigger browser Geolocation API |
| `proses_lokasi(lat, lng)` | Hitung jarak ke semua gereja, urutkan |
| `hitung_jarak()` | Formula Haversine (akurat untuk jarak pendek) |
| `status_jadwal(jam)` | Return: `lewat` / `segera` (≤30 mnt) / `bisa` |
| `render_hasil()` | Render kartu gereja ke DOM |
| `buat_kartu()` | Build HTML untuk tiap kartu gereja |

---

## Data: gereja.json

Format tiap gereja:
```json
{
  "id": "katedral-jakarta",
  "nama": "Gereja Katedral Jakarta",
  "paroki": "Paroki Santa Maria Diangkat ke Surga",
  "alamat": "Jl. Katedral No.7B, Pasar Baru, Jakarta Pusat",
  "lat": -6.1697,
  "lng": 106.8312,
  "jadwal_reguler": {
    "minggu": ["06:00", "07:30", "09:30", "11:30", "17:00", "19:00"],
    "sabtu":  ["06:00", "17:30"],
    "senin":  [],
    ...
  },
  "terverifikasi": "Maret 2025"
}
```

---

## Roadmap Fase 1 (sisa)

- [ ] Tombol "Laporkan jadwal salah" (form sederhana / mailto)
- [ ] Mode Hari Raya (jadwal khusus Natal, Paskah, Jumat Pertama)
- [ ] Tambah paroki ke 15 (saat ini: 12)
- [ ] Verifikasi ulang semua jadwal ke sumber resmi KAJ

## Roadmap Fase 2

- [ ] Service Worker / PWA (bisa dipakai offline)
- [ ] Jadwal besok
- [ ] Filter berdasarkan jam (misal: "saya cuma bisa jam 8-10")
- [ ] Crowdsource update jadwal
