/**
 * app.js - Logika Utama Aplikasi GeoLocate
 */

let token = null;
let pengguna = null;
let ws = null;
let daftarTeman = [];
let temanAktif = null;
let intervalLokasi = null;

// --- INISIALISASI ---
async function init() {
  token = localStorage.getItem('gl_token');
  const userData = localStorage.getItem('gl_user');

  if (!token || !userData) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Sesi berakhir');
    pengguna = await res.json();
    localStorage.setItem('gl_user', JSON.stringify(pengguna));
  } catch {
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  // Tampilkan info pengguna
  document.getElementById('nama-pengguna').textContent = pengguna.nama;
  const badge = document.getElementById('user-id-badge');
  badge.textContent = '#' + pengguna.id;
  badge.onclick = salinID;

  // Inisialisasi enkripsi E2E
  const kunciPublik = await Enkripsi.inisialisasi(pengguna.id);

  // Upload kunci publik ke server
  await fetch('/api/keys/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ public_key: kunciPublik })
  });

  // Inisialisasi peta
  inisialisasiPeta();

  // Hubungkan WebSocket
  hubungkanWS();

  // Muat data
  await muatTeman();
  await muatPermintaan();

  // Mulai lacak GPS
  mulaiGPS();

  // Isi profil
  isiProfil();

  // Refresh daftar teman setiap 30 detik
  setInterval(muatTeman, 30000);
  setInterval(muatPermintaan, 15000);
}

// --- WEBSOCKET ---
function hubungkanWS() {
  // WebSocket polling fallback untuk shared hosting CWP
  let lastTimestamp = new Date(Date.now() - 30000).toISOString().slice(0,19).replace('T',' ');
  
  function pollEvents() {
    const friendIDParam = temanAktif ? '&friend_id=' + temanAktif.id : '';
    fetch('/api/ws/?since=' + encodeURIComponent(lastTimestamp) + friendIDParam, {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.events) {
        lastTimestamp = data.timestamp || lastTimestamp;
        data.events.forEach(msg => tanganiPesanWS(msg));
      }
    })
    .catch(() => {})
    .finally(() => {
      setTimeout(pollEvents, 5000);
    });
  }
  
  pollEvents();
  
  // Buat objek ws dummy agar kode lain tidak error
  ws = {
    readyState: 1,
    send: function(data) {}
  };
}

function tanganiPesanWS(msg) {
  switch (msg.type) {
    case 'location_update':
      const loc = msg.payload;
      perbarui_marker_teman(loc.user_id, loc.latitude, loc.longitude, loc.nama, loc.is_online);
      perbaruiStatusTeman(loc.user_id, true);
      break;

    case 'user_offline':
      perbaruiStatusTeman(msg.payload.user_id, false);
      tandaiOffline(msg.payload.user_id);
      break;

    case 'new_message':
      const payload = msg.payload;
      if (temanAktif && temanAktif.id == payload.from_user_id) {
        // Langsung tampilkan jika chat sedang terbuka
        tampilkanPesanBaru(payload);
      } else {
        // Notifikasi
        tandaiPesanBaru(payload.from_user_id);
      }
      break;
  }
}

// --- GPS ---
function mulaiGPS() {
  if (!navigator.geolocation) {
    document.getElementById('status-gps').textContent = 'GPS tidak didukung browser ini';
    return;
  }

  const opsi = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
  };

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;

      // Perbarui marker saya
      perbarui_marker_saya(lat, lon, pengguna.nama);

      // Kirim via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'location',
          payload: { latitude: lat, longitude: lon }
        }));
      }

      document.getElementById('status-gps').textContent =
        `Aktif: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    },
    (err) => {
      document.getElementById('status-gps').textContent = 'GPS: ' + err.message;
    },
    opsi
  );
}

// --- TEMAN ---
async function muatTeman() {
  try {
    const res = await fetch('/api/friends', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    daftarTeman = await res.json();
    renderDaftarTeman();
    renderDaftarChat();
    muatLokasiTeman();
  } catch {}
}

async function muatLokasiTeman() {
  try {
    const res = await fetch('/api/location/friends', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const lokasi = await res.json();
    lokasi.forEach(loc => {
      perbarui_marker_teman(loc.user_id, loc.latitude, loc.longitude, loc.nama, loc.is_online);
    });
  } catch {}
}

async function muatPermintaan() {
  try {
    const res = await fetch('/api/friends/requests', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const permintaan = await res.json();
    renderPermintaan(permintaan);

    const badge = document.getElementById('badge-perm');
    const chip = document.getElementById('chip-permintaan');
    if (permintaan.length > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = permintaan.length;
      if (chip) { chip.style.display = 'inline-flex'; chip.textContent = permintaan.length; }
    } else {
      badge.style.display = 'none';
      if (chip) chip.style.display = 'none';
    }
  } catch {}
}

function renderDaftarTeman() {
  const kontainer = document.getElementById('tab-daftar-teman');
  if (daftarTeman.length === 0) {
    kontainer.innerHTML = `
      <div class="halaman-kosong">
        <div class="halaman-kosong-ikon">&#x1F91D;</div>
        <div>Belum ada teman. Tambahkan dengan ID mereka!</div>
      </div>`;
    return;
  }

  kontainer.innerHTML = daftarTeman.map(f => {
    const t = f.friend;
    const warna = t.is_online ? '#111827' : '#ef4444';
    const statusTeks = t.is_online ? 'Online' : 'Offline';
    const inisial = t.nama.charAt(0).toUpperCase();
    return `
      <div class="teman-item" id="teman-item-${t.id}" onclick="bukaChat(${t.id}, '${escHTML(t.nama)}')">
        <div class="avatar" style="background:${warna};color:#fff;">
          ${inisial}
          <div class="status-titik ${t.is_online ? 'online' : 'offline'}"></div>
        </div>
        <div class="teman-info">
          <div class="teman-nama">${escHTML(t.nama)}</div>
          <div class="teman-status">${statusTeks} &bull; ID: #${t.id}</div>
        </div>
      </div>`;
  }).join('');
}

function renderDaftarChat() {
  const kontainer = document.getElementById('daftar-chat');
  if (daftarTeman.length === 0) {
    kontainer.innerHTML = `<div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F4AC;</div><div>Belum ada teman</div></div>`;
    return;
  }
  kontainer.innerHTML = daftarTeman.map(f => {
    const t = f.friend;
    const inisial = t.nama.charAt(0).toUpperCase();
    const warna = t.is_online ? '#111827' : '#ef4444';
    return `
      <div class="teman-item" onclick="bukaChat(${t.id}, '${escHTML(t.nama)}')">
        <div class="avatar" style="background:${warna};color:#fff;">${inisial}
          <div class="status-titik ${t.is_online ? 'online' : 'offline'}"></div>
        </div>
        <div class="teman-info">
          <div class="teman-nama">${escHTML(t.nama)}</div>
          <div class="teman-status" id="status-chat-${t.id}">${t.is_online ? 'Online' : 'Offline'}</div>
        </div>
        <span class="chip-notif" id="notif-chat-${t.id}" style="display:none;"></span>
      </div>`;
  }).join('');
}

function renderPermintaan(list) {
  const kontainer = document.getElementById('tab-permintaan-teman');
  if (list.length === 0) {
    kontainer.innerHTML = `<div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F4EC;</div><div>Tidak ada permintaan masuk</div></div>`;
    return;
  }

  kontainer.innerHTML = list.map(p => {
    const u = p.from_user;
    const inisial = u.nama.charAt(0).toUpperCase();
    return `
      <div class="teman-item" style="flex-wrap:wrap;gap:8px;">
        <div class="avatar" style="background:#374151;color:#fff;">${inisial}</div>
        <div class="teman-info">
          <div class="teman-nama">${escHTML(u.nama)}</div>
          <div class="teman-status">ID: #${u.id}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-hijau" style="padding:6px 12px;font-size:12px;" onclick="terima(${p.id})">Terima</button>
          <button class="btn btn-merah" style="padding:6px 12px;font-size:12px;" onclick="tolak(${p.id})">Tolak</button>
        </div>
      </div>`;
  }).join('');
}

function perbaruiStatusTeman(userID, isOnline) {
  const el = document.getElementById(`teman-item-${userID}`);
  if (el) {
    const dot = el.querySelector('.status-titik');
    if (dot) {
      dot.className = `status-titik ${isOnline ? 'online' : 'offline'}`;
    }
  }
}

function tandaiPesanBaru(fromID) {
  const chip = document.getElementById(`notif-chat-${fromID}`);
  if (chip) {
    chip.style.display = 'inline-flex';
    const count = parseInt(chip.textContent || 0) + 1;
    chip.textContent = count;
  }
}

// --- CHAT ---
async function bukaChat(friendID, nama) {
  temanAktif = { id: friendID, nama };
  gantitab('chat');

  // Tampilkan area chat
  const panelChat = document.getElementById('panel-chat');
  panelChat.style.display = 'flex';
  panelChat.style.flexDirection = 'column';

  panelChat.innerHTML = `
    <div class="chat-header">
      <div class="avatar" style="background:#111827;color:#fff;width:36px;height:36px;font-size:14px;">
        ${nama.charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-weight:700;font-size:15px;">${escHTML(nama)}</div>
        <div style="font-size:12px;color:var(--teks-muda);">ID: #${friendID}</div>
      </div>
      <button class="btn btn-outline" style="margin-left:auto;font-size:12px;padding:5px 10px;" onclick="hapusChat(${friendID})">&#x1F5D1; Hapus</button>
    </div>
    <div class="enkripsi-label">&#x1F512; Chat dienkripsi end-to-end &bull; Pesan dihapus setelah sesi</div>
    <div class="chat-pesan-wrapper" id="chat-pesan-${friendID}"></div>
    <div class="chat-input-wrapper">
      <textarea class="chat-input" id="chat-input-${friendID}" placeholder="Ketik pesan..." rows="1"
        onkeydown="handleChatKey(event, ${friendID})"></textarea>
      <button class="chat-kirim" onclick="kirimPesan(${friendID})">&#x27A4;</button>
    </div>`;

  // Bersihkan notif
  const chip = document.getElementById(`notif-chat-${friendID}`);
  if (chip) chip.style.display = 'none';

  await muatPesan(friendID);
}

async function muatPesan(friendID) {
  const wrapper = document.getElementById(`chat-pesan-${friendID}`);
  if (!wrapper) return;

  wrapper.innerHTML = `<div style="text-align:center;color:var(--teks-muda);font-size:14px;padding:20px;">Memuat...</div>`;

  try {
    const res = await fetch(`/api/chat/${friendID}/messages`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const pesan = await res.json();

    wrapper.innerHTML = '';
    for (const p of pesan) {
      await tampilkanPesan(p, friendID, wrapper);
    }
    wrapper.scrollTop = wrapper.scrollHeight;
  } catch {
    wrapper.innerHTML = `<div style="text-align:center;color:var(--merah);font-size:14px;padding:20px;">Gagal memuat pesan</div>`;
  }
}

async function tampilkanPesan(pesan, friendID, wrapper) {
  let teks = pesan.encrypted_content;

  // Coba dekripsi
  const kunci = await Enkripsi.kunciUntukTeman(friendID, token);
  if (kunci) {
    teks = await Enkripsi.dekripsi(pesan.encrypted_content, kunci);
  }

  const waktu = new Date(pesan.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `gelembung-wrapper ${pesan.is_mine ? 'milik-saya' : ''}`;
  div.innerHTML = `
    <div class="gelembung ${pesan.is_mine ? 'milik-saya' : 'teman'}">
      ${escHTML(teks)}
      <div class="gelembung-waktu">${waktu}</div>
    </div>`;
  wrapper.appendChild(div);
}

async function tampilkanPesanBaru(payload) {
  const friendID = payload.from_user_id || payload.to_user_id;
  const wrapper = document.getElementById(`chat-pesan-${friendID}`);
  if (!wrapper) return;

  const pesan = {
    id: payload.id || Date.now(),
    from_user_id: payload.from_user_id,
    to_user_id: payload.to_user_id,
    encrypted_content: payload.encrypted_content,
    created_at: payload.created_at || new Date().toISOString(),
    is_mine: payload.from_user_id === pengguna.id
  };

  await tampilkanPesan(pesan, friendID, wrapper);
  wrapper.scrollTop = wrapper.scrollHeight;
}

async function kirimPesan(friendID) {
  const input = document.getElementById(`chat-input-${friendID}`);
  if (!input) return;
  const teks = input.value.trim();
  if (!teks) return;

  input.value = '';

  let konten = teks;
  const kunci = await Enkripsi.kunciUntukTeman(friendID, token);
  if (kunci) {
    konten = await Enkripsi.enkripsi(teks, kunci);
  }

  try {
    const res = await fetch(`/api/chat/${friendID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ encrypted_content: konten })
    });

    const pesanBaru = await res.json();
    pesanBaru.is_mine = true;

    const wrapper = document.getElementById(`chat-pesan-${friendID}`);
    if (wrapper) {
      await tampilkanPesan(pesanBaru, friendID, wrapper);
      wrapper.scrollTop = wrapper.scrollHeight;
    }

    // Notifikasi ke penerima via WS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'chat',
        payload: {
          from_user_id: pengguna.id,
          to_user_id: friendID,
          encrypted_content: konten,
          created_at: new Date().toISOString()
        }
      }));
    }
  } catch {}
}

function handleChatKey(e, friendID) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    kirimPesan(friendID);
  }
}

async function hapusChat(friendID) {
  if (!confirm('Hapus semua pesan? Ini tidak bisa dibatalkan.')) return;
  await fetch(`/api/chat/${friendID}/messages`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const wrapper = document.getElementById(`chat-pesan-${friendID}`);
  if (wrapper) wrapper.innerHTML = '';
}

// --- PERMINTAAN TEMAN ---
function bukaModalTeman() {
  document.getElementById('overlay-teman').classList.add('tampil');
  document.getElementById('input-id-teman').focus();
}

function tutupModal() {
  document.getElementById('overlay-teman').classList.remove('tampil');
  document.getElementById('notif-teman').className = 'notifikasi';
  document.getElementById('input-id-teman').value = '';
}

async function kirimPermintaanTeman() {
  const targetID = parseInt(document.getElementById('input-id-teman').value);
  if (!targetID || targetID === pengguna.id) {
    tampilNotifTeman('Masukkan ID yang valid', 'error');
    return;
  }

  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ target_user_id: targetID })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    tampilNotifTeman('Permintaan pertemanan terkirim!', 'sukses');
    setTimeout(tutupModal, 1500);
  } catch (err) {
    tampilNotifTeman(err.message, 'error');
  }
}

function tampilNotifTeman(pesan, tipe) {
  const el = document.getElementById('notif-teman');
  el.textContent = pesan;
  el.className = `notifikasi ${tipe} tampil`;
}

async function terima(requestID) {
  await fetch(`/api/friends/requests/${requestID}/accept`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  await muatTeman();
  await muatPermintaan();
}

async function tolak(requestID) {
  await fetch(`/api/friends/requests/${requestID}/reject`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  await muatPermintaan();
}

// --- NAVIGASI ---
function gantitab(tab) {
  // Reset shortcut buttons
  document.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('aktif'));

  const tabs = ['peta', 'teman', 'chat', 'profil'];
  const idx = tabs.indexOf(tab);
  if (idx >= 0) document.querySelectorAll('.shortcut-btn')[idx].classList.add('aktif');

  const panelSamping = document.getElementById('panel-samping');
  const panelPeta = document.getElementById('panel-peta');
  const panelChat = document.getElementById('panel-chat');

  // Sembunyikan semua panel tab
  document.querySelectorAll('.panel-tab').forEach(el => el.style.display = 'none');

  panelChat.style.display = 'none';

  switch (tab) {
    case 'peta':
      panelSamping.style.display = 'none';
      panelPeta.style.display = 'block';
      if (peta) setTimeout(() => peta.invalidateSize(), 100);
      break;
    case 'teman':
      panelSamping.style.display = 'flex';
      panelPeta.style.display = 'block';
      document.getElementById('konten-teman').style.display = 'flex';
      if (peta) setTimeout(() => peta.invalidateSize(), 100);
      break;
    case 'chat':
      panelSamping.style.display = 'flex';
      panelPeta.style.display = 'none';
      document.getElementById('konten-chat-list').style.display = 'flex';
      panelChat.style.display = temanAktif ? 'flex' : 'none';
      break;
    case 'profil':
      panelSamping.style.display = 'flex';
      panelPeta.style.display = 'block';
      document.getElementById('konten-profil').style.display = 'block';
      if (peta) setTimeout(() => peta.invalidateSize(), 100);
      break;
  }
}

function gantiTabTeman(tab, el) {
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('aktif'));
  el.classList.add('aktif');

  document.getElementById('tab-daftar-teman').style.display = tab === 'daftar' ? 'block' : 'none';
  document.getElementById('tab-permintaan-teman').style.display = tab === 'permintaan' ? 'block' : 'none';
}

// --- PROFIL ---
function isiProfil() {
  if (!pengguna) return;
  const avatarEl = document.getElementById('avatar-profil');
  if (avatarEl) avatarEl.textContent = pengguna.nama.charAt(0).toUpperCase();
  const namaEl = document.getElementById('profil-nama');
  if (namaEl) namaEl.textContent = pengguna.nama;
  const emailEl = document.getElementById('profil-email');
  if (emailEl) emailEl.textContent = pengguna.email;
  const idEl = document.getElementById('profil-id');
  if (idEl) idEl.textContent = '#' + pengguna.id;
}

function salinID() {
  if (!pengguna) return;
  navigator.clipboard.writeText(String(pengguna.id))
    .then(() => {
      const badge = document.getElementById('user-id-badge');
      if (badge) {
        badge.textContent = 'Tersalin!';
        setTimeout(() => { badge.textContent = '#' + pengguna.id; }, 1500);
      }
    });
}

// --- LOGOUT ---
async function logout() {
  // Hapus semua pesan chat yang terbuka (no backup)
  if (temanAktif) {
    try {
      await fetch(`/api/chat/${temanAktif.id}/messages`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch {}
  }

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
  } catch {}

  if (ws) ws.close();
  localStorage.clear();
  window.location.href = '/';
}

// --- UTILITAS ---
function escHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Tutup modal klik luar
document.getElementById('overlay-teman').addEventListener('click', function(e) {
  if (e.target === this) tutupModal();
});

// --- MULAI ---
init();
