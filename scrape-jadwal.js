#!/usr/bin/env node
'use strict';

/*
  scrape-jadwal.js — MisaKu (format jadwal per hari)

  Memperbarui di data/gereja.json:
    - jadwal_reguler : senin … minggu, jumat_pertama  (misa Indonesia)
    - jadwal_lain    : misa bahasa asing (Inggris / Mandarin), dengan hari & jam
    - terverifikasi  : tanggal scrape, hanya untuk gereja yang ditemukan di jadwalmisa.id

  Pemakaian:
    node scrape-jadwal.js              -> data/gereja.preview.json + laporan.txt
                                          (gereja.json TIDAK diubah)
    node scrape-jadwal.js --terapkan   -> preview menggantikan gereja.json
                                          (cadangan: data/gereja.json.bak)

  Aturan:
    - Gereja yang tidak ditemukan di jadwalmisa.id: jadwal tidak diubah.
    - Jadwal kosong di jadwalmisa.id: jadwal_reguler ikut dikosongkan.
    - Judul "Misa Harian" polos            -> Senin–Jumat.
    - Judul "Harian (Senin - Sabtu)" dsb.  -> hari sesuai rentang / daftar.
    - Judul "Misa Sabtu", "Misa Minggu"    -> sabtu / minggu.
    - Judul "Misa Jumat Pertama"           -> jumat_pertama.
    - Misa bahasa Inggris/Mandarin         -> jadwal_lain (tidak masuk jadwal_reguler).
    - Misa khusus (UBK, lansia, arwah, online, novena, adorasi, dst.) dilewati, ditandai [CEK].
    - Jam dari kapel/stasi lain dilewati, ditandai [CEK], kecuali diizinkan di koreksi-manual.json.
    - Jam bersyarat (minggu ke-…, setiap…, ND) dilewati, ditandai [CEK].
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
const FILE_KOREKSI = 'koreksi-manual.json';
const FILE_LAPORAN = 'laporan.txt';
const FOLDER_SUMBER = 'sumber-jadwalmisa';

const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
const HARI_KERJA = HARI.slice(0, 5);
const KATEGORI = [...HARI, 'jumat_pertama'];
const LABEL = {
  senin: 'Senin', selasa: 'Selasa', rabu: 'Rabu', kamis: 'Kamis',
  jumat: 'Jumat', sabtu: 'Sabtu', minggu: 'Minggu',
};

const RE_HARI_GLOBAL = /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/g;
const RE_RENTANG = /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\s*(?:-|–|s\/d|sampai|hingga)\s*(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/;
const RE_JAM = /(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/;

// Judul yang bukan misa rutin: dilewati tanpa dicatat sebagai masalah
const RE_BUKAN_MISA = /adorasi|novena|pengakuan|jalan salib|ibadat|hora sancta|tuguran|tablo|pemberkatan|sakramen tobat/;

// Judul misa khusus / tidak rutin tiap minggu
const RE_KHUSUS = /\b(ubk|abk|khusus|lansia|anak|online|streaming|arwah|kerahiman|ulang tahun|perkawinan|hup|pesta|perayaan|rosario|lamentasi|tenebrae|vigili|palma|paskah|kenaikan|pentakosta|tiap|ke-?\s?\d|pertama dan|pertama &|minggu ke|sabtu pertama|jumat ketiga|jumat kedua|jumat terakhir)\b/;

// Teks jam yang bersyarat (hanya untuk misa Indonesia; misa bahasa asing dipertahankan)
const RE_BERSYARAT_JAM = /minggu ke|setiap|every|khusus|\bubk\b|\babk\b|lansia|pertama dan|ke-?\s?\d|\d\s*(?:dan|&)\s*\d|\bnd\b|\(nd\)|anak\b/i;

/* ---------------- Helper dasar ---------------- */

function kosongReguler() {
  return Object.fromEntries(KATEGORI.map(k => [k, []]));
}

function normalisasiLama(j) {
  // Mengubah format lama (harian/sabtu/minggu/jumat_pertama) ke format per hari
  const out = kosongReguler();
  if (!j || typeof j !== 'object') return out;
  if (Array.isArray(j.harian)) HARI_KERJA.forEach(h => { out[h] = [...j.harian]; });
  for (const k of KATEGORI) if (Array.isArray(j[k])) out[k] = [...j[k]];
  return out;
}

function langOf(teks) {
  const t = String(teks || '').toLowerCase();
  if (/english|inggris/.test(t)) return 'Inggris';
  if (/mandarin/.test(t)) return 'Mandarin';
  return null;
}

function hariDariTeks(t) {
  const r = t.match(RE_RENTANG);
  if (r) {
    const a = HARI.indexOf(r[1]);
    const b = HARI.indexOf(r[2]);
    return a <= b ? HARI.slice(a, b + 1) : [];
  }
  const out = [];
  for (const m of t.matchAll(RE_HARI_GLOBAL)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function bacaWaktu(mentah) {
  const teks = String(mentah == null ? '' : mentah).replace(/\s+/g, ' ').trim();
  const m = teks.match(RE_JAM);
  if (!m) return { teks, jam: null, awalan: '', sisa: '', hari: null };
  const awalan = teks.slice(0, m.index).replace(/[\s\-–:(]+$/, '').trim();
  const sisa = teks.slice(m.index + m[0].length).trim();
  const h = awalan.toLowerCase().match(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/);
  return {
    teks,
    jam: String(m[1]).padStart(2, '0') + ':' + m[2],
    awalan,
    sisa,
    hari: h ? h[1] : null,
  };
}

/* ---------------- Klasifikasi judul ---------------- */

function klasifikasi(judul, adaBahasa) {
  const t = judul.toLowerCase().replace(/\s+/g, ' ').trim();

  if (!/misa|mass|harian|sabtu|minggu|jumat pertama/.test(t)) {
    return { lewati: 'bukan misa', info: true };
  }
  if (!adaBahasa && RE_KHUSUS.test(t)) {
    return { lewati: 'misa khusus / tidak rutin tiap minggu' };
  }
  if (/jumat pertama/.test(t) && !/harian/.test(t)) {
    return { kategori: 'jumat_pertama', hari: [] };
  }
  if (/sabtu sore|mingguan hari sabtu/.test(t)) {
    return { kategori: 'sabtu', hari: [] };
  }

  const hari = hariDariTeks(t);
  if (/harian|daily/.test(t)) {
    return { kategori: 'harian', hari: hari.length ? hari : HARI_KERJA.slice() };
  }

  const adaSabtu = hari.includes('sabtu');
  const adaMinggu = hari.includes('minggu');
  if (adaSabtu && adaMinggu) return { lewati: 'judul menyebut Sabtu dan Minggu sekaligus' };
  if (adaSabtu) return { kategori: 'sabtu', hari: [] };
  if (adaMinggu) return { kategori: 'minggu', hari: [] };
  return { lewati: 'hari tidak dikenali' };
}

function hariDariKategori(k) {
  if (k.kategori === 'harian') return k.hari;
  if (k.kategori === 'sabtu') return ['sabtu'];
  if (k.kategori === 'minggu') return ['minggu'];
  if (k.kategori === 'jumat_pertama') return ['jumat'];
  return [];
}

function keteranganBahasa(w, k) {
  let ket = w.awalan
    .replace(/english.*|mandarin.*|misa (?:bahasa )?(?:inggris|mandarin).*/i, '')
    .replace(/[\s\-–:(]+$/, '')
    .trim();
  if (HARI.includes(ket.toLowerCase())) ket = '';
  if (!ket && k.kategori === 'jumat_pertama') ket = 'Jumat Pertama';
  return ket;
}

/* ---------------- Proses satu gereja ---------------- */

function prosesGereja(sumber, koreksi = {}) {
  const jadwal = Array.isArray(sumber.schedules) ? sumber.schedules : [];
  const catatan = [];
  const reguler = Object.fromEntries(KATEGORI.map(k => [k, new Set()]));
  const lain = new Map();

  if (jadwal.length === 0) {
    return { status: 'kosong', reguler: kosongReguler(), lain: [], catatan };
  }

  const izin = (koreksi.izinkan_judul || []).map(s => s.toLowerCase());
  const abaikan = (koreksi.abaikan_judul || []).map(s => s.toLowerCase());

  for (const item of jadwal) {
    const judul = String(item.title || '').replace(/\s+/g, ' ').trim();
    const jt = judul.toLowerCase();
    const waktu = (Array.isArray(item.time) ? item.time : []).map(t => bacaWaktu(t && t.start));

    if (item.is_special === true || item.status === false) {
      catatan.push(`[lewati] "${judul}" (ditandai khusus/nonaktif)`);
      continue;
    }
    if (abaikan.some(s => jt.includes(s))) {
      catatan.push(`[koreksi] "${judul}" diabaikan sesuai koreksi-manual.json`);
      continue;
    }
    if (!/^misa\b/.test(jt) && RE_BUKAN_MISA.test(jt)) {
      catatan.push(`[lewati] "${judul}" (bukan misa)`);
      continue;
    }
    if (/kapel|stasi|auditorium/.test(jt) && !izin.some(s => jt.includes(s))) {
      catatan.push(`[CEK] "${judul}" dari kapel/stasi lain dilewati (tambahkan ke koreksi-manual.json bila mau dimasukkan)`);
      continue;
    }

    if (/\bkecuali\b/i.test(jt)) {
      catatan.push(`[CEK] "${judul}" memakai kata "kecuali": hari pengecualian tidak dikurangi otomatis, mohon dicek`);
    }
    const bahasaJudul = langOf(judul);
    const k = klasifikasi(judul, !!bahasaJudul);
    if (k.lewati) {
      const jamTerbaca = waktu.filter(w => w.jam).map(w => w.jam).join(', ');
      const label = k.info ? '[lewati]' : '[CEK]';
      catatan.push(`${label} "${judul}" dilewati (${k.lewati})${jamTerbaca ? ' -> ' + jamTerbaca : ''}`);
      continue;
    }

    const adorasiItem = /adorasi/.test(jt);

    for (const w of waktu) {
      if (!w.jam) {
        catatan.push(`[CEK] jam tidak terbaca: "${w.teks}" di "${judul}"`);
        continue;
      }
      if (/stasi|kapel|auditorium/i.test(w.teks)) {
        catatan.push(`[CEK] jam dari stasi/kapel lain dilewati: "${w.teks}" di "${judul}"`);
        continue;
      }

      const bahasa = langOf(w.teks) || bahasaJudul;

      if (bahasa) {
        const hariList = w.hari ? [w.hari] : hariDariKategori(k);
        if (hariList.length === 0) {
          catatan.push(`[CEK] hari misa ${bahasa} tidak jelas: "${w.teks}" di "${judul}"`);
          continue;
        }
        const ket = keteranganBahasa(w, k);
        for (const h of hariList) {
          lain.set(`${h}|${w.jam}|${bahasa}|${ket}`, {
            jenis: 'misa_bahasa', bahasa, hari: h, jam: w.jam, keterangan: ket,
          });
        }
        continue;
      }

      if (/\bnd\b|\(nd\)/i.test(w.teks)) {
        catatan.push(`[CEK] jam ND (sekolah Notre Dame, lokasi lain) dilewati: "${w.teks}" di "${judul}"`);
        continue;
      }

      if (RE_BERSYARAT_JAM.test(w.teks)) {
        catatan.push(`[CEK] jam bersyarat dilewati: "${w.teks}" di "${judul}"`);
        continue;
      }

      // Adorasi: jam tetap masuk jadwal reguler, dan juga dicatat sebagai badge
      if (adorasiItem || /adorasi/i.test(w.teks)) {
        const hariAdorasi = hariDariKategori(k);
        const ketAdorasi = k.kategori === 'jumat_pertama' ? 'Jumat Pertama + Adorasi' : 'Adorasi';
        for (const h of hariAdorasi) {
          lain.set(`${h}|${w.jam}|adorasi|${ketAdorasi}`, {
            jenis: 'adorasi', hari: h, jam: w.jam, keterangan: ketAdorasi,
          });
        }
      }

      if (k.kategori === 'jumat_pertama') {
        reguler.jumat_pertama.add(w.jam);
      } else if (k.kategori === 'harian') {
        const hariList = w.hari ? [w.hari] : k.hari;
        hariList.forEach(h => reguler[h].add(w.jam));
      } else {
        reguler[k.kategori].add(w.jam);
      }
    }
  }

  const out = {};
  let total = 0;
  for (const kat of KATEGORI) {
    out[kat] = [...reguler[kat]].sort();
    total += out[kat].length;
  }
  const urut = (a, b) =>
    HARI.indexOf(a.hari) - HARI.indexOf(b.hari) ||
    a.jam.localeCompare(b.jam) ||
    (a.bahasa || a.jenis).localeCompare(b.bahasa || b.jenis);
  const lainArr = [...lain.values()].sort(urut);

  if (total === 0 && lainArr.length === 0) {
    return { status: 'tidak-terbaca', reguler: out, lain: lainArr, catatan };
  }
  return { status: 'ok', reguler: out, lain: lainArr, catatan };
}

/* ---------------- Penulisan JSON (format sama dengan file kamu) ---------------- */

const arrInline = a => '[' + a.map(x => JSON.stringify(x)).join(', ') + ']';

function jadwalInline(j) {
  return '{ ' + KATEGORI.map(k => `"${k}": ${arrInline(j[k] || [])}`).join(', ') + ' }';
}

function lainBlok(lain) {
  if (!lain.length) return '[]';
  return '[\n' + lain.map(o => '      ' + JSON.stringify(o)).join(',\n') + '\n    ]';
}

function tulisJson(data) {
  const blok = data.map(g => {
    const baris = Object.entries(g).map(([k, v]) => {
      if (k === 'jadwal_reguler') return `    "jadwal_reguler": ${jadwalInline(v)}`;
      if (k === 'jadwal_lain') return `    "jadwal_lain": ${lainBlok(v)}`;
      return `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    });
    return `  {\n${baris.join(',\n')}\n  }`;
  });
  return `[\n${blok.join(',\n')}\n]\n`;
}

// Menyusun ulang urutan field agar jadwal_lain selalu tepat setelah jadwal_reguler
function susun(g, reguler, lain, tanggal) {
  const out = {};
  for (const k of Object.keys(g)) {
    if (k === 'jadwal_reguler') {
      out.jadwal_reguler = reguler;
      out.jadwal_lain = lain;
    } else if (k === 'jadwal_lain') {
      continue;
    } else if (k === 'terverifikasi' && tanggal) {
      out.terverifikasi = tanggal;
    } else {
      out[k] = g[k];
    }
  }
  if (!('jadwal_reguler' in out)) {
    out.jadwal_reguler = reguler;
    out.jadwal_lain = lain;
  }
  if (tanggal && !('terverifikasi' in out)) out.terverifikasi = tanggal;
  return out;
}

/* ---------------- Koreksi manual ---------------- */

function bacaKoreksi() {
  if (!fs.existsSync(FILE_KOREKSI)) return {};
  const obj = JSON.parse(fs.readFileSync(FILE_KOREKSI, 'utf8'));
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
}

/* ---------------- Pengambilan data ---------------- */

const tunggu = ms => new Promise(r => setTimeout(r, ms));
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

/* ---------------- Laporan ---------------- */

const fmt = a => (a && a.length ? a.join(', ') : '(kosong)');
const sama = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
const fmtLain = list =>
  !list || !list.length
    ? '(kosong)'
    : list.map(o => `${LABEL[o.hari]} ${o.jam} ${o.jenis === 'adorasi' ? 'Adorasi' : o.bahasa}${o.keterangan ? ' (' + o.keterangan + ')' : ''}`).join('; ');

/* ---------------- Alur utama ---------------- */

async function main() {
  if (process.argv.includes('--terapkan')) return terapkan();

  const data = JSON.parse(fs.readFileSync(FILE_DATA, 'utf8'));
  const koreksi = bacaKoreksi();
  const sumber = await kumpulkanSumber();
  const tanggal = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  });

  const ringkas = { diperbarui: 0, dikosongkan: 0, tidakBerubah: 0, tidakDitemukan: 0 };
  const perhatian = [];
  const biasa = [];

  const keluar = data.map(g => {
    const lamaReguler = normalisasiLama(g.jadwal_reguler);
    const lamaLain = Array.isArray(g.jadwal_lain) ? g.jadwal_lain : [];
    const src = sumber.get(g.id);
    const baris = [`[${g.id}] ${g.nama}`];

    if (!src) {
      ringkas.tidakDitemukan++;
      baris.push('  Tidak ada di jadwalmisa.id -> jadwal tidak diubah (hanya format)');
      perhatian.push(baris.join('\n'));
      return susun(g, lamaReguler, lamaLain, null);
    }

    const r = prosesGereja(src, koreksi[String(g.id)] || {});

    if (r.status === 'tidak-terbaca') {
      ringkas.tidakBerubah++;
      baris.push('  Tidak ada entri yang terbaca -> jadwal lama dipertahankan');
      r.catatan.forEach(c => baris.push('  ' + c));
      perhatian.push(baris.join('\n'));
      return susun(g, lamaReguler, lamaLain, null);
    }

    const reg = r.status === 'kosong' ? kosongReguler() : r.reguler;
    if (r.status === 'kosong') {
      ringkas.dikosongkan++;
      baris.push('  JADWAL KOSONG di jadwalmisa.id -> jadwal dikosongkan');
    } else {
      ringkas.diperbarui++;
    }

    for (const h of KATEGORI) {
      const tanda = sama(lamaReguler[h], reg[h]) ? '' : '   <== BERUBAH';
      baris.push(`  ${h.padEnd(13)}: ${fmt(lamaReguler[h])}  ->  ${fmt(reg[h])}${tanda}`);
    }
    const a = fmtLain(lamaLain);
    const b = fmtLain(r.lain);
    baris.push(`  misa bahasa  : ${a}  ->  ${b}${a === b ? '' : '   <== BERUBAH'}`);
    r.catatan.forEach(c => baris.push('  ' + c));

    const perlu = r.status === 'kosong' || r.catatan.some(c => c.startsWith('[CEK]'));
    (perlu ? perhatian : biasa).push(baris.join('\n'));

    return susun(g, reg, r.lain, tanggal);
  });

  const laporan = [
    `LAPORAN SCRAPE jadwalmisa.id — ${tanggal}`,
    '',
    `Diperbarui                      : ${ringkas.diperbarui}`,
    `Dikosongkan (sumber kosong)     : ${ringkas.dikosongkan}`,
    `Tidak diubah (entri tak terbaca): ${ringkas.tidakBerubah}`,
    `Tidak ada di jadwalmisa.id      : ${ringkas.tidakDitemukan}`,
    '',
    '=== PERLU DICEK ===',
    '',
    perhatian.join('\n\n') || '(tidak ada)',
    '',
    '=== LAINNYA ===',
    '',
    biasa.join('\n\n') || '(tidak ada)',
    '',
  ].join('\n');

  fs.writeFileSync(FILE_PREVIEW, tulisJson(keluar));
  fs.writeFileSync(FILE_LAPORAN, laporan);

  console.log('');
  console.log(`Selesai. Diperbarui: ${ringkas.diperbarui}, dikosongkan: ${ringkas.dikosongkan}, ` +
    `tidak diubah: ${ringkas.tidakBerubah}, tidak ditemukan: ${ringkas.tidakDitemukan}`);
  console.log(`Hasil   : ${FILE_PREVIEW}`);
  console.log(`Laporan : ${FILE_LAPORAN}  (baca bagian PERLU DICEK dulu)`);
  console.log('Kalau sudah yakin, jalankan: node scrape-jadwal.js --terapkan');
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
  const formatOk = preview.every(g =>
    g.jadwal_reguler && 'senin' in g.jadwal_reguler && Array.isArray(g.jadwal_lain));
  if (!formatOk) {
    console.error('Format preview tidak sesuai (harus per hari dan punya jadwal_lain). Dibatalkan.');
    process.exit(1);
  }
  fs.copyFileSync(FILE_DATA, FILE_BAK);
  fs.copyFileSync(FILE_PREVIEW, FILE_DATA);
  fs.unlinkSync(FILE_PREVIEW);
  console.log(`Selesai. ${FILE_DATA} sudah diperbarui (cadangan: ${FILE_BAK}).`);
  console.log('Cek di browser, lalu hapus gereja.json.bak dan laporan.txt sebelum commit.');
}

module.exports = { klasifikasi, bacaWaktu, hariDariTeks, prosesGereja, tulisJson, normalisasiLama };

if (require.main === module) {
  main().catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}