# **Product Brief — MisaKu (working title)**

*Versi 0.1 | April 2026 | Draft untuk review*

---

## **Problem Statement**

Umat Katolik Jakarta yang ingin menghadiri misa — terutama di luar paroki asal atau di hari raya — harus melakukan proses manual yang menyebalkan: buka website KAJ atau jadwalmisa.id, cari berdasarkan wilayah administratif, cek jadwal satu per satu, lalu pindah ke Google Maps untuk cek rute. Data jadwalnya pun sering tidak bisa dipercaya kebenarannya.

**Satu kalimat:** *Tidak ada cara cepat untuk tahu "misa mana yang masih bisa saya kejar sekarang, dari titik saya berdiri."*

---

## **Proposed Solution**

Web app mobile-first yang menjawab satu pertanyaan:

*"Saya di sini, sekarang jam segini — misa terdekat yang masih bisa saya kejar ada di mana?"*

---

## **Target User**

Umat Katolik Jakarta usia 20–45 tahun yang mobile, tidak selalu misa di paroki yang sama, dan butuh info cepat terutama saat misa hari raya, Jumat Pertama, atau sedang berada di lokasi asing.

---

## **MVP Feature Set (Fase 1\)**

**1\. Deteksi lokasi otomatis** App membaca GPS user → tidak perlu pilih wilayah manual.

**2\. Daftar misa terdekat yang masih bisa dikejar** Tampil 3–5 gereja terdekat dari lokasi user, diurutkan berdasarkan jarak. Filter otomatis: hanya tampilkan jadwal misa yang **belum lewat hari ini.**

**3\. Info per gereja** Nama gereja, paroki, jarak dari lokasi user, jadwal misa hari ini (dan besok), badge *"Terverifikasi \[bulan/tahun\]"*.

**4\. Tombol "Buka Rute"** Deep link ke Google Maps dengan destinasi sudah diset ke gereja yang dipilih. User tidak perlu copy-paste alamat.

**5\. Mode Hari Raya** Saat mendekati Natal, Paskah, Jumat Pertama — app otomatis switch ke jadwal khusus hari raya yang berbeda dari jadwal reguler.

---

## **Yang Sengaja TIDAK Ada di MVP**

* Login / akun user  
* Review atau rating gereja  
* Info parkir, transportasi, "vibe" gereja  
* Notifikasi push  
* Coverage di luar KAJ

*Semua ini bisa masuk di Fase 2 kalau traction bagus.*

---

## **Data Strategy**

Ini risiko terbesar proyek ini. Solusi untuk MVP:

* Fokus **10–15 paroki KAJ paling ramai** dulu (Katedral, Kelapa Gading, Blok Q, Tebet, Rawamangun, dll.)  
* Data jadwal di-input manual dari sumber resmi KAJ  
* Setiap jadwal diberi label *"Terverifikasi: \[bulan tahun\]"* — transparan ke user  
* Crowdsource koreksi: tombol *"Laporkan jadwal salah"* di setiap entry

---

## **Tech Stack (rekomendasi untuk vibe coding)**

* **Frontend:** HTML \+ CSS \+ vanilla JavaScript, atau React sederhana  
* **Data:** JSON file statis dulu (tidak perlu database untuk MVP)  
* **Geolocation:** Browser Geolocation API (gratis, built-in)  
* **Maps:** Google Maps deep link (tidak perlu API key untuk fase ini)  
* **Hosting:** Vercel atau Netlify (gratis)

---

## **Success Metric MVP**

| Metrik | Target 30 hari pertama |
| ----- | ----- |
| Paroki tercakup | 10–15 paroki KAJ |
| Akurasi jadwal | 100% terverifikasi manual |
| Bisa dipakai dari HP | Ya, tanpa install |
| Waktu dari buka app → tahu tujuan | \< 30 detik |

