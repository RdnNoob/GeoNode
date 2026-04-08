/**
 * admin.js - Dashboard Admin GeoNode v5
 * Upgraded with friendship management, health monitoring, cleanup tools
 */

let adminToken = null;
let petaAdmin = null;
let markersAdmin = {};
let fileAktif = null;
let semuaPengguna = [];
let autoRefreshTimer = null;

adminToken = localStorage.getItem('gl_admin_token');
if (!adminToken) window.location.href = '/admin/login.html';

// Jam live di navbar
setInterval(() => {
  const el = document.getElementById('waktu-live');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

// Responsive sidebar
function toggleSidebar() {
  const sb = document.getElementById('admin-sidebar');
  sb.classList.toggle('open');
}

function checkMobile() {
  const btn = document.getElementById('toggle-sidebar');
  if (btn) btn.style.display = window.innerWidth <= 768 ? 'inline-flex' : 'none';
}
window.addEventListener('resize', checkMobile);
checkMobile();

// Initial load
fetch('/api/admin/stats?_t=' + Date.now(), {
  headers: { 'Authorization': 'Bearer ' + adminToken }
}).then(r => {
  if (!r.ok) {
    localStorage.removeItem('gl_admin_token');
    window.location.href = '/admin/login.html';
    return null;
  }
  return r.json();
}).then(data => {
  if (data) muatStatistik(data);
  cekMaintenanceMode();
  cekKesehatan();
}).catch(() => { window.location.href = '/admin/login.html'; });

// Auto refresh stats every 30s
autoRefreshTimer = setInterval(() => {
  const tabStat = document.getElementById('tab-statistik');
  if (tabStat && tabStat.classList.contains('aktif')) muatStatistik();
}, 30000);

function gantiMenu(menu, el) {
  document.querySelectorAll('.admin-menu-item').forEach(m => m.classList.remove('aktif'));
  el.classList.add('aktif');
  document.querySelectorAll('.tab-konten').forEach(t => t.classList.remove('aktif'));

  const tabMap = {
    'statistik': 'tab-statistik',
    'pengguna': 'tab-pengguna',
    'pertemanan': 'tab-pertemanan',
    'peta': 'tab-peta',
    'editor': 'tab-editor',
    'database': 'tab-database',
    'log': 'tab-log',
    'kontrol': 'tab-kontrol',
  };

  const tabID = tabMap[menu];
  if (tabID) document.getElementById(tabID)?.classList.add('aktif');

  if (menu === 'statistik') muatStatistik();
  if (menu === 'pengguna') muatPengguna();
  if (menu === 'pertemanan') muatPertemanan();
  if (menu === 'peta') inisialisasiPetaAdmin();
  if (menu === 'editor') muatPohonFile();
  if (menu === 'kontrol') { cekMaintenanceMode(); cekKesehatan(); }

  if (window.innerWidth <= 768) {
    document.getElementById('admin-sidebar').classList.remove('open');
  }
}

async function muatStatistik(stats) {
  if (!stats) {
    try {
      const res = await fetch('/api/admin/stats?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + adminToken } });
      if (!res.ok) throw new Error('Gagal');
      stats = await res.json();
    } catch { return; }
  }
  document.getElementById('stat-total').textContent = formatAngka(stats.total_pengguna ?? 0);
  document.getElementById('stat-online').textContent = formatAngka(stats.pengguna_online ?? 0);
  document.getElementById('stat-teman').textContent = formatAngka(stats.total_pertemanan ?? 0);
  document.getElementById('stat-pesan').textContent = formatAngka(stats.total_pesan ?? 0);
  document.getElementById('stat-daftar').textContent = formatAngka(stats.pendaftaran_hari_ini ?? 0);
  document.getElementById('waktu-refresh').textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');

  const recentEl = document.getElementById('recent-users');
  if (recentEl && stats.recent_users && stats.recent_users.length) {
    recentEl.innerHTML = stats.recent_users.map(u => `
      <li>
        <span style="display:flex;align-items:center;gap:6px;">
          <span class="online-dot" style="background:${u.is_online ? '#22c55e' : '#ef4444'};"></span>
          <strong>${escHTML(u.nama)}</strong>
          <span style="color:#475569;font-size:11px;">${u.kode || '#' + u.id}</span>
        </span>
        <span class="last-seen">${formatWaktu(u.created_at)}</span>
      </li>`).join('');
  }

  const logEl = document.getElementById('recent-logs');
  if (logEl && stats.recent_logs && stats.recent_logs.length) {
    const aksiMap = {
      'daftar': 'Daftar', 'masuk': 'Login', 'login': 'Login',
      'logout': 'Logout', 'kirim_permintaan_teman': 'Kirim permintaan',
      'terima_teman': 'Terima teman', 'tolak_teman': 'Tolak permintaan',
      'hapus_teman': 'Hapus teman', 'reset_password_admin': 'Reset PW',
    };
    const iconMap = {
      'daftar': '#22c55e', 'masuk': '#3b82f6', 'login': '#3b82f6',
      'logout': '#64748b', 'kirim_permintaan_teman': '#8b5cf6',
      'terima_teman': '#22c55e', 'tolak_teman': '#ef4444',
      'hapus_teman': '#ef4444', 'reset_password_admin': '#f59e0b',
    };
    logEl.innerHTML = stats.recent_logs.slice(0, 10).map(l => `
      <li>
        <span style="display:flex;align-items:center;gap:6px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${iconMap[l.aksi] || '#475569'};flex-shrink:0;"></span>
          <span style="color:${iconMap[l.aksi] || '#94a3b8'};font-weight:600;">${aksiMap[l.aksi] || l.aksi}</span>
          <span style="color:#475569;font-size:11px;">${escHTML(l.nama || '-')}</span>
        </span>
        <span class="last-seen">${formatWaktu(l.created_at)}</span>
      </li>`).join('');
  }
}

function formatAngka(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatWaktu(tgl) {
  if (!tgl) return '-';
  const d = new Date(tgl);
  const now = new Date();
  const selisih = now - d;
  if (selisih < 60000) return 'Baru saja';
  if (selisih < 3600000) return Math.floor(selisih / 60000) + ' mnt lalu';
  if (selisih < 86400000) return Math.floor(selisih / 3600000) + ' jam lalu';
  return d.toLocaleDateString('id-ID');
}

function formatLastSeen(tgl) {
  if (!tgl) return '-';
  const d = new Date(tgl);
  return d.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---- KESEHATAN SISTEM ----
async function cekKesehatan() {
  try {
    const res = await fetch('/api/admin/stats?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + adminToken } });
    const dots = document.querySelectorAll('#health-grid .health-dot');
    if (res.ok) {
      if (dots[0]) dots[0].className = 'health-dot ok';
      if (dots[1]) dots[1].className = 'health-dot ok';
      const data = await res.json();
      const sesiEl = document.getElementById('health-sesi');
      if (sesiEl) sesiEl.textContent = (data.pengguna_online || 0) + ' online aktif';
      dots[0].parentElement.querySelector('div:last-child div:last-child').textContent = 'Terhubung';
      dots[1].parentElement.querySelector('div:last-child div:last-child').textContent = 'Berjalan normal';
    } else {
      if (dots[0]) dots[0].className = 'health-dot error';
    }
  } catch {
    const dots = document.querySelectorAll('#health-grid .health-dot');
    if (dots[0]) dots[0].className = 'health-dot error';
    if (dots[1]) dots[1].className = 'health-dot error';
  }
}

// ---- PENGGUNA ----
async function muatPengguna() {
  const tbody = document.getElementById('tabel-pengguna');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#475569;padding:30px;">Memuat data pengguna...</td></tr>';
  semuaPengguna = [];

  try {
    const res = await fetch('/api/admin/users?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + adminToken } });
    const users = await res.json();
    semuaPengguna = users;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#475569;padding:30px;">Belum ada pengguna</td></tr>';
      return;
    }

    renderTabelPengguna(users);

    const cari = document.getElementById('cari-pengguna');
    if (cari && cari.value) filterPengguna(cari.value);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ef4444;">${err.message}</td></tr>`;
  }
}

function filterPengguna(q) {
  if (!semuaPengguna.length) return;
  const kata = q.toLowerCase().trim();
  if (!kata) { renderTabelPengguna(semuaPengguna); return; }
  const hasil = semuaPengguna.filter(u =>
    (u.nama || '').toLowerCase().includes(kata) ||
    (u.email || '').toLowerCase().includes(kata) ||
    (u.no_telepon || '').includes(kata) ||
    (u.kode || '').toLowerCase().includes(kata)
  );
  renderTabelPengguna(hasil);
}

function renderTabelPengguna(users) {
  const tbody = document.getElementById('tabel-pengguna');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#475569;padding:30px;">Tidak ditemukan</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const status = u.is_online
      ? '<span class="badge badge-hijau">Online</span>'
      : '<span class="badge badge-abu">Offline</span>';
    const tgl = new Date(u.created_at).toLocaleDateString('id-ID');
    const lastSeen = formatLastSeen(u.last_seen);

    let hashDisplay = '<span style="color:#475569;font-size:11px;">Belum tersimpan</span>';
    if (u.password_asli) {
      hashDisplay = `
        <div class="pw-wrap">
          <div style="display:flex;align-items:center;gap:4px;">
            <span id="pw-${u.id}" style="font-family:monospace;font-size:12px;letter-spacing:2px;">••••••••</span>
            <button class="salin-btn" onclick="togglePassword(${u.id}, '${escHTML(u.password_asli)}')" title="Tampilkan">&#x1F441;</button>
          </div>
          <button class="salin-btn" style="margin-top:2px;" onclick="salinTeks('${escHTML(u.password_asli)}', this)">Salin</button>
        </div>`;
    }

    return `
      <tr>
        <td><span style="font-family:monospace;font-size:12px;color:#22c55e;">${u.kode || '#' + u.id}</span></td>
        <td><strong>${escHTML(u.nama)}</strong></td>
        <td style="color:#94a3b8;font-size:12px;">${escHTML(u.email)}</td>
        <td style="color:#94a3b8;font-size:12px;">${u.no_telepon || '-'}</td>
        <td>${status}</td>
        <td style="text-align:center;">${u.friend_count}</td>
        <td style="font-size:12px;color:#64748b;">${tgl}</td>
        <td style="font-size:12px;color:#64748b;">${lastSeen}</td>
        <td>${hashDisplay}</td>
        <td>
          <div class="aksi-grid">
            <button class="btn btn-outline" onclick="resetPassword(${u.id}, '${escHTML(u.nama)}')">&#x1F511;</button>
            <button class="btn btn-outline" onclick="lihatLog(${u.id}, '${escHTML(u.nama)}')">&#x1F4CB;</button>
            <button class="btn btn-outline" onclick="lihatLokasiAdmin(${u.id})">&#x1F4CD;</button>
            <button class="btn btn-merah" onclick="hapusPengguna(${u.id}, '${escHTML(u.nama)}')">&#x1F5D1;</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function salinTeks(teks, el) {
  navigator.clipboard.writeText(teks).then(() => {
    const orig = el.textContent;
    el.textContent = 'Disalin!';
    setTimeout(() => { el.textContent = orig; }, 1500);
  }).catch(() => { prompt('Salin manual:', teks); });
}

function togglePassword(userID, pw) {
  const el = document.getElementById('pw-' + userID);
  if (!el) return;
  if (el.textContent === '••••••••') {
    el.textContent = pw;
    el.style.color = '#22c55e';
    el.style.letterSpacing = 'normal';
  } else {
    el.textContent = '••••••••';
    el.style.color = '';
    el.style.letterSpacing = '2px';
  }
}

async function resetPassword(userID, nama) {
  const newPass = prompt(`Reset password ${nama}?\nKosongkan untuk password acak, atau isi password baru (min. 6 karakter):`);
  if (newPass === null) return;

  try {
    const res = await fetch(`/api/admin/users/${userID}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ new_password: newPass || undefined })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal');
    alert(`Password berhasil direset!\n\nPassword baru: ${data.new_password}\n\nUser harus login ulang.`);
    muatPengguna();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function hapusPengguna(userID, nama) {
  if (!confirm(`Hapus pengguna "${nama}"?\n\nSemua data akan hilang permanen.`)) return;
  if (!confirm(`Konfirmasi ulang: Hapus "${nama}" secara permanen?`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userID}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal');
    alert('Pengguna dihapus');
    muatPengguna();
  } catch (err) { alert('Gagal: ' + err.message); }
}

// ---- PERTEMANAN (BARU) ----
async function muatPertemanan() {
  try {
    const res = await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "SELECT f.id, f.from_user_id, f.to_user_id, f.status, f.created_at, u1.nama AS dari_nama, u2.nama AS ke_nama FROM friends f JOIN users u1 ON f.from_user_id = u1.id JOIN users u2 ON f.to_user_id = u2.id ORDER BY f.created_at DESC LIMIT 100" })
    });
    const data = await res.json();

    if (!Array.isArray(data)) { return; }

    const accepted = data.filter(f => f.status === 'accepted').length;
    const pending = data.filter(f => f.status === 'pending').length;
    const rejected = data.filter(f => f.status === 'rejected').length;

    document.getElementById('fr-accepted').textContent = accepted;
    document.getElementById('fr-pending').textContent = pending;
    document.getElementById('fr-rejected').textContent = rejected;

    const pendingList = data.filter(f => f.status === 'pending');
    const pendingEl = document.getElementById('daftar-pending');
    if (pendingList.length === 0) {
      pendingEl.innerHTML = '<div style="color:#475569;font-size:13px;padding:10px 0;">Tidak ada permintaan tertunda</div>';
    } else {
      pendingEl.innerHTML = '<div class="pertemanan-grid">' + pendingList.map(f => `
        <div class="pertemanan-kartu">
          <div class="avatar" style="background:#8b5cf6;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">${(f.dari_nama||'?').charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;">${escHTML(f.dari_nama)} &#x2192; ${escHTML(f.ke_nama)}</div>
            <div style="font-size:11px;color:#475569;">${formatWaktu(f.created_at)} &bull; ID #${f.id}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-hijau" style="font-size:11px;padding:4px 10px;" onclick="adminAksiTeman(${f.id}, 'accepted')">Terima</button>
            <button class="btn btn-merah" style="font-size:11px;padding:4px 10px;" onclick="adminAksiTeman(${f.id}, 'rejected')">Tolak</button>
          </div>
        </div>`).join('') + '</div>';
    }

    const tbody = document.getElementById('tbody-pertemanan');
    tbody.innerHTML = data.map(f => {
      const statusBadge = f.status === 'accepted' ? '<span class="badge badge-hijau">Berteman</span>'
        : f.status === 'pending' ? '<span class="badge badge-kuning">Pending</span>'
        : '<span class="badge badge-merah">Ditolak</span>';
      return `
        <tr>
          <td>#${f.id}</td>
          <td>${escHTML(f.dari_nama)} <span style="color:#475569;font-size:11px;">(#${f.from_user_id})</span></td>
          <td>${escHTML(f.ke_nama)} <span style="color:#475569;font-size:11px;">(#${f.to_user_id})</span></td>
          <td>${statusBadge}</td>
          <td style="font-size:12px;color:#64748b;">${new Date(f.created_at).toLocaleString('id-ID')}</td>
          <td>
            <div class="aksi-grid">
              ${f.status === 'pending' ? `
                <button class="btn btn-hijau" style="font-size:11px;padding:3px 8px;" onclick="adminAksiTeman(${f.id}, 'accepted')">Terima</button>
                <button class="btn btn-merah" style="font-size:11px;padding:3px 8px;" onclick="adminAksiTeman(${f.id}, 'rejected')">Tolak</button>
              ` : ''}
              <button class="btn btn-outline" style="font-size:11px;padding:3px 8px;" onclick="adminHapusTeman(${f.id})">Hapus</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    document.getElementById('tbody-pertemanan').innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ef4444;">${err.message}</td></tr>`;
  }
}

async function adminAksiTeman(friendID, status) {
  const aksi = status === 'accepted' ? 'menerima' : 'menolak';
  if (!confirm(`Yakin ingin ${aksi} permintaan pertemanan #${friendID}?`)) return;
  try {
    await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `UPDATE friends SET status = '${status}' WHERE id = ${friendID}` })
    });
    alert(`Permintaan berhasil di${aksi === 'menerima' ? 'terima' : 'tolak'}!`);
    muatPertemanan();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function adminHapusTeman(friendID) {
  if (!confirm(`Hapus record pertemanan #${friendID}?`)) return;
  try {
    await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `DELETE FROM friends WHERE id = ${friendID}` })
    });
    alert('Record pertemanan dihapus');
    muatPertemanan();
  } catch (err) { alert('Gagal: ' + err.message); }
}

// ---- MAINTENANCE MODE & KONTROL ----
async function cekMaintenanceMode() {
  try {
    const res = await fetch('/api/admin/maintenance?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + adminToken } });
    const data = await res.json();
    const toggle = document.getElementById('toggle-maintenance');
    const statusEl = document.getElementById('status-maintenance');
    if (toggle) toggle.checked = data.maintenance;
    if (statusEl) {
      statusEl.textContent = data.maintenance
        ? 'MAINTENANCE AKTIF - Client dialihkan'
        : 'Aplikasi berjalan normal';
      statusEl.style.color = data.maintenance ? '#ef4444' : '#22c55e';
      statusEl.style.fontWeight = '600';
    }
  } catch {}
}

async function toggleMaintenance() {
  const toggle = document.getElementById('toggle-maintenance');
  const isOn = toggle.checked;

  if (isOn && !confirm('Aktifkan maintenance mode?\nSemua client akan otomatis logout!')) {
    toggle.checked = false;
    return;
  }

  try {
    const res = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ maintenance: isOn })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal');

    const statusEl = document.getElementById('status-maintenance');
    if (statusEl) {
      statusEl.textContent = data.maintenance ? 'MAINTENANCE AKTIF - Client dialihkan' : 'Aplikasi berjalan normal';
      statusEl.style.color = data.maintenance ? '#ef4444' : '#22c55e';
    }
    alert(data.message);
  } catch (err) {
    alert('Gagal: ' + err.message);
    toggle.checked = !isOn;
  }
}

async function forceLogoutSemua() {
  if (!confirm('Force logout SEMUA client sekarang?')) return;
  try {
    const res = await fetch('/api/admin/force-logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal');
    alert(data.message);
  } catch (err) { alert('Gagal: ' + err.message); }
}

// ---- CLEANUP TOOLS (BARU) ----
async function bersihkanLogLama() {
  if (!confirm('Hapus semua log aktivitas yang lebih dari 30 hari?')) return;
  try {
    await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)" })
    });
    alert('Log lama berhasil dihapus');
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function bersihkanSesiExpired() {
  if (!confirm('Hapus semua sesi yang sudah expired?')) return;
  try {
    await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "DELETE FROM sessions WHERE expires_at < NOW()" })
    });
    alert('Sesi expired berhasil dihapus');
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function bersihkanPesanLama() {
  if (!confirm('Hapus semua pesan yang lebih dari 30 hari?\nTindakan ini tidak bisa dibatalkan!')) return;
  try {
    await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "DELETE FROM messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)" })
    });
    alert('Pesan lama berhasil dihapus');
  } catch (err) { alert('Gagal: ' + err.message); }
}

// ---- LOG AKTIVITAS ----
async function lihatLog(userID, nama) {
  const menuItems = document.querySelectorAll('.admin-menu-item');
  menuItems.forEach(m => m.classList.remove('aktif'));
  document.querySelectorAll('.tab-konten').forEach(t => t.classList.remove('aktif'));
  document.getElementById('tab-log').classList.add('aktif');
  document.getElementById('log-nama-pengguna').innerHTML = `Aktivitas: <strong>${nama}</strong> <span style="color:#475569;font-size:12px;">(ID: #${userID})</span>`;

  const tbody = document.getElementById('tabel-log');
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#475569;">Memuat...</td></tr>';

  try {
    const res = await fetch(`/api/admin/users/${userID}/activity?_t=` + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const logs = await res.json();
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#475569;padding:20px;">Belum ada aktivitas</td></tr>';
      return;
    }
    const aksiMap = {
      'daftar': 'Daftar', 'masuk': 'Login', 'login': 'Login',
      'logout': 'Logout', 'kirim_permintaan_teman': 'Kirim permintaan',
      'terima_teman': 'Terima teman', 'tolak_teman': 'Tolak permintaan',
      'hapus_teman': 'Hapus teman', 'hapus_chat': 'Hapus chat',
      'reset_password_admin': 'Reset password oleh admin',
    };
    tbody.innerHTML = logs.map(l => {
      const waktu = new Date(l.created_at).toLocaleString('id-ID');
      return `
        <tr>
          <td style="white-space:nowrap;color:#475569;font-size:12px;">${waktu}</td>
          <td>${aksiMap[l.aksi] || l.aksi}</td>
          <td style="color:#475569;font-size:12px;">${l.detail || '-'}</td>
        </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#ef4444;">Gagal memuat</td></tr>';
  }
}

// ---- PETA ADMIN ----
async function lihatLokasiAdmin(userID) {
  const menuItems = document.querySelectorAll('.admin-menu-item');
  const petaMenu = [...menuItems].find(m => m.textContent.includes('Peta'));
  if (petaMenu) {
    menuItems.forEach(m => m.classList.remove('aktif'));
    petaMenu.classList.add('aktif');
  }
  document.querySelectorAll('.tab-konten').forEach(t => t.classList.remove('aktif'));
  document.getElementById('tab-peta').classList.add('aktif');
  inisialisasiPetaAdmin();

  setTimeout(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userID}/location?_t=` + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
      if (!res.ok) throw new Error('Tidak ada data lokasi');
      const loc = await res.json();
      if (loc.latitude && loc.longitude && petaAdmin) {
        petaAdmin.setView([loc.latitude, loc.longitude], 16, { animate: true });
        if (markersAdmin[userID]) markersAdmin[userID].openPopup();
      } else {
        alert('Pengguna belum membagikan lokasi');
      }
    } catch { alert('Pengguna belum membagikan lokasi'); }
  }, 500);
}

function inisialisasiPetaAdmin() {
  if (petaAdmin) {
    setTimeout(() => petaAdmin.invalidateSize(), 100);
    muatSemuaLokasi();
    return;
  }
  petaAdmin = L.map('peta-admin').setView([-6.2, 106.8], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd'
  }).addTo(petaAdmin);
  setTimeout(muatSemuaLokasi, 300);
}

async function muatSemuaLokasi() {
  try {
    const res = await fetch('/api/admin/users?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + adminToken } });
    const users = await res.json();
    let ada = 0;
    users.forEach(u => {
      if (u.latitude && u.longitude) {
        ada++;
        const warna = u.is_online ? '#22c55e' : '#ef4444';
        const inisial = u.nama.charAt(0).toUpperCase();
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:${warna};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;border:3px solid rgba(255,255,255,0.3);box-shadow:0 2px 12px rgba(0,0,0,0.5);">${inisial}</div>`,
          className: '', iconSize: [36, 36], iconAnchor: [18, 18]
        });
        if (markersAdmin[u.id]) petaAdmin.removeLayer(markersAdmin[u.id]);
        markersAdmin[u.id] = L.marker([u.latitude, u.longitude], { icon })
          .addTo(petaAdmin)
          .bindPopup(`<div style="font-size:13px;"><strong>${u.nama}</strong><br>${u.kode || '#' + u.id}<br>${u.is_online ? '<span style="color:#22c55e;">Online</span>' : '<span style="color:#ef4444;">Offline</span>'}<br>Teman: ${u.friend_count}</div>`)
          .on('click', () => markersAdmin[u.id].openPopup());
      }
    });
    const el = document.getElementById('jumlah-marker');
    if (el) el.textContent = `${ada} pengguna dengan lokasi aktif`;
  } catch {}
}

// ---- EDITOR FILE ----
const DAFTAR_FILE = [
  'index.html', 'login.html', 'register.html', 'app.html', 'maintenance.html',
  'admin/dashboard.html', 'admin/login.html',
  'css/style.css', 'js/app.js', 'js/enkripsi.js', 'js/peta.js', 'js/admin.js',
  'api/config.php', 'api/auth/login.php', 'api/auth/register.php',
  'api/chat/messages.php', 'api/ws/index.php', 'api/location/friends.php',
  'api/friends/index.php',
  'api/groups/index.php', 'api/groups/members.php', 'api/groups/messages.php',
  'api/admin/maintenance.php', 'api/admin/users.php', 'api/admin/stats.php',
];

function muatPohonFile() {
  const tree = document.getElementById('pohon-file');
  tree.innerHTML = '<div style="font-size:11px;color:#64748b;padding:8px 14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">File</div>';
  DAFTAR_FILE.forEach(f => {
    const el = document.createElement('div');
    el.className = 'file-item';
    const ext = f.split('.').pop();
    const iconMap = { php: '&#x1F4E6;', js: '&#x26A1;', html: '&#x1F310;', css: '&#x1F3A8;' };
    el.innerHTML = `${iconMap[ext] || '&#x1F4C4;'} ${f}`;
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
    const res = await fetch(`/api/admin/file?path=${encodeURIComponent(path)}&_t=${Date.now()}`, {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!res.ok) throw new Error('Tidak bisa membuka file');
    const teks = await res.text();
    document.getElementById('area-editor').value = teks;
    document.getElementById('tombol-simpan').disabled = false;
    document.getElementById('status-editor').textContent = `File dibuka: ${path}`;
    cekSintaks();
  } catch (err) {
    document.getElementById('status-editor').textContent = 'Gagal: ' + err.message;
  }
}

async function simpanFile() {
  if (!fileAktif) return;
  const konten = document.getElementById('area-editor').value;
  const ada_error = cekSintaks();
  if (ada_error && !confirm('Ada kemungkinan error. Tetap simpan?')) return;
  try {
    const res = await fetch(`/api/admin/file?path=${encodeURIComponent(fileAktif)}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'text/plain' },
      body: konten
    });
    if (!res.ok) throw new Error('Gagal menyimpan');
    document.getElementById('status-editor').textContent = 'Tersimpan: ' + fileAktif;
  } catch (err) {
    document.getElementById('status-editor').textContent = 'Gagal: ' + err.message;
  }
}

function cekSintaks() {
  if (!fileAktif) return false;
  const kode = document.getElementById('area-editor').value;
  const statusEl = document.getElementById('status-sintaks');
  let ada_error = false;
  if (fileAktif.endsWith('.html') || fileAktif.endsWith('.js') || fileAktif.endsWith('.css')) {
    const buka = (kode.match(/\{/g) || []).length;
    const tutup = (kode.match(/\}/g) || []).length;
    if (buka !== tutup) {
      statusEl.textContent = `Kurung tidak seimbang ({: ${buka}, }: ${tutup})`;
      statusEl.style.color = '#f59e0b';
      ada_error = true;
    } else {
      statusEl.textContent = 'OK';
      statusEl.style.color = '#22c55e';
    }
  }
  return ada_error;
}

// ---- DATABASE ----
async function eksekusiSQL() {
  const query = document.getElementById('query-sql').value.trim();
  const hasilEl = document.getElementById('hasil-sql');
  if (!query) return;
  hasilEl.style.display = 'block';
  hasilEl.textContent = 'Menjalankan...';
  hasilEl.style.color = '#e2e8f0';
  try {
    const res = await fetch('/api/admin/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      if (!data.length) {
        hasilEl.textContent = '(Tidak ada hasil)';
      } else {
        const keys = Object.keys(data[0]);
        const header = keys.join(' | ');
        const separator = keys.map(k => '-'.repeat(Math.max(k.length, 10))).join('-|-');
        const rows = data.map(row => keys.map(k => String(row[k] ?? '')).join(' | ')).join('\n');
        hasilEl.textContent = header + '\n' + separator + '\n' + rows + `\n\n(${data.length} baris)`;
      }
    } else {
      hasilEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    hasilEl.textContent = 'Error: ' + err.message;
    hasilEl.style.color = '#ef4444';
  }
}

function logoutAdmin() {
  localStorage.removeItem('gl_admin_token');
  window.location.href = '/admin/login.html';
}

function escHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
