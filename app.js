/* ============================================
   MisaKu — app.js
   Logic: geolokasi, filter jadwal, hitung jarak, render kartu
   ============================================ */

const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const MAX_HASIL = 5;
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
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function reset_btn(btn) {
  btn.classList.remove('loading');
  btn.querySelector('.btn-icon').textContent = '◎';
}

/* ---- PROSES LOKASI ---- */
function proses_lokasi(lat, lng) {
  const now = new Date();
  const hari_ini = HARI[now.getDay()];
  const jam_sekarang_menit = now.getHours() * 60 + now.getMinutes();

  // Hitung jarak ke semua gereja
  const dengan_jarak = gereja_data.map(g => ({
    ...g,
    jarak_km: hitung_jarak(lat, lng, g.lat, g.lng),
    jadwal_hari_ini: g.jadwal_reguler[hari_ini] || []
  }));

  // Urutkan berdasarkan jarak
  dengan_jarak.sort((a, b) => a.jarak_km - b.jarak_km);

  // Ambil 5 terdekat yang punya jadwal hari ini
  const hasil = dengan_jarak
    .filter(g => g.jadwal_hari_ini.length > 0)
    .slice(0, MAX_HASIL);

  // Kalau tidak ada yang punya jadwal, tampilkan 5 terdekat saja
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

  if (selisih < -60) return 'lewat';      // sudah lebih dari 1 jam lalu
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

  // Cek apakah ada yang bisa dikejar
  const ada_yang_bisa = data.some(g =>
    g.jadwal_hari_ini.some(j => status_jadwal(j, jam_sekarang_menit) !== 'lewat')
  );

  count.textContent = ada_yang_bisa
    ? `${data.length} gereja terdekat`
    : `${data.length} gereja terdekat`;

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

  // Scroll ke hasil
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---- BUAT KARTU GEREJA ---- */
function buat_kartu(g, jam_sekarang_menit) {
  const div = document.createElement('div');
  div.className = 'kartu-gereja';

  // Jadwal chips
  let chips_html = '';
  if (g.jadwal_hari_ini.length === 0) {
    chips_html = '<span class="no-misa">Tidak ada misa hari ini</span>';
  } else {
    const sorted = [...g.jadwal_hari_ini].sort();
    chips_html = '<div class="jadwal-wrap">';
    sorted.forEach(jam => {
      const status = status_jadwal(jam, jam_sekarang_menit);
      const label = status === 'segera' ? `${jam} ⚡` : jam;
      chips_html += `<span class="jadwal-chip ${status}"><span class="chip-dot"></span>${label}</span>`;
    });
    chips_html += '</div>';
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
