/**
 * admin.js - Logika Dashboard Admin GeoLocate
 */

let adminToken = null;
let petaAdmin = null;
let markersAdmin = {};
let fileAktif = null;

// Cek token admin
adminToken = localStorage.getItem('gl_admin_token');
if (!adminToken) {
  window.location.href = '/admin/login.html';
}

// Verifikasi token
fetch('/api/admin/stats', {
  headers: { 'Authorization': 'Bearer ' + adminToken }
}).then(r => {
  if (!r.ok) {
    localStorage.removeItem('gl_admin_token');
    window.location.href = '/admin/login.html';
  }
  return r.json();
}).then(muatStatistik).catch(() => {
  window.location.href = '/admin/login.html';
});

function gantiMenu(menu, el) {
  document.querySelectorAll('.admin-menu-item').forEach(m => m.classList.remove('aktif'));
  el.classList.add('aktif');
  document.querySelectorAll('.tab-konten').forEach(t => t.classList.remove('aktif'));

  const tabMap = {
    'statistik': 'tab-statistik',
    'pengguna': 'tab-pengguna',
    'peta': 'tab-peta',
    'editor': 'tab-editor',
    'database': 'tab-database',
    'log': 'tab-log'
  };

  document.getElementById(tabMap[menu]).classList.add('aktif');

  if (menu === 'statistik') muatStatistik();
  if (menu === 'pengguna') muatPengguna();
  if (menu === 'peta') inisialisasiPetaAdmin();
  if (menu === 'editor') muatPohonFile();
}

async function muatStatistik(stats) {
  if (!stats) {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    stats = await res.json();
  }
  document.getElementById('stat-total').textContent = stats.total_pengguna;
  document.getElementById('stat-online').textContent = stats.pengguna_online;
  document.getElementById('stat-teman').textContent = stats.total_pertemanan;
  document.getElementById('stat-pesan').textContent = stats.total_pesan;
  document.getElementById('stat-daftar').textContent = stats.pendaftaran_hari_ini;
  document.getElementById('waktu-refresh').textContent =
    'Diperbarui: ' + new Date().toLocaleTimeString('id-ID');
}

async function muatPengguna() {
  const tbody = document.getElementById('tabel-pengguna');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--teks-muda);padding:20px;">Memuat...</td></tr>';

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const users = await res.json();

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--teks-muda);padding:20px;">Belum ada pengguna</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const status = u.is_online
        ? '<span class="badge badge-hijau">Online</span>'
        : '<span class="badge badge-abu">Offline</span>';
      const tgl = new Date(u.created_at).toLocaleDateString('id-ID');
      return `
        <tr>
          <td>#${u.id}</td>
          <td><strong>${escHTML(u.nama)}</strong></td>
          <td style="color:var(--teks-muda)">${escHTML(u.email)}</td>
          <td style="color:var(--teks-muda)">${u.no_telepon || '-'}</td>
          <td>${status}</td>
          <td>${u.friend_count}</td>
          <td style="color:var(--teks-muda)">${tgl}</td>
          <td>
            <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;" onclick="lihatLog(${u.id}, '${escHTML(u.nama)}')">Log</button>
            <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;" onclick="lihatLokasiAdmin(${u.id})">Lokasi</button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--merah);">${err.message}</td></tr>`;
  }
}

async function lihatLog(userID, nama) {
  gantiMenu('log', document.querySelectorAll('.admin-menu-item')[1]);
  document.getElementById('tab-log').classList.add('aktif');
  document.getElementById('log-nama-pengguna').textContent = `Aktivitas: ${nama} (ID: #${userID})`;

  const tbody = document.getElementById('tabel-log');
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--teks-muda);">Memuat...</td></tr>';

  try {
    const res = await fetch(`/api/admin/users/${userID}/activity`, {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const logs = await res.json();

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--teks-muda);padding:20px;">Belum ada aktivitas</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const waktu = new Date(l.created_at).toLocaleString('id-ID');
      const aksiMap = {
        'daftar': '&#x1F195; Daftar',
        'login': '&#x1F511; Login',
        'logout': '&#x1F6AA; Logout',
        'kirim_permintaan_teman': '&#x1F91D; Kirim permintaan',
        'terima_teman': '&#x2705; Terima teman',
        'tolak_teman': '&#x274C; Tolak permintaan',
        'hapus_teman': '&#x1F6AB; Hapus teman',
        'hapus_chat': '&#x1F5D1; Hapus chat',
      };
      const aksiLabel = aksiMap[l.aksi] || l.aksi;
      return `
        <tr>
          <td style="white-space:nowrap;color:var(--teks-muda)">${waktu}</td>
          <td>${aksiLabel}</td>
          <td style="color:var(--teks-muda)">${l.detail || '-'}</td>
        </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--merah);">Gagal memuat</td></tr>';
  }
}

async function lihatLokasiAdmin(userID) {
  gantiMenu('peta', document.querySelectorAll('.admin-menu-item')[2]);
  setTimeout(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userID}/location`, {
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
      const loc = await res.json();

      if (loc.latitude && loc.longitude && petaAdmin) {
        petaAdmin.setView([loc.latitude, loc.longitude], 16, { animate: true });
        if (markersAdmin[userID]) {
          markersAdmin[userID].openPopup();
        }
      } else {
        alert('Pengguna belum membagikan lokasi');
      }
    } catch {}
  }, 500);
}

function inisialisasiPetaAdmin() {
  if (petaAdmin) {
    setTimeout(() => petaAdmin.invalidateSize(), 100);
    muatSemuaLokasi();
    return;
  }

  petaAdmin = L.map('peta-admin').setView([-6.2, 106.8], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(petaAdmin);

  setTimeout(muatSemuaLokasi, 300);
}

async function muatSemuaLokasi() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const users = await res.json();

    users.forEach(u => {
      if (u.latitude && u.longitude) {
        const warna = u.is_online ? '#22c55e' : '#ef4444';
        const inisial = u.nama.charAt(0).toUpperCase();
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:${warna};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${inisial}</div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        if (markersAdmin[u.id]) {
          petaAdmin.removeLayer(markersAdmin[u.id]);
        }

        markersAdmin[u.id] = L.marker([u.latitude, u.longitude], { icon })
          .addTo(petaAdmin)
          .bindPopup(`<strong>${u.nama}</strong><br>ID: #${u.id}<br>Status: ${u.is_online ? 'Online' : 'Offline'}<br>Teman: ${u.friend_count}`)
          .on('click', () => markersAdmin[u.id].openPopup());
      }
    });
  } catch {}
}

// ---- EDITOR FILE ----
const DAFTAR_FILE = [
  'static/index.html',
  'static/login.html',
  'static/register.html',
  'static/app.html',
  'static/css/style.css',
  'static/js/app.js',
  'static/js/enkripsi.js',
  'static/js/peta.js',
  'static/js/admin.js',
  'static/admin/dashboard.html',
  'main.go',
];

function muatPohonFile() {
  const tree = document.getElementById('pohon-file');
  tree.innerHTML = `<div style="font-size:12px;color:var(--teks-muda);padding:4px 10px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">File</div>`;

  DAFTAR_FILE.forEach(f => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `&#x1F4C4; ${f}`;
    el.onclick = () => bukaFile(f, el);
    tree.appendChild(el);
  });
}

async function bukaFile(path, el) {
  document.querySelectorAll('.file-item').forEach(f => f.classList.remove('aktif'));
  el.classList.add('aktif');
  fileAktif = path;
  document.getElementById('nama-file-aktif').textContent = path;

  try {
    const res = await fetch(`/api/admin/file?path=${encodeURIComponent(path)}`, {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!res.ok) throw new Error('Tidak bisa membuka file');
    const teks = await res.text();
    document.getElementById('area-editor').value = teks;
    document.getElementById('tombol-simpan').disabled = false;
    document.getElementById('status-editor').textContent = `File dibuka: ${path}`;
    cekSintaks();
  } catch (err) {
    document.getElementById('status-editor').textContent = '⚠️ ' + err.message;
  }
}

async function simpanFile() {
  if (!fileAktif) return;
  const konten = document.getElementById('area-editor').value;

  // Cek sintaks dulu
  const ada_error = cekSintaks();
  if (ada_error) {
    if (!confirm('Ada kemungkinan error. Tetap simpan?')) return;
  }

  try {
    const res = await fetch(`/api/admin/file?path=${encodeURIComponent(fileAktif)}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + adminToken,
        'Content-Type': 'text/plain'
      },
      body: konten
    });
    if (!res.ok) throw new Error('Gagal menyimpan');
    document.getElementById('status-editor').textContent = '✅ Tersimpan: ' + fileAktif;
  } catch (err) {
    document.getElementById('status-editor').textContent = '❌ ' + err.message;
  }
}

function cekSintaks() {
  if (!fileAktif) return false;
  const kode = document.getElementById('area-editor').value;
  const statusEl = document.getElementById('status-sintaks');
  let ada_error = false;

  if (fileAktif.endsWith('.html') || fileAktif.endsWith('.js') || fileAktif.endsWith('.css')) {
    // Cek tanda kurung tidak seimbang (sederhana)
    const buka = (kode.match(/\{/g) || []).length;
    const tutup = (kode.match(/\}/g) || []).length;
    if (buka !== tutup) {
      statusEl.textContent = `⚠️ Kurung kurawal tidak seimbang ({: ${buka}, }: ${tutup})`;
      statusEl.style.color = 'var(--kuning)';
      ada_error = true;
    } else {
      statusEl.textContent = '✅ Tidak ada error terdeteksi';
      statusEl.style.color = 'var(--hijau)';
    }
  }

  return ada_error;
}

// ---- DATABASE ----
async function eksekusiSQL() {
  const query = document.getElementById('query-sql').value.trim();
  const hasilEl = document.getElementById('hasil-sql');

  if (!query) return;

  // Hanya izinkan SELECT
  if (!query.toLowerCase().startsWith('select')) {
    hasilEl.style.display = 'block';
    hasilEl.textContent = '⛔ Hanya query SELECT yang diizinkan dari panel ini untuk keamanan.';
    hasilEl.style.color = 'var(--merah)';
    return;
  }

  hasilEl.style.display = 'block';
  hasilEl.textContent = 'Menjalankan...';
  hasilEl.style.color = 'var(--teks)';

  try {
    const res = await fetch('/api/admin/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    hasilEl.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    hasilEl.textContent = '❌ ' + err.message;
    hasilEl.style.color = 'var(--merah)';
  }
}

function logoutAdmin() {
  localStorage.removeItem('gl_admin_token');
  window.location.href = '/login.html';
}

function escHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
