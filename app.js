/* ============================================
   MisaKu — app.js
   Logic: geolokasi, filter jadwal per hari, misa bahasa asing, hitung jarak, render kartu
   ============================================ */

   const MAX_HASIL = 5;
   const NAMA_HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']; // index = getDay()
   let gereja_data = [];
   
   /* ---- INIT ---- */
   document.addEventListener('DOMContentLoaded', async () => {
     update_clock();
     setInterval(update_clock, 1000);
     await load_data();
   });
   
   /* ---- LOAD DATA ---- */
   async function load_data() {
     try {
       const res = await fetch('./data/gereja.json');
       gereja_data = await res.json();
     } catch (e) {
       tampil_status('Gagal memuat data gereja. Coba refresh halaman.', 'error');
     }
   }
   
   /* ---- CLOCK ---- */
   function update_clock() {
     const el = document.getElementById('headerTime');
     const now = new Date();
     el.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
   }
   
   /* ---- REQUEST LOKASI ---- */
   function minta_lokasi() {
     const btn = document.getElementById('btnLokasi');
     btn.classList.add('loading');
     btn.querySelector('.btn-icon').textContent = '⟳';
     btn.querySelector('.btn-icon').style.animation = 'none';
     sembunyikan_status();
   
     if (!navigator.geolocation) {
       tampil_status('Browser kamu tidak mendukung geolocation. Coba gunakan Chrome atau Safari terbaru.', 'error');
       reset_btn(btn);
       return;
     }
   
     navigator.geolocation.getCurrentPosition(
       (pos) => {
         reset_btn(btn);
         proses_lokasi(pos.coords.latitude, pos.coords.longitude);
       },
       (err) => {
         reset_btn(btn);
         let pesan = 'Akses lokasi ditolak. ';
         if (err.code === 1) pesan += 'Izinkan akses lokasi di browser kamu, lalu coba lagi.';
         else if (err.code === 2) pesan += 'Lokasi tidak dapat dideteksi. Pastikan GPS aktif.';
         else pesan += 'Terjadi error. Coba lagi.';
         tampil_status(pesan, 'error');
       },
       { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
     );
   }
   
   function reset_btn(btn) {
     btn.classList.remove('loading');
     btn.querySelector('.btn-icon').textContent = '◎';
   }
   
   /* ---- MINGGU KE- DALAM BULAN (1–5) ---- */
   function minggu_ke(now) {
     return Math.ceil(now.getDate() / 7);
   }
   
   /* ---- JADWAL REGULER HARI INI ---- */
   function get_jadwal_hari_ini(jadwal, now) {
     if (!jadwal) return [];
     const hari = NAMA_HARI[now.getDay()];
   
     // Jumat pertama (tanggal 1–7) memakai jadwal khusus, kalau ada
     if (hari === 'jumat' && minggu_ke(now) === 1 && (jadwal.jumat_pertama || []).length > 0) {
       return jadwal.jumat_pertama;
     }
     return jadwal[hari] || [];
   }
   
   /* ---- MISA BAHASA ASING HARI INI ---- */
   function get_misa_bahasa_hari_ini(lain, now) {
     if (!Array.isArray(lain)) return [];
     const hari = NAMA_HARI[now.getDay()];
     const minggu = minggu_ke(now);
   
     return lain.filter(o => {
       if (!['misa_bahasa', 'adorasi'].includes(o.jenis) || o.hari !== hari) return false;
   
       const ket = (o.keterangan || '').toLowerCase();
       if (!ket) return true;
   
       // "Minggu ke-1 dan ke-3" -> hanya tampil di minggu 1 dan 3
       const angka = [...ket.matchAll(/ke-?\s?(\d)/g)].map(m => Number(m[1]));
       if (angka.length) return angka.includes(minggu);
   
       // "Jumat Pertama" -> hanya minggu pertama
       if (ket.includes('pertama')) return minggu === 1;
   
       return true;
     });
   }
   
   /* ---- PROSES LOKASI ---- */
   function proses_lokasi(lat, lng) {
     const now = new Date();
     const jam_sekarang_menit = now.getHours() * 60 + now.getMinutes();
   
     const dengan_jarak = gereja_data.map(g => ({
       ...g,
       jarak_km: hitung_jarak(lat, lng, g.lat, g.lng),
       jadwal_hari_ini: get_jadwal_hari_ini(g.jadwal_reguler, now),
       bahasa_hari_ini: get_misa_bahasa_hari_ini(g.jadwal_lain, now),
     }));
   
     dengan_jarak.sort((a, b) => a.jarak_km - b.jarak_km);
   
     // Tampilkan gereja yang punya misa hari ini (Indonesia atau bahasa asing)
     const hasil = dengan_jarak
       .filter(g => g.jadwal_hari_ini.length > 0 || g.bahasa_hari_ini.length > 0)
       .slice(0, MAX_HASIL);
   
     // Kalau tidak ada yang punya misa hari ini, tampilkan 5 terdekat saja
     const tampil = hasil.length > 0 ? hasil : dengan_jarak.slice(0, MAX_HASIL);
   
     render_hasil(tampil, jam_sekarang_menit, lat, lng);
   }
   
   /* ---- HITUNG JARAK (Haversine) ---- */
   function hitung_jarak(lat1, lng1, lat2, lng2) {
     const R = 6371;
     const dLat = deg_to_rad(lat2 - lat1);
     const dLng = deg_to_rad(lng2 - lng1);
     const a =
       Math.sin(dLat / 2) * Math.sin(dLat / 2) +
       Math.cos(deg_to_rad(lat1)) * Math.cos(deg_to_rad(lat2)) *
       Math.sin(dLng / 2) * Math.sin(dLng / 2);
     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
     return R * c;
   }
   
   function deg_to_rad(deg) {
     return deg * (Math.PI / 180);
   }
   
   /* ---- FORMAT JARAK ---- */
   function format_jarak(km) {
     if (km < 1) return Math.round(km * 1000) + ' m';
     return km.toFixed(1) + ' km';
   }
   
   /* ---- CEK STATUS MISA ---- */
   function status_jadwal(jam_str, jam_sekarang_menit) {
     const [h, m] = jam_str.split(':').map(Number);
     const misa_menit = h * 60 + m;
     const selisih = misa_menit - jam_sekarang_menit;
   
     if (selisih < 0) return 'lewat';        // sudah lewat
     if (selisih <= 30) return 'segera';     // dalam 30 menit ke depan
     return 'bisa';                          // masih bisa dikejar
   }
   
   /* ---- RENDER HASIL ---- */
   function render_hasil(data, jam_sekarang_menit, user_lat, user_lng) {
     const section = document.getElementById('hasilSection');
     const daftar = document.getElementById('daftarGereja');
     const count = document.getElementById('hasilCount');
     const lokasi_el = document.getElementById('hasilLokasi');
   
     section.classList.remove('hidden');
     daftar.innerHTML = '';
   
     count.textContent = `${data.length} gereja terdekat`;
     lokasi_el.textContent = `±${format_jarak(data[0]?.jarak_km || 0)} dari kamu`;
   
     if (data.length === 0) {
       daftar.innerHTML = `
         <div class="empty-state">
           <div class="empty-icon">✝</div>
           <div class="empty-title">Tidak ada data gereja</div>
           <div class="empty-sub">Coba periksa koneksi internet dan refresh halaman.</div>
         </div>`;
       return;
     }
   
     data.forEach(g => {
       const kartu = buat_kartu(g, jam_sekarang_menit);
       daftar.appendChild(kartu);
     });
   
     section.scrollIntoView({ behavior: 'smooth', block: 'start' });
   }
   
   /* ---- BUAT KARTU GEREJA ---- */
   function buat_kartu(g, jam_sekarang_menit) {
     const div = document.createElement('div');
     div.className = 'kartu-gereja';
   
     let chips_html = '';
     if (g.jadwal_hari_ini.length === 0 && g.bahasa_hari_ini.length === 0) {
       chips_html = '<span class="no-misa">Tidak ada misa hari ini</span>';
     } else {
       // Jam yang sudah tampil sebagai badge tidak diulang sebagai chip biasa
       const jam_ber_badge = new Set(g.bahasa_hari_ini.map(o => o.jam));
       const jam_biasa = g.jadwal_hari_ini.filter(jam => !jam_ber_badge.has(jam));
   
       // Misa Indonesia (jadwal reguler)
       if (jam_biasa.length > 0) {
         chips_html += '<div class="jadwal-wrap">';
         [...jam_biasa].sort().forEach(jam => {
           const status = status_jadwal(jam, jam_sekarang_menit);
           const label = status === 'segera' ? `${jam} ⚡` : jam;
           chips_html += `<span class="jadwal-chip ${status}"><span class="chip-dot"></span>${label}</span>`;
         });
         chips_html += '</div>';
       }
   
       // Misa bahasa asing, dengan badge bahasa
       [...g.bahasa_hari_ini]
         .sort((a, b) => a.jam.localeCompare(b.jam))
         .forEach(o => {
           const status = status_jadwal(o.jam, jam_sekarang_menit);
           const label = status === 'segera' ? `${o.jam} ⚡` : o.jam;
           const teks_badge = o.jenis === 'adorasi'
             ? o.keterangan
             : `Misa bahasa ${o.bahasa}${o.keterangan ? ' · ' + o.keterangan : ''}`;
           chips_html += `
             <div class="misa-bahasa-row">
               <span class="jadwal-chip ${status}"><span class="chip-dot"></span>${label}</span>
               <span class="badge-bahasa">${teks_badge}</span>
             </div>`;
         });
     }
   
     // Maps URL
     const maps_url = `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}&travelmode=driving`;
   
     div.innerHTML = `
       <div class="kartu-top">
         <div class="kartu-nama">${g.nama}</div>
         <div class="kartu-jarak">${format_jarak(g.jarak_km)}</div>
       </div>
       <div class="kartu-paroki">${g.paroki}</div>
       ${chips_html}
       <div class="kartu-footer">
         <div class="badge-terverifikasi">Terverifikasi ${g.terverifikasi}</div>
         <a class="btn-rute" href="${maps_url}" target="_blank" rel="noopener noreferrer">
           ↗ Buka Rute
         </a>
       </div>
     `;
   
     return div;
   }
   
   /* ---- STATUS HELPERS ---- */
   function tampil_status(pesan, tipe = 'info') {
     const el = document.getElementById('statusMsg');
     el.textContent = pesan;
     el.className = `status-msg ${tipe}`;
     el.classList.remove('hidden');
   }
   
   function sembunyikan_status() {
     document.getElementById('statusMsg').classList.add('hidden');
   }