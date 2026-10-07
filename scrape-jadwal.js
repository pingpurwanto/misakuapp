#!/usr/bin/env node
'use strict';

/*
  scrape-jadwal.js — MisaKu

  Memperbarui `jadwal_reguler` dan `terverifikasi` di data/gereja.json
  dari jadwalmisa.id. Gereja dicocokkan lewat `id` (sama dengan id jadwalmisa.id).

  Langkah:
    1) node scrape-jadwal.js              -> membuat data/gereja.preview.json + laporan.txt
                                             (data/gereja.json TIDAK diubah)
    2) baca laporan.txt, perbaiki yang bertanda [CEK] bila perlu
    3) node scrape-jadwal.js --terapkan   -> preview menggantikan gereja.json
                                             (cadangan: data/gereja.json.bak)

  Aturan:
    - Hanya jadwal_reguler dan terverifikasi yang berubah. Field lain tidak disentuh.
    - Jadwal kosong di jadwalmisa.id  -> jadwal_reguler ikut dikosongkan.
    - Judul harian yang menyebut Sabtu (mis. "Senin - Sabtu") -> jam harian juga masuk ke sabtu.
      Judul harian tanpa hari, atau "Senin - Jumat" -> hanya masuk harian.
    - Entri yang tidak pasti (hari tidak lengkap, misa khusus, dll.) TIDAK dimasukkan
      dan ditulis sebagai [CEK] di laporan.
    - Gereja yang tidak ditemukan di jadwalmisa.id tidak disentuh.

  Cadangan bila internet/situs bermasalah: simpan file JSON wilayah di folder
  sumber-jadwalmisa/ dengan nama kota-jakarta-barat.json, kota-jakarta-pusat.json, dst.
*/

const fs = require('fs');
const path = require('path');

const BASE = 'https://jadwalmisa.id';
const WILAYAH = [
  'kota-jakarta-pusat',
  'kota-jakarta-utara',
  'kota-jakarta-barat',
  'kota-jakarta-selatan',
  'kota-jakarta-timur',
];
const FILE_DATA = path.join('data', 'gereja.json');
const FILE_PREVIEW = path.join('data', 'gereja.preview.json');
const FILE_BAK = path.join('data', 'gereja.json.bak');
const FILE_LAPORAN = 'laporan.txt';
const FOLDER_SUMBER = 'sumber-jadwalmisa';
const KATEGORI = ['harian', 'sabtu', 'minggu', 'jumat_pertama'];

const HARI = {
  senin: 1, monday: 1, selasa: 2, tuesday: 2, rabu: 3, wednesday: 3,
  kamis: 4, thursday: 4, jumat: 5, friday: 5, sabtu: 6, saturday: 6,
};
const NAMA_HARI = Object.keys(HARI).join('|');
const LABEL_HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const RE_JAM = /(?<![\d:.])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/;
const RE_AWALAN_HARI = new RegExp('^\\s*(' + NAMA_HARI + ')\\b[\\s,:-]*', 'i');
const RE_RENTANG = new RegExp(
  '\\b(' + NAMA_HARI + ')\\s*(?:-|–|s\\/d|sampai)\\s*(' + NAMA_HARI + ')\\b'
);
const RE_SEMUA_HARI = new RegExp('\\b(' + NAMA_HARI + ')\\b', 'g');

// Jam yang bersyarat (hanya minggu tertentu, kelompok khusus, dll.)
const RE_KHUSUS_WAKTU =
  /\b(ubk|abk|khusus|lansia|minggu ke|ke-?\s?\d|pertama dan|pertama &|setiap|every|\d+(?:st|nd|rd|th))\b/i;

// Judul yang bukan misa rutin mingguan/harian
const RE_KHUSUS_JUDUL = new RegExp(
  '(\\bubk\\b|\\babk\\b|\\blansia\\b|\\banak\\b|online|streaming|novena|adorasi|pengakuan|tobat|' +
    'jalan salib|ibadat|rosario|arwah|kerahiman|hora sancta|ulang tahun|perkawinan|\\bhup\\b|' +
    'pesta|perayaan|ke-?\\s?\\d|pertama dan|pertama &|' +
    '(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu)\\s+(?:pertama|kedua|ketiga|keempat|kelima|terakhir))'
);

/* ---------------- Parser ---------------- */

function bacaWaktu(mentah) {
  const teks = String(mentah == null ? '' : mentah).replace(/\s+/g, ' ').trim();
  let hari = null;
  let sisa = teks;
  const awal = teks.match(RE_AWALAN_HARI);
  if (awal) {
    hari = HARI[awal[1].toLowerCase()];
    sisa = teks.slice(awal[0].length);
  }
  const m = sisa.match(RE_JAM);
  if (!m) return { teks, jam: null };
  return {
    teks,
    jam: String(m[1]).padStart(2, '0') + ':' + m[2],
    hari,
    polos: /^\d{1,2}[:.]\d{2}$/.test(sisa),
    khusus: RE_KHUSUS_WAKTU.test(teks),
  };
}

function hariCakupan(judul) {
  const t = judul.toLowerCase().replace(/kecuali.*$/, '');
  const hasil = new Set();
  const r = t.match(RE_RENTANG);
  if (r) {
    const a = HARI[r[1]];
    const b = HARI[r[2]];
    for (let d = a; d <= b; d++) hasil.add(d);
  } else {
    for (const m of t.matchAll(RE_SEMUA_HARI)) hasil.add(HARI[m[1]]);
  }
  return hasil;
}

function klasifikasi(judul) {
  const t = judul.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(misa\s+)?jumat\s+pertama/.test(t)) return { kategori: 'jumat_pertama' };
  if (!/misa|mass/.test(t)) return { lewati: 'bukan misa', info: true };
  if (RE_KHUSUS_JUDUL.test(t.replace(/jumat pertama/g, ''))) {
    return { lewati: 'misa khusus / tidak rutin tiap minggu' };
  }
  if (/sabtu sore/.test(t)) return { kategori: 'sabtu' };
  const adaHarian = /harian|daily/.test(t);
  const adaSabtu = /\bsabtu\b|saturday/.test(t);
  const adaMinggu = /\bminggu\b|sunday/.test(t);
  if (adaHarian) return { kategori: 'harian', hari: hariCakupan(t) };
  if (adaSabtu && adaMinggu) return { lewati: 'judul menyebut Sabtu dan Minggu sekaligus' };
  if (adaSabtu) return { kategori: 'sabtu' };
  if (adaMinggu) return { kategori: 'minggu' };
  return { lewati: 'hari tidak dikenali' };
}

function daftarHari(arr) {
  return arr.map((d) => LABEL_HARI[d]).join(', ');
}

function prosesGereja(sumber) {
  const jadwal = Array.isArray(sumber.schedules) ? sumber.schedules : [];
  const catatan = [];
  const hasil = { harian: new Set(), sabtu: new Set(), minggu: new Set(), jumat_pertama: new Set() };

  if (jadwal.length === 0) {
    return { status: 'kosong', baru: { harian: [], sabtu: [], minggu: [], jumat_pertama: [] }, catatan };
  }

  for (const item of jadwal) {
    const judul = String(item.title || '').trim();
    if (item.is_special === true || item.status === false) {
      catatan.push(`[lewati] "${judul}" (ditandai khusus/nonaktif)`);
      continue;
    }

    const k = klasifikasi(judul);
    const waktu = (Array.isArray(item.time) ? item.time : []).map((t) => bacaWaktu(t && t.start));

    if (k.lewati) {
      const jamTerbaca = waktu.filter((w) => w.jam).map((w) => w.jam).join(', ');
      const label = k.info ? '[lewati]' : '[CEK]';
      catatan.push(`${label} "${judul}" dilewati (${k.lewati})${jamTerbaca ? ' -> ' + jamTerbaca : ''}`);
      continue;
    }

    if (/english|mandarin/i.test(judul)) {
      catatan.push(`[info] misa bahasa Inggris/Mandarin ikut dimasukkan: "${judul}"`);
    }
    if (/kapel|stasi|auditorium/i.test(judul)) {
      catatan.push(`[CEK] jam dari kapel/lokasi lain ikut dimasukkan: "${judul}"`);
    }

    // jam -> himpunan hari (khusus kategori harian)
    const petaHarian = new Map();

    for (const w of waktu) {
      if (!w.jam) {
        catatan.push(`[CEK] jam tidak terbaca: "${w.teks}" di "${judul}"`);
        continue;
      }
      if (w.khusus) {
        catatan.push(`[CEK] jam bersyarat dilewati: "${w.teks}" di "${judul}"`);
        continue;
      }
      if (!w.polos && !w.hari) {
        catatan.push(`[CEK] teks tambahan pada jam: "${w.teks}" di "${judul}" (jam tetap dimasukkan)`);
      }

      if (k.kategori !== 'harian') {
        hasil[k.kategori].add(w.jam);
        continue;
      }
      const cov = w.hari ? new Set([w.hari]) : new Set(k.hari);
      const ada = petaHarian.get(w.jam) || new Set();
      cov.forEach((d) => ada.add(d));
      petaHarian.set(w.jam, ada);
    }

    for (const [jam, cov] of petaHarian) {
      if (cov.size === 0) {
        hasil.harian.add(jam); // judul tidak menyebut hari -> anggap Senin-Jumat
        continue;
      }
      const hariKerja = [1, 2, 3, 4, 5].filter((d) => cov.has(d));
      if (hariKerja.length === 5) {
        hasil.harian.add(jam);
      } else if (hariKerja.length > 0) {
        catatan.push(
          `[CEK] ${jam} di "${judul}" hanya berlaku ${daftarHari(hariKerja)} -> tidak dimasukkan ke harian`
        );
      }
      if (cov.has(6)) hasil.sabtu.add(jam);
    }
  }

  const baru = {};
  let total = 0;
  for (const kat of KATEGORI) {
    baru[kat] = [...hasil[kat]].sort();
    total += baru[kat].length;
  }
  if (total === 0) return { status: 'tidak-terbaca', baru, catatan };
  return { status: 'ok', baru, catatan };
}

/* ---------------- Penulisan JSON (format sama dengan file kamu) ---------------- */

const arrInline = (a) => '[' + a.map((x) => JSON.stringify(x)).join(', ') + ']';
const jadwalInline = (j) =>
  '{ ' + KATEGORI.map((k) => `"${k}": ${arrInline(j[k] || [])}`).join(', ') + ' }';

function tulisJson(data) {
  const blok = data.map((g) => {
    const baris = Object.entries(g).map(([k, v]) => {
      const nilai = k === 'jadwal_reguler' ? jadwalInline(v) : JSON.stringify(v);
      return `    ${JSON.stringify(k)}: ${nilai}`;
    });
    return `  {\n${baris.join(',\n')}\n  }`;
  });
  return `[\n${blok.join(',\n')}\n]\n`;
}

/* ---------------- Pengambilan data ---------------- */

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
const OPSI_FETCH = () => ({
  headers: { 'User-Agent': 'Mozilla/5.0 (MisaKu jadwal updater)' },
  signal: AbortSignal.timeout(20000),
});

async function ambilBuildId() {
  const res = await fetch(BASE + '/', OPSI_FETCH());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('buildId tidak ditemukan di halaman');
  return m[1];
}

async function ambilWilayah(slug, buildId) {
  const url = `${BASE}/_next/data/${buildId}/cari/dki-jakarta/${slug}.json?slugs=dki-jakarta&slugs=${slug}`;
  const res = await fetch(url, OPSI_FETCH());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  return json.pageProps.data;
}

async function kumpulkanSumber() {
  const peta = new Map();
  let buildId = null;
  try {
    buildId = await ambilBuildId();
    console.log('buildId:', buildId);
  } catch (e) {
    console.log(`Tidak bisa ambil buildId (${e.message}). Mencoba file lokal di ${FOLDER_SUMBER}/ ...`);
  }

  for (const slug of WILAYAH) {
    let daftar = null;
    if (buildId) {
      try {
        daftar = await ambilWilayah(slug, buildId);
        console.log(`${slug}: ${daftar.length} gereja (online)`);
      } catch (e) {
        console.log(`${slug}: gagal online (${e.message})`);
      }
      await tunggu(400);
    }
    if (!daftar) {
      const f = path.join(FOLDER_SUMBER, slug + '.json');
      if (fs.existsSync(f)) {
        daftar = JSON.parse(fs.readFileSync(f, 'utf8')).pageProps.data;
        console.log(`${slug}: ${daftar.length} gereja (file lokal)`);
      }
    }
    if (!daftar) {
      console.log(`${slug}: DILEWATI, tidak ada data (gereja di wilayah ini tidak akan diubah)`);
      continue;
    }
    for (const c of daftar) peta.set(c.id, c);
  }

  if (peta.size === 0) throw new Error('Tidak ada data jadwalmisa.id sama sekali. Berhenti.');
  return peta;
}

/* ---------------- Alur utama ---------------- */

const fmt = (a) => (a && a.length ? a.join(', ') : '(kosong)');
const sama = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

async function main() {
  if (process.argv.includes('--terapkan')) return terapkan();

  const data = JSON.parse(fs.readFileSync(FILE_DATA, 'utf8'));
  const sumber = await kumpulkanSumber();
  const tanggal = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  });

  const ringkas = { diperbarui: 0, dikosongkan: 0, tidakBerubah: 0, tidakDitemukan: 0 };
  const blokPerhatian = [];
  const blokBiasa = [];

  const keluar = data.map((g) => {
    const src = sumber.get(g.id);
    const baris = [`[${g.id}] ${g.nama}`];

    if (!src) {
      ringkas.tidakDitemukan++;
      baris.push('  Tidak ada di jadwalmisa.id -> tidak diubah');
      blokPerhatian.push(baris.join('\n'));
      return g;
    }

    const r = prosesGereja(src);

    if (r.status === 'tidak-terbaca') {
      ringkas.tidakBerubah++;
      baris.push('  Semua entri jadwalmisa.id dilewati -> jadwal lama dipertahankan');
      r.catatan.forEach((c) => baris.push('  ' + c));
      blokPerhatian.push(baris.join('\n'));
      return g;
    }

    if (r.status === 'kosong') {
      ringkas.dikosongkan++;
      baris.push('  JADWAL KOSONG di jadwalmisa.id -> jadwal_reguler dikosongkan');
    } else {
      ringkas.diperbarui++;
    }

    const lama = g.jadwal_reguler || {};
    for (const k of KATEGORI) {
      const tanda = sama(lama[k], r.baru[k]) ? '' : '   <== BERUBAH';
      baris.push(`  ${k.padEnd(14)}: ${fmt(lama[k])}  ->  ${fmt(r.baru[k])}${tanda}`);
    }
    r.catatan.forEach((c) => baris.push('  ' + c));

    const perlu = r.status === 'kosong' || r.catatan.some((c) => c.startsWith('[CEK]'));
    (perlu ? blokPerhatian : blokBiasa).push(baris.join('\n'));

    // terverifikasi diperbarui, field lain tidak disentuh
    return { ...g, jadwal_reguler: r.baru, terverifikasi: tanggal };
  });

  const laporan = [
    `LAPORAN SCRAPE jadwalmisa.id — ${tanggal}`,
    '',
    `Diperbarui            : ${ringkas.diperbarui}`,
    `Dikosongkan (sumber kosong): ${ringkas.dikosongkan}`,
    `Tidak diubah (entri tak terbaca): ${ringkas.tidakBerubah}`,
    `Tidak ada di jadwalmisa.id     : ${ringkas.tidakDitemukan}`,
    '',
    '=== PERLU DICEK ===',
    '',
    blokPerhatian.join('\n\n') || '(tidak ada)',
    '',
    '=== LAINNYA ===',
    '',
    blokBiasa.join('\n\n') || '(tidak ada)',
    '',
  ].join('\n');

  fs.writeFileSync(FILE_PREVIEW, tulisJson(keluar));
  fs.writeFileSync(FILE_LAPORAN, laporan);

  console.log('');
  console.log(`Selesai. Diperbarui: ${ringkas.diperbarui}, dikosongkan: ${ringkas.dikosongkan}, ` +
    `tidak diubah: ${ringkas.tidakBerubah}, tidak ditemukan: ${ringkas.tidakDitemukan}`);
  console.log(`Hasil   : ${FILE_PREVIEW}`);
  console.log(`Laporan : ${FILE_LAPORAN}  (baca bagian PERLU DICEK dulu)`);
  console.log(`Kalau sudah yakin, jalankan: node scrape-jadwal.js --terapkan`);
}

function terapkan() {
  if (!fs.existsSync(FILE_PREVIEW)) {
    console.error(`Belum ada ${FILE_PREVIEW}. Jalankan dulu: node scrape-jadwal.js`);
    process.exit(1);
  }
  const preview = JSON.parse(fs.readFileSync(FILE_PREVIEW, 'utf8'));
  const asli = JSON.parse(fs.readFileSync(FILE_DATA, 'utf8'));
  if (preview.length !== asli.length) {
    console.error('Jumlah gereja di preview berbeda dengan gereja.json. Dibatalkan.');
    process.exit(1);
  }
  fs.copyFileSync(FILE_DATA, FILE_BAK);
  fs.copyFileSync(FILE_PREVIEW, FILE_DATA);
  fs.unlinkSync(FILE_PREVIEW);
  console.log(`Selesai. ${FILE_DATA} sudah diperbarui (cadangan: ${FILE_BAK}).`);
  console.log('Cek di browser, lalu hapus gereja.json.bak dan laporan.txt sebelum commit.');
}

module.exports = { klasifikasi, bacaWaktu, hariCakupan, prosesGereja, tulisJson };

if (require.main === module) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}