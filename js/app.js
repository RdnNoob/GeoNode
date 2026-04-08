/**
 * app.js - Logika Utama Aplikasi GeoLocate (v7)
 * Fix: group management, tambah anggota, pengaturan grup
 */

let token = null;
let pengguna = null;
let ws = null;
let daftarTeman = [];
let temanAktif = null;
let groupAktif = null;
let daftarGroup = [];
let intervalLokasi = null;
let chatPollInterval = null;
let lastMsgID = 0;
let groupPollInterval = null;
let lastGroupMsgID = 0;
let modeGroupMaps = false;
let markersGroupMaps = {};

// --- INISIALISASI ---
async function init() {
  token = localStorage.getItem('gl_token');
  const userData = localStorage.getItem('gl_user');

  if (!token || !userData) {
    window.location.href = '/login.html';
    return;
  }

  // Cek maintenance mode
  try {
    const mRes = await fetch('/api/admin/check-maintenance');
    const mData = await mRes.json();
    if (mData.maintenance) {
      window.location.href = '/maintenance.html';
      return;
    }
  } catch {}

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

  document.getElementById('nama-pengguna').textContent = pengguna.nama;
  const badge = document.getElementById('user-id-badge');
  badge.textContent = pengguna.kode || '#' + pengguna.id;
  badge.onclick = salinID;

  inisialisasiPeta();
  hubungkanWS();
  await muatTeman();
  await muatPermintaan();
  await muatGroup();
  mulaiGPS();
  isiProfil();
  inisialisasiSwipe();
  pulihkanChatAktif();

  setInterval(muatTeman, 30000);
  setInterval(muatPermintaan, 8000);
  setInterval(muatGroup, 60000);
}

// --- DRAWER SIDEBAR ---
function bukaDrawer(tabName) {
  const panel = document.getElementById('panel-samping');
  const overlay = document.getElementById('drawer-overlay');
  if (!panel) return;
  if (tabName) {
    document.querySelectorAll('.panel-tab').forEach(el => el.style.display = 'none');
    const el = document.getElementById(tabName);
    if (el) el.style.display = el.classList.contains('panel-tab') ? 'flex' : 'block';
  }
  panel.classList.add('drawer-terbuka');
  if (overlay) overlay.classList.add('tampil');
  document.body.style.overflow = 'hidden';
}

function tutupDrawer() {
  const panel = document.getElementById('panel-samping');
  const overlay = document.getElementById('drawer-overlay');
  if (!panel) return;
  panel.classList.remove('drawer-terbuka');
  if (overlay) overlay.classList.remove('tampil');
  document.body.style.overflow = '';
}

function isMobile() {
  return window.innerWidth <= 768;
}

function inisialisasiSwipe() {
  let startX = 0, startY = 0, dragging = false;
  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = false;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!isMobile()) return;
    const dx = e.touches[0].clientX - startX;
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (!dragging && startX < 30 && dx > 40 && dy < 60) {
      dragging = true;
      bukaDrawer();
    }
  }, { passive: true });
  document.addEventListener('touchend', () => { dragging = false; }, { passive: true });
}

// --- PULIHKAN CHAT AKTIF ---
function pulihkanChatAktif() {
  try {
    const simpanan = localStorage.getItem('gl_chat_aktif');
    if (simpanan) {
      const data = JSON.parse(simpanan);
      if (data && data.id && data.nama) bukaChat(data.id, data.nama);
    }
  } catch {}
}

function simpanChatAktif() {
  if (temanAktif) {
    localStorage.setItem('gl_chat_aktif', JSON.stringify(temanAktif));
  } else {
    localStorage.removeItem('gl_chat_aktif');
  }
}

// --- WEBSOCKET (Polling) ---
function hubungkanWS() {
  let lastTimestamp = new Date(Date.now() - 5000).toISOString().slice(0,19).replace('T',' ');
  let polling = false;

  function pollEvents() {
    if (polling) return;
    polling = true;
    const friendIDParam = temanAktif ? '&friend_id=' + temanAktif.id : '';
    const groupIDParam = groupAktif ? '&group_id=' + groupAktif.id : '';
    fetch('/api/ws?since=' + encodeURIComponent(lastTimestamp) + friendIDParam + groupIDParam + '&_t=' + Date.now(), {
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
      polling = false;
      setTimeout(pollEvents, 2000);
    });
  }

  pollEvents();
  ws = { readyState: 1, send: function(data) {} };
}

function tanganiPesanWS(msg) {
  if (msg.type === 'location_update') {
    const loc = msg.payload;
    perbarui_marker_teman(loc.user_id, loc.latitude, loc.longitude, loc.nama, loc.is_online);
    perbaruiStatusTeman(loc.user_id, true);
  } else if (msg.type === 'user_status') {
    perbaruiStatusTeman(msg.payload.user_id, msg.payload.is_online);
    if (!msg.payload.is_online) tandaiOffline(msg.payload.user_id);
  } else if (msg.type === 'user_offline') {
    perbaruiStatusTeman(msg.payload.user_id, false);
    tandaiOffline(msg.payload.user_id);
  } else if (msg.type === 'new_message') {
    const payload = msg.payload;
    if (payload.is_mine) return;
    if (temanAktif && temanAktif.id == payload.from_user_id) {
      tampilkanPesanBaru(payload);
    } else {
      tandaiPesanBaru(payload.from_user_id);
    }
  } else if (msg.type === 'unread_message') {
    if (!temanAktif || temanAktif.id !== msg.payload.from_user_id) {
      tandaiPesanBaru(msg.payload.from_user_id);
    }
  } else if (msg.type === 'friend_request') {
    muatPermintaan();
  } else if (msg.type === 'group_message') {
    const payload = msg.payload;
    if (payload.is_mine) return;
    if (groupAktif && groupAktif.id == payload.group_id) {
      tampilkanPesanGroupBaru(payload);
    } else {
      tandaiPesanGroupBaru(payload.group_id);
    }
  }
}

// --- GPS ---
function mulaiGPS() {
  if (!navigator.geolocation) {
    const el = document.getElementById('status-gps');
    if (el) el.textContent = 'GPS tidak didukung browser ini';
    return;
  }

  const opsi = { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 };

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lon, heading } = pos.coords;
      perbarui_marker_saya(lat, lon, pengguna.nama, heading);

      fetch('/api/location/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ latitude: lat, longitude: lon })
      }).catch(() => {});

      const el = document.getElementById('status-gps');
      if (el) el.textContent = 'Aktif: ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
    },
    (err) => {
      const el = document.getElementById('status-gps');
      if (el) el.textContent = 'GPS: ' + err.message;
    },
    opsi
  );
}

// --- TEMAN ---
async function muatTeman() {
  try {
    const res = await fetch('/api/friends?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) throw new Error('Gagal memuat teman');
    const data = await res.json();
    daftarTeman = Array.isArray(data) ? data : [];
    renderDaftarTeman();
    renderDaftarChat();
    muatLokasiTeman();
  } catch {
    daftarTeman = [];
    const kontainer = document.getElementById('tab-daftar-teman');
    if (kontainer) kontainer.innerHTML = '<div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F91D;</div><div>Belum ada teman. Tambahkan dengan ID mereka!</div></div>';
  }
}

async function muatLokasiTeman() {
  try {
    const res = await fetch('/api/location/friends?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) return;
    const lokasi = await res.json();
    if (Array.isArray(lokasi)) {
      lokasi.forEach(loc => perbarui_marker_teman(loc.user_id, loc.latitude, loc.longitude, loc.nama, loc.is_online));
    }
  } catch {}
}

async function muatPermintaan() {
  try {
    const cb = '_t=' + Date.now();
    const [resIn, resOut] = await Promise.all([
      fetch('/api/friends?type=requests&' + cb, { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch('/api/friends?type=sent&' + cb,     { headers: { 'Authorization': 'Bearer ' + token } })
    ]);
    const masuk = resIn.ok ? (await resIn.json()) : [];
    const terkirim = resOut.ok ? (await resOut.json()) : [];
    const listMasuk = Array.isArray(masuk) ? masuk : [];
    const listTerkirim = Array.isArray(terkirim) ? terkirim : [];
    renderPermintaan(listMasuk, listTerkirim);
    const badge = document.getElementById('badge-perm');
    const chip = document.getElementById('chip-permintaan');
    if (listMasuk.length > 0) {
      if (badge) { badge.style.display = 'inline-flex'; badge.textContent = listMasuk.length; }
      if (chip) { chip.style.display = 'inline-flex'; chip.textContent = listMasuk.length; }
    } else {
      if (badge) badge.style.display = 'none';
      if (chip) chip.style.display = 'none';
    }
  } catch {}
}

function renderDaftarTeman() {
  const kontainer = document.getElementById('tab-daftar-teman');
  if (!kontainer) return;
  if (daftarTeman.length === 0) {
    kontainer.innerHTML = '<div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F91D;</div><div>Belum ada teman. Tambahkan dengan ID mereka!</div></div>';
    return;
  }
  kontainer.innerHTML = daftarTeman.map(f => {
    const t = f.friend;
    if (!t) return '';
    const warna = t.avatar_warna || '#374151';
    const inisial = (t.nama || '?').charAt(0).toUpperCase();
    const kodeUser = t.kode || ('ID: #' + t.id);
    const online = t.is_online;
    return '<div class="teman-item" style="display:flex;align-items:center;gap:10px;padding:10px 16px;">' +
      '<div class="avatar' + (online ? ' online' : '') + '" style="background:' + warna + ';color:#fff;cursor:pointer;flex-shrink:0;" onclick="pilihteman(' + t.id + ', \'' + escHTML(t.nama) + '\')">' +
        inisial +
      '</div>' +
      '<div class="teman-info" style="flex:1;cursor:pointer;min-width:0;" onclick="pilihteman(' + t.id + ', \'' + escHTML(t.nama) + '\')">' +
        '<div class="teman-nama">' + escHTML(t.nama) + '</div>' +
        '<div class="teman-status">' + kodeUser + (online ? ' - Online' : '') + '</div>' +
      '</div>' +
      '<button onclick="hapusTeman(' + f.id + ', \'' + escHTML(t.nama) + '\')" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;" title="Hapus teman">\u2715</button>' +
    '</div>';
  }).join('');
}

async function hapusTeman(friendshipID, nama) {
  if (!confirm('Hapus ' + nama + ' dari daftar teman?')) return;
  try {
    const res = await fetch('/api/friends/' + friendshipID, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal menghapus teman');
    await muatTeman();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function renderDaftarChat() {
  const kontainer = document.getElementById('daftar-chat');
  if (!kontainer) return;
  if (daftarTeman.length === 0) {
    kontainer.innerHTML = '<div class="halaman-kosong" style="font-size:13px;padding:12px;">Belum ada teman</div>';
    return;
  }
  kontainer.innerHTML = daftarTeman.map(f => {
    const t = f.friend;
    if (!t) return '';
    return '<div class="teman-item" onclick="pilihteman(' + t.id + ', \'' + escHTML(t.nama) + '\')">' +
      '<div class="avatar" style="background:' + (t.avatar_warna || '#374151') + ';color:#fff;">' + (t.nama || '?').charAt(0).toUpperCase() + '</div>' +
      '<div class="teman-info">' +
        '<div class="teman-nama">' + escHTML(t.nama) + '</div>' +
        '<div class="teman-status">' + (t.is_online ? 'Online' : 'Offline') + '</div>' +
      '</div>' +
      '<span class="chip-notif" id="notif-chat-' + t.id + '" style="display:none;"></span>' +
    '</div>';
  }).join('');
}

function renderPermintaan(masuk, terkirim) {
  const kontainer = document.getElementById('tab-permintaan-teman');
  if (!kontainer) return;
  let html = '';
  if (masuk.length > 0) {
    html += '<div style="padding:8px 16px;font-size:12px;font-weight:700;color:var(--teks-muda);">Permintaan Masuk</div>';
    html += masuk.map(u => {
      return '<div class="teman-item" style="display:flex;align-items:center;gap:10px;padding:10px 16px;">' +
        '<div class="avatar" style="background:' + (u.avatar_warna || '#374151') + ';color:#fff;">' + (u.nama || '?').charAt(0).toUpperCase() + '</div>' +
        '<div class="teman-info" style="flex:1;min-width:0;">' +
          '<div class="teman-nama">' + escHTML(u.nama) + '</div>' +
          '<div class="teman-status">' + (u.kode || 'ID: #' + u.id) + '</div>' +
        '</div>' +
        '<button class="btn btn-hijau" style="font-size:11px;padding:4px 10px;" onclick="terimaPermintaan(' + u.request_id + ')">Terima</button>' +
        '<button class="btn btn-merah" style="font-size:11px;padding:4px 10px;" onclick="tolakPermintaan(' + u.request_id + ')">Tolak</button>' +
      '</div>';
    }).join('');
  }
  if (terkirim.length > 0) {
    html += '<div style="padding:8px 16px;font-size:12px;font-weight:700;color:var(--teks-muda);">Permintaan Terkirim</div>';
    html += terkirim.map(u => {
      return '<div class="teman-item" style="display:flex;align-items:center;gap:10px;padding:10px 16px;">' +
        '<div class="avatar" style="background:' + (u.avatar_warna || '#374151') + ';color:#fff;">' + (u.nama || '?').charAt(0).toUpperCase() + '</div>' +
        '<div class="teman-info" style="flex:1;min-width:0;">' +
          '<div class="teman-nama">' + escHTML(u.nama) + '</div>' +
          '<div class="teman-status">Menunggu...</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  if (!html) {
    html = '<div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F4EC;</div><div>Tidak ada permintaan masuk</div></div>';
  }
  kontainer.innerHTML = html;
}

async function terimaPermintaan(requestID) {
  try {
    const res = await fetch('/api/friends/requests/' + requestID + '/accept', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal');
    await muatPermintaan();
    await muatTeman();
  } catch {}
}

async function tolakPermintaan(requestID) {
  try {
    const res = await fetch('/api/friends/requests/' + requestID + '/reject', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal');
    await muatPermintaan();
  } catch {}
}

function perbaruiStatusTeman(userID, online) {
  const el = document.querySelector('[data-user-id="' + userID + '"]');
  if (el) {
    el.classList.toggle('online', online);
  }
}

function tandaiPesanBaru(fromID) {
  const chip = document.getElementById('notif-chat-' + fromID);
  if (chip) {
    chip.style.display = 'inline-flex';
    const count = parseInt(chip.textContent || '0') + 1;
    chip.textContent = count;
  }
}

// --- PILIH TEMAN ---
function pilihteman(friendID, nama) {
  if (isMobile()) tutupDrawer();
  groupAktif = null;
  bukaChat(friendID, nama);
}

// --- CHAT BIASA ---
async function bukaChat(friendID, nama) {
  temanAktif = { id: friendID, nama };
  groupAktif = null;
  simpanChatAktif();
  gantitab('chat');

  const panelChat = document.getElementById('panel-chat');
  if (!panelChat) return;
  panelChat.style.display = 'flex';

  panelChat.innerHTML = '<div class="chat-area">' +
    '<div class="chat-header">' +
      '<button class="btn-buka-drawer" onclick="bukaDrawer(\'konten-chat-list\')" title="Daftar pesan">&#x2630;</button>' +
      '<div class="avatar" style="background:#111827;color:#fff;width:36px;height:36px;font-size:14px;flex-shrink:0;">' +
        (nama || '?').charAt(0).toUpperCase() +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHTML(nama) + '</div>' +
        '<div style="font-size:12px;color:var(--teks-muda);">ID: #' + friendID + '</div>' +
      '</div>' +
      '<button class="btn btn-outline" style="font-size:12px;padding:5px 10px;white-space:nowrap;flex-shrink:0;" onclick="hapusChat(' + friendID + ')">&#x1F5D1; Hapus</button>' +
    '</div>' +
    '<div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;padding:6px 12px;font-size:12px;color:var(--teks-muda);">' +
      '&#x1F4AC; Pesan dihapus otomatis setelah 30 hari' +
    '</div>' +
    '<div class="chat-pesan-wrapper" id="chat-pesan-' + friendID + '"></div>' +
    '<div class="chat-input-wrapper">' +
      '<textarea class="chat-input" id="chat-input-' + friendID + '" placeholder="Ketik pesan..." rows="1" onkeydown="handleChatKey(event, ' + friendID + ')"></textarea>' +
      '<button class="chat-kirim" onclick="kirimPesan(' + friendID + ')">&#x27A4;</button>' +
    '</div>' +
  '</div>';

  const chip = document.getElementById('notif-chat-' + friendID);
  if (chip) chip.style.display = 'none';

  await muatPesan(friendID);
  // Mulai polling pesan baru langsung ke endpoint
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(function() { pollChatMessages(friendID); }, 2500);
}

function tutupChat() {
  if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
  if (groupPollInterval) { clearInterval(groupPollInterval); groupPollInterval = null; }
  lastMsgID = 0;
  lastGroupMsgID = 0;
  temanAktif = null;
  groupAktif = null;
  simpanChatAktif();
  const panelChat = document.getElementById('panel-chat');
  if (panelChat) {
    panelChat.style.display = 'none';
    panelChat.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--teks-muda);"><div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F4AC;</div><div>Pilih teman dari daftar untuk memulai chat</div></div></div>';
  }
}

async function muatPesan(friendID) {
  const wrapper = document.getElementById('chat-pesan-' + friendID);
  if (!wrapper) return;
  wrapper.innerHTML = '<div style="text-align:center;color:var(--teks-muda);font-size:14px;padding:20px;">Memuat...</div>';

  try {
    const res = await fetch('/api/chat/messages?friend_id=' + friendID, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal');
    const pesan = await res.json();
    wrapper.innerHTML = '';
    lastMsgID = 0;
    for (const p of pesan) {
      tampilkanPesan(p, friendID, wrapper);
      if (p.id > lastMsgID) lastMsgID = p.id;
    }
    wrapper.scrollTop = wrapper.scrollHeight;
  } catch {
    wrapper.innerHTML = '<div style="text-align:center;color:var(--merah);font-size:14px;padding:20px;">Gagal memuat pesan</div>';
  }
}

function tampilkanPesan(pesan, friendID, wrapper) {
  const teks = pesan.encrypted_content || '';
  const waktu = new Date(pesan.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'gelembung-wrapper ' + (pesan.is_mine ? 'milik-saya' : '');
  if (pesan.id) div.id = 'pesan-' + pesan.id;
  div.innerHTML = '<div class="gelembung ' + (pesan.is_mine ? 'milik-saya' : 'teman') + '">' +
    escHTML(teks) +
    '<div class="gelembung-waktu">' + waktu + '</div>' +
  '</div>';
  wrapper.appendChild(div);
}

function tampilkanPesanBaru(payload) {
  const wrapper = document.getElementById('chat-pesan-' + payload.from_user_id);
  if (!wrapper) return;
  tampilkanPesan(payload, payload.from_user_id, wrapper);
  wrapper.scrollTop = wrapper.scrollHeight;
}

async function pollChatMessages(friendID) {
  if (!temanAktif || temanAktif.id !== friendID) return;
  try {
    const res = await fetch('/api/chat/messages?friend_id=' + friendID + '&after_id=' + lastMsgID + '&_t=' + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const pesan = await res.json();
    if (!Array.isArray(pesan) || pesan.length === 0) return;
    const wrapper = document.getElementById('chat-pesan-' + friendID);
    if (!wrapper) return;
    pesan.forEach(function(p) {
      if (document.getElementById('pesan-' + p.id)) return; // skip duplicates
      tampilkanPesan(p, friendID, wrapper);
      if (p.id > lastMsgID) lastMsgID = p.id;
    });
    wrapper.scrollTop = wrapper.scrollHeight;
  } catch {}
}

async function kirimPesan(friendID) {
  const input = document.getElementById('chat-input-' + friendID);
  if (!input) return;
  const teks = input.value.trim();
  if (!teks) return;
  input.value = '';

  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ to_user_id: friendID, encrypted_content: teks })
    });
    if (!res.ok) throw new Error('Gagal');
    const pesanBaru = await res.json();
    const wrapper = document.getElementById('chat-pesan-' + friendID);
    if (wrapper) {
      tampilkanPesan(pesanBaru, friendID, wrapper);
      wrapper.scrollTop = wrapper.scrollHeight;
    }
  } catch {
    if (input) input.value = teks;
    const wrapper = document.getElementById('chat-pesan-' + friendID);
    if (wrapper) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'text-align:center;color:#ef4444;font-size:12px;padding:4px 8px;';
      errDiv.textContent = 'Pesan gagal terkirim. Periksa koneksi.';
      wrapper.appendChild(errDiv);
      setTimeout(() => errDiv.remove(), 3000);
    }
  }
}

function handleChatKey(e, friendID) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    kirimPesan(friendID);
  }
}

async function hapusChat(friendID) {
  if (!confirm('Hapus semua pesan dengan teman ini?')) return;
  try {
    const res = await fetch('/api/chat/messages?friend_id=' + friendID, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal menghapus');
    const wrapper = document.getElementById('chat-pesan-' + friendID);
    if (wrapper) wrapper.innerHTML = '';
    alert('Pesan berhasil dihapus');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== GROUP =====================

async function muatGroup() {
  try {
    const res = await fetch('/api/groups/?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + token } });
    const rawText = await res.text();
    console.log('[muatGroup] HTTP ' + res.status + ':', rawText.substring(0, 300));
    if (!res.ok) {
      var el = document.getElementById('daftar-group-chat');
      if (el) el.innerHTML = '<div style="font-size:11px;color:red;padding:8px;">[Grup Error ' + res.status + '] ' + rawText.substring(0, 120) + '</div>';
      return;
    }
    let data;
    try { data = JSON.parse(rawText); } catch(e) {
      console.error('[muatGroup] JSON error:', e.message, rawText.substring(0, 100));
      return;
    }
    daftarGroup = Array.isArray(data) ? data : [];
    console.log('[muatGroup] OK -', daftarGroup.length, 'grup');
    renderDaftarGroupChat();
    renderDaftarGroupTeman();
  } catch(err) {
    console.error('[muatGroup] exception:', err.message);
  }
}

function renderDaftarGroupChat() {
  const kontainer = document.getElementById('daftar-group-chat');
  if (!kontainer) return;
  if (daftarGroup.length === 0) {
    kontainer.innerHTML = '<div class="halaman-kosong" style="font-size:13px;padding:12px;">Belum ada grup</div>';
    return;
  }
  kontainer.innerHTML = daftarGroup.map(function(g) {
    return '<div class="teman-item" onclick="bukaGroupChatByID(' + g.id + ')">' +
      '<div class="avatar" style="background:#6366f1;color:#fff;font-size:12px;">&#x1F465;</div>' +
      '<div class="teman-info">' +
        '<div class="teman-nama">' + escHTML(g.nama) + '</div>' +
        '<div class="teman-status">' + g.member_count + ' anggota &bull; ' + g.role + '</div>' +
      '</div>' +
      '<span class="chip-notif" id="notif-group-' + g.id + '" style="display:none;"></span>' +
    '</div>';
  }).join('');
}

function renderDaftarGroupTeman() {
  const kontainer = document.getElementById('daftar-group-teman');
  if (!kontainer) return;
  if (daftarGroup.length === 0) {
    kontainer.innerHTML = '<div class="halaman-kosong" style="font-size:13px;padding:12px;">Belum ada grup</div>';
    return;
  }
  kontainer.innerHTML = daftarGroup.map(function(g) {
    var aksiHTML = '<div style="display:flex;gap:4px;flex-shrink:0;">';
    aksiHTML += '<button class="btn btn-outline" style="font-size:11px;padding:4px 8px;" onclick="event.stopPropagation();bukaModalTambahAnggota(' + g.id + ')" title="Tambah Anggota">+ Anggota</button>';
    if (g.role === 'admin') {
      aksiHTML += '<button class="btn btn-outline" style="font-size:11px;padding:4px 8px;" onclick="event.stopPropagation();bukaAturGroup(' + g.id + ')" title="Pengaturan Grup">&#x2699;</button>';
    }
    aksiHTML += '</div>';
    return '<div class="teman-item" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;" onclick="bukaGroupChatByID(' + g.id + ')">' +
      '<div class="avatar" style="background:#6366f1;color:#fff;font-size:12px;flex-shrink:0;">&#x1F465;</div>' +
      '<div class="teman-info" style="flex:1;min-width:0;">' +
        '<div class="teman-nama">' + escHTML(g.nama) + '</div>' +
        '<div class="teman-status">' + g.member_count + ' anggota &bull; ' + g.role + '</div>' +
      '</div>' +
      aksiHTML +
    '</div>';
  }).join('');
}

function bukaGroupChatByID(groupID) {
  var g = daftarGroup.find(function(x) { return x.id === groupID; });
  if (!g) return;
  bukaGroupChat(groupID, g.nama, g.maps_enabled, g.role);
}

function tandaiPesanGroupBaru(groupID) {
  const chip = document.getElementById('notif-group-' + groupID);
  if (chip) {
    chip.style.display = 'inline-flex';
    chip.textContent = (parseInt(chip.textContent || '0') + 1).toString();
  }
}

async function bukaGroupChat(groupID, nama, mapsEnabled, role) {
  if (isMobile()) tutupDrawer();
  temanAktif = null;
  groupAktif = { id: groupID, nama: nama, mapsEnabled: mapsEnabled, role: role };
  gantitab('chat');

  const panelChat = document.getElementById('panel-chat');
  if (!panelChat) return;
  panelChat.style.display = 'flex';

  var petaBtn = '';
  if (mapsEnabled) {
    petaBtn = '<button class="btn btn-outline" style="font-size:11px;padding:4px 8px;" onclick="bukaGroupMaps(' + groupID + ')" title="Peta Grup">&#x1F5FA; Peta</button>';
  }
  var aturBtn = '<button class="btn btn-outline" style="font-size:11px;padding:4px 8px;" onclick="bukaAturGroup(' + groupID + ')" title="Pengaturan">&#x2699;</button>';
  var tambahBtn = '<button class="btn btn-outline" style="font-size:11px;padding:4px 8px;" onclick="bukaModalTambahAnggota(' + groupID + ')" title="Tambah Anggota">+ Anggota</button>';

  panelChat.innerHTML = '<div class="chat-area">' +
    '<div class="chat-header">' +
      '<button class="btn-buka-drawer" onclick="bukaDrawer(\'konten-chat-list\')" title="Daftar pesan">&#x2630;</button>' +
      '<div class="avatar" style="background:#6366f1;color:#fff;width:36px;height:36px;font-size:12px;flex-shrink:0;">&#x1F465;</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHTML(nama) + '</div>' +
        '<div style="font-size:12px;color:var(--teks-muda);">Grup &bull; ' + role + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;">' +
        tambahBtn + petaBtn + aturBtn +
      '</div>' +
    '</div>' +
    '<div class="chat-pesan-wrapper" id="group-pesan-' + groupID + '"></div>' +
    '<div class="chat-input-wrapper">' +
      '<textarea class="chat-input" id="group-input-' + groupID + '" placeholder="Ketik pesan grup..." rows="1" onkeydown="handleGroupChatKey(event, ' + groupID + ')"></textarea>' +
      '<button class="chat-kirim" onclick="kirimPesanGroup(' + groupID + ')">&#x27A4;</button>' +
    '</div>' +
  '</div>';

  const chip = document.getElementById('notif-group-' + groupID);
  if (chip) chip.style.display = 'none';

  await muatPesanGroup(groupID);
  if (groupPollInterval) clearInterval(groupPollInterval);
  groupPollInterval = setInterval(function() { pollGroupMessages(groupID); }, 2500);
}

async function pollGroupMessages(groupID) {
  var wrapper = document.getElementById('group-pesan-' + groupID);
  if (!wrapper) { clearInterval(groupPollInterval); groupPollInterval = null; return; }
  try {
    var res = await fetch('/api/groups/' + groupID + '/messages?after_id=' + lastGroupMsgID + '&_t=' + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    var pesan = await res.json();
    if (!Array.isArray(pesan)) return;
    for (var p of pesan) {
      tampilkanPesanGroup(p, groupID, wrapper);
      if (p.id > lastGroupMsgID) lastGroupMsgID = p.id;
    }
    if (pesan.length > 0) wrapper.scrollTop = wrapper.scrollHeight;
  } catch {}
}

async function muatPesanGroup(groupID) {
  const wrapper = document.getElementById('group-pesan-' + groupID);
  if (!wrapper) return;
  wrapper.innerHTML = '<div style="text-align:center;color:var(--teks-muda);font-size:14px;padding:20px;">Memuat...</div>';

  try {
    const res = await fetch('/api/groups/' + groupID + '/messages', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal');
    const pesan = await res.json();
    wrapper.innerHTML = '';
    lastGroupMsgID = 0;
    for (const p of pesan) {
      tampilkanPesanGroup(p, groupID, wrapper);
      if (p.id > lastGroupMsgID) lastGroupMsgID = p.id;
    }
    wrapper.scrollTop = wrapper.scrollHeight;
  } catch {
    wrapper.innerHTML = '<div style="text-align:center;color:var(--merah);font-size:14px;padding:20px;">Gagal memuat pesan grup</div>';
  }
}

function tampilkanPesanGroup(pesan, groupID, wrapper) {
  const waktu = new Date(pesan.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'gelembung-wrapper ' + (pesan.is_mine ? 'milik-saya' : '');
  div.innerHTML = '<div class="gelembung ' + (pesan.is_mine ? 'milik-saya' : 'teman') + '">' +
    (!pesan.is_mine ? '<div style="font-size:11px;font-weight:700;color:#6366f1;margin-bottom:3px;">' + escHTML(pesan.from_nama || '?') + '</div>' : '') +
    escHTML(pesan.content) +
    '<div class="gelembung-waktu">' + waktu + '</div>' +
  '</div>';
  wrapper.appendChild(div);
}

function tampilkanPesanGroupBaru(payload) {
  const wrapper = document.getElementById('group-pesan-' + payload.group_id);
  if (!wrapper) return;
  tampilkanPesanGroup(payload, payload.group_id, wrapper);
  wrapper.scrollTop = wrapper.scrollHeight;
}

async function kirimPesanGroup(groupID) {
  const input = document.getElementById('group-input-' + groupID);
  if (!input) return;
  const teks = input.value.trim();
  if (!teks) return;
  input.value = '';

  try {
    const res = await fetch('/api/groups/' + groupID + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content: teks })
    });
    if (!res.ok) throw new Error('Gagal');
    const pesanBaru = await res.json();
    const wrapper = document.getElementById('group-pesan-' + groupID);
    if (wrapper) {
      tampilkanPesanGroup(pesanBaru, groupID, wrapper);
      wrapper.scrollTop = wrapper.scrollHeight;
    }
  } catch {}
}

function handleGroupChatKey(e, groupID) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    kirimPesanGroup(groupID);
  }
}

// --- PETA GROUP ---
async function bukaGroupMaps(groupID) {
  tutupGroupMapDropdown();
  gantitab('peta');
  modeGroupMaps = true;
  var g = daftarGroup.find(function(x) { return x.id === groupID; });
  groupAktif = { id: groupID, nama: g ? g.nama : 'Grup' };

  // Sembunyikan marker teman biasa (simpan sementara, bukan hapus permanent)
  Object.keys(markersTeman).forEach(function(uid) {
    if (peta && markersTeman[uid]) peta.removeLayer(markersTeman[uid]);
  });

  // Hapus marker grup lama
  Object.keys(markersGroupMaps).forEach(function(uid) {
    if (peta && markersGroupMaps[uid]) peta.removeLayer(markersGroupMaps[uid]);
  });
  markersGroupMaps = {};

  // Tampilkan loading di info panel
  var infoEl = document.getElementById('peta-info');
  if (infoEl) {
    infoEl.style.display = 'block';
    infoEl.innerHTML = '<div style="font-size:12px;color:var(--teks-muda);">Memuat peta grup...</div>';
  }

  try {
    const res = await fetch('/api/groups/' + groupID + '/maps', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      throw new Error(errData.error || 'Gagal memuat peta grup');
    }
    const members = await res.json();

    var bounds = [];
    if (lokasiku) bounds.push([lokasiku.lat, lokasiku.lon]);

    members.forEach(function(m) {
      if (m.latitude && m.longitude) {
        var icon = buatAvatarMarkerTeman(m.nama, m.avatar_warna || '#6366f1', m.is_online, null);
        markersGroupMaps[m.user_id] = L.marker([m.latitude, m.longitude], { icon: icon })
          .addTo(peta)
          .bindTooltip(m.nama, { permanent: false, className: 'leaflet-tooltip-teman' });
        bounds.push([m.latitude, m.longitude]);
      }
    });

    if (bounds.length > 0) peta.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    tampilInfoPetaGrup(g ? g.nama : 'Grup', members, groupID);

    // Tandai tombol aktif
    var btnGM = document.getElementById('tombol-group-maps');
    if (btnGM) btnGM.style.background = '#6366f1';
  } catch(err) {
    modeGroupMaps = false;
    // Tampilkan kembali marker teman biasa
    Object.keys(markersTeman).forEach(function(uid) {
      if (peta && markersTeman[uid]) peta.addLayer(markersTeman[uid]);
    });
    if (infoEl) infoEl.style.display = 'none';
    alert(err.message || 'Gagal memuat peta grup');
  }
}

function keluarGroupMaps() {
  modeGroupMaps = false;
  // Hapus marker grup
  Object.keys(markersGroupMaps).forEach(function(uid) {
    if (peta && markersGroupMaps[uid]) peta.removeLayer(markersGroupMaps[uid]);
  });
  markersGroupMaps = {};

  // Kembalikan marker teman biasa
  muatLokasiTeman();

  // Reset info panel ke tampilan normal
  var infoEl = document.getElementById('peta-info');
  if (infoEl) {
    infoEl.style.display = 'block';
    infoEl.innerHTML = '<div style="font-size:12px;color:var(--teks-muda);margin-bottom:4px;">Lokasi Saya</div><div id="koordinat-saya" style="font-size:13px;font-weight:500;"></div>';
  }

  // Reset tombol grup
  var btnGM = document.getElementById('tombol-group-maps');
  if (btnGM) btnGM.style.background = '';

  groupAktif = null;
}

function tampilInfoPetaGrup(namaGrup, members, groupID) {
  var infoEl = document.getElementById('peta-info');
  if (!infoEl) return;
  var tampil = members.filter(function(m) { return m.latitude && m.longitude; });
  var semua = members.length;
  infoEl.style.display = 'block';
  infoEl.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
      '<div style="width:10px;height:10px;border-radius:50%;background:#6366f1;flex-shrink:0;"></div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--teks);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHTML(namaGrup) + '</div>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--teks-muda);margin-bottom:8px;">' + tampil.length + ' dari ' + semua + ' anggota terlihat di peta</div>' +
    '<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:100%;justify-content:center;" onclick="keluarGroupMaps()">' +
      '&#x2190; Kembali ke peta normal' +
    '</button>';
}

function tampilInfoPeta(teks, showKeluar) {
  const infoEl = document.getElementById('peta-info');
  if (!infoEl) return;
  infoEl.style.display = 'block';
  infoEl.innerHTML = '<div style="font-size:12px;color:var(--teks-muda);margin-bottom:4px;">' + teks + '</div>' +
    (showKeluar ? '<button class="btn btn-outline" style="font-size:11px;padding:3px 8px;" onclick="keluarGroupMaps()">&#x2190; Kembali ke peta normal</button>' : '');
}

// --- DROPDOWN PETA GRUP ---
function toggleGroupMapDropdown(e) {
  if (e) e.stopPropagation();
  var dropdown = document.getElementById('dropdown-group-maps');
  if (!dropdown) return;
  if (dropdown.style.display !== 'none') {
    tutupGroupMapDropdown();
  } else {
    bukaGroupMapDropdown();
  }
}

function bukaGroupMapDropdown() {
  var dropdown = document.getElementById('dropdown-group-maps');
  if (!dropdown) return;

  var groupDenganPeta = daftarGroup.filter(function(g) { return g.maps_enabled; });

  if (groupDenganPeta.length === 0) {
    dropdown.innerHTML =
      '<div style="padding:14px 16px;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--teks);margin-bottom:4px;">&#x1F5FA;&#xFE0F; Peta Grup</div>' +
        '<div style="font-size:12px;color:var(--teks-muda);">Tidak ada grup dengan fitur peta aktif.<br>Aktifkan di Pengaturan Grup.</div>' +
      '</div>';
  } else {
    var html =
      '<div style="padding:10px 14px;border-bottom:1px solid var(--border);">' +
        '<div style="font-size:11px;font-weight:700;color:var(--teks-muda);text-transform:uppercase;letter-spacing:0.05em;">Pilih Peta Grup</div>' +
      '</div>';

    if (modeGroupMaps && groupAktif) {
      html +=
        '<div style="padding:8px 14px;border-bottom:1px solid var(--border);">' +
          '<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:100%;justify-content:center;" onclick="keluarGroupMaps();tutupGroupMapDropdown();">' +
            '&#x2190; Kembali ke peta normal' +
          '</button>' +
        '</div>';
    }

    html += groupDenganPeta.map(function(g) {
      var isAktif = modeGroupMaps && groupAktif && groupAktif.id === g.id;
      return '<div onclick="bukaGroupMaps(' + g.id + ')" style="' +
        'padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;' +
        'border-bottom:1px solid var(--border);' +
        (isAktif ? 'background:rgba(99,102,241,0.15);' : '') +
        'transition:background 0.15s;" ' +
        'onmouseover="this.style.background=' + (isAktif ? '"rgba(99,102,241,0.2)"' : '"var(--bg3)"') + '" ' +
        'onmouseout="this.style.background=' + (isAktif ? '"rgba(99,102,241,0.15)"' : '""') + '">' +
          '<div style="width:34px;height:34px;border-radius:8px;background:' + (isAktif ? '#6366f1' : 'rgba(99,102,241,0.2)') + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">&#x1F465;</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:13px;font-weight:600;color:var(--teks);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHTML(g.nama) + '</div>' +
            '<div style="font-size:11px;color:var(--teks-muda);">' + g.member_count + ' anggota' + (isAktif ? ' • Aktif' : '') + '</div>' +
          '</div>' +
          (isAktif ? '<div style="font-size:16px;">&#x2713;</div>' : '') +
      '</div>';
    }).join('');

    dropdown.innerHTML = html;
  }

  dropdown.style.display = 'block';

  // Auto tutup saat klik luar
  setTimeout(function() {
    document.addEventListener('click', tutupGroupMapDropdownOutside, { once: true });
  }, 50);
}

function tutupGroupMapDropdown() {
  var dropdown = document.getElementById('dropdown-group-maps');
  if (dropdown) dropdown.style.display = 'none';
}

function tutupGroupMapDropdownOutside(e) {
  var btn = document.getElementById('tombol-group-maps');
  var dropdown = document.getElementById('dropdown-group-maps');
  if (!dropdown) return;
  if (btn && (btn === e.target || btn.contains(e.target))) {
    // klik di button sendiri, biarkan toggle menangani
    return;
  }
  if (dropdown && dropdown.contains(e.target)) {
    // klik dalam dropdown, tambah listener lagi
    setTimeout(function() {
      document.addEventListener('click', tutupGroupMapDropdownOutside, { once: true });
    }, 50);
    return;
  }
  tutupGroupMapDropdown();
}

// --- BUAT GROUP ---
function bukaModalBuatGroup() {
  const modal = document.getElementById('overlay-buat-group');
  if (modal) modal.classList.add('tampil');
}

function tutupModalBuatGroup() {
  const modal = document.getElementById('overlay-buat-group');
  if (modal) modal.classList.remove('tampil');
}

async function buatGroup() {
  const namaInput = document.getElementById('input-nama-group');
  const notif = document.getElementById('notif-group-buat');
  if (!namaInput) return;
  const nama = namaInput.value.trim();
  if (!nama) {
    if (notif) { notif.textContent = 'Nama grup wajib diisi'; notif.className = 'notifikasi error tampil'; }
    return;
  }
  try {
    const res = await fetch('/api/groups/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ nama: nama })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membuat grup');
    if (notif) { notif.textContent = 'Grup berhasil dibuat!'; notif.className = 'notifikasi sukses tampil'; }
    namaInput.value = '';
    await muatGroup();
    setTimeout(function() {
      tutupModalBuatGroup();
      bukaGroupChat(data.id, data.nama, data.maps_enabled, 'admin');
    }, 1000);
  } catch (err) {
    if (notif) { notif.textContent = err.message; notif.className = 'notifikasi error tampil'; }
  }
}

// --- TAMBAH ANGGOTA MODAL (standalone) ---
var tambahAnggotaGroupID = null;

function bukaModalTambahAnggota(groupID) {
  tambahAnggotaGroupID = groupID;
  var g = daftarGroup.find(function(x) { return x.id === groupID; });
  var namaGrup = g ? g.nama : 'Grup';
  var judul = document.getElementById('judul-tambah-anggota');
  if (judul) judul.textContent = 'Tambah Anggota ke ' + namaGrup;
  var input = document.getElementById('input-tambah-anggota-modal');
  if (input) input.value = '';
  var notif = document.getElementById('notif-tambah-anggota-modal');
  if (notif) { notif.textContent = ''; notif.className = 'notifikasi'; }
  var daftarEl = document.getElementById('daftar-anggota-grup-modal');
  if (daftarEl) daftarEl.innerHTML = '<div style="text-align:center;color:var(--teks-muda);font-size:13px;padding:8px;">Memuat anggota...</div>';
  var modal = document.getElementById('overlay-tambah-anggota');
  if (modal) modal.classList.add('tampil');
  muatAnggotaModal(groupID);
}

function tutupModalTambahAnggota() {
  var modal = document.getElementById('overlay-tambah-anggota');
  if (modal) modal.classList.remove('tampil');
  tambahAnggotaGroupID = null;
}

async function muatAnggotaModal(groupID) {
  var daftarEl = document.getElementById('daftar-anggota-grup-modal');
  if (!daftarEl) return;
  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Gagal');
    var members = await res.json();
    if (members.length === 0) {
      daftarEl.innerHTML = '<div style="text-align:center;color:var(--teks-muda);font-size:13px;padding:8px;">Belum ada anggota</div>';
      return;
    }
    daftarEl.innerHTML = members.map(function(m) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<div class="avatar" style="background:' + (m.avatar_warna || '#374151') + ';color:#fff;width:28px;height:28px;font-size:12px;">' + (m.nama||'?').charAt(0).toUpperCase() + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:600;">' + escHTML(m.nama) + '</div>' +
          '<div style="font-size:11px;color:var(--teks-muda);">' + m.role + ' &bull; ' + (m.kode || 'ID: #' + m.user_id) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch {
    daftarEl.innerHTML = '<div style="text-align:center;color:var(--merah);font-size:13px;padding:8px;">Gagal memuat anggota</div>';
  }
}

async function kirimTambahAnggota() {
  if (!tambahAnggotaGroupID) return;
  var input = document.getElementById('input-tambah-anggota-modal');
  var notif = document.getElementById('notif-tambah-anggota-modal');
  var kode = input ? input.value.trim() : '';
  if (!kode) {
    if (notif) { notif.textContent = 'Masukkan ID atau kode pengguna'; notif.className = 'notifikasi error tampil'; }
    return;
  }

  try {
    var res = await fetch('/api/groups/' + tambahAnggotaGroupID + '/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ user_code: kode })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambah anggota');
    if (notif) { notif.textContent = data.message || 'Berhasil ditambahkan!'; notif.className = 'notifikasi sukses tampil'; }
    if (input) input.value = '';
    await muatGroup();
    muatAnggotaModal(tambahAnggotaGroupID);
  } catch (err) {
    if (notif) { notif.textContent = err.message; notif.className = 'notifikasi error tampil'; }
  }
}

// --- ATUR GROUP (admin) ---
async function bukaAturGroup(groupID) {
  var group = daftarGroup.find(function(g) { return g.id === groupID; });
  if (!group) {
    alert('Grup tidak ditemukan. Coba muat ulang halaman.');
    return;
  }

  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var members = await res.json();

    var modalBody = document.getElementById('body-atur-group');
    if (!modalBody) return;

    var isAdmin = group.role === 'admin';

    var html = '<div style="margin-bottom:12px;">' +
      '<strong>' + escHTML(group.nama) + '</strong>' +
      '<div style="font-size:12px;color:var(--teks-muda);">' + members.length + ' anggota &bull; ' + group.role + '</div>' +
    '</div>';

    if (isAdmin) {
      html += '<div style="margin-bottom:16px;">' +
        '<label style="font-size:12px;color:var(--teks-muda);">Fitur Peta Grup</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:6px;">' +
          '<input type="checkbox" id="toggle-maps-group" ' + (group.maps_enabled ? 'checked' : '') + '>' +
          '<label for="toggle-maps-group" style="font-size:14px;">Aktifkan peta grup</label>' +
        '</div>' +
        '<button class="btn btn-outline" style="font-size:12px;margin-top:8px;" onclick="simpanToggleMaps(' + groupID + ')">Simpan Pengaturan Peta</button>' +
      '</div>';
    }

    html += '<div style="margin-bottom:12px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Anggota</div>' +
      members.map(function(m) {
        var aksi = '';
        if (isAdmin && m.user_id !== pengguna.id) {
          aksi = '<select onchange="ubahRoleMember(' + groupID + ', ' + m.user_id + ', this.value)" style="font-size:12px;padding:2px 6px;background:var(--bg-kartu);color:var(--teks);border:1px solid var(--border);border-radius:4px;">' +
            '<option value="member" ' + (m.role === 'member' ? 'selected' : '') + '>Member</option>' +
            '<option value="admin" ' + (m.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
          '</select>' +
          '<button class="btn btn-merah" style="font-size:11px;padding:3px 8px;" onclick="keluarkanMember(' + groupID + ', ' + m.user_id + ', \'' + escHTML(m.nama) + '\')">Keluarkan</button>';
        } else if (m.user_id === pengguna.id) {
          aksi = '<span style="font-size:11px;color:var(--teks-muda);">Saya</span>';
        }
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">' +
          '<div class="avatar" style="background:' + (m.avatar_warna || '#374151') + ';color:#fff;width:32px;height:32px;font-size:13px;">' + (m.nama||'?').charAt(0).toUpperCase() + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:14px;font-weight:600;">' + escHTML(m.nama) + '</div>' +
            '<div style="font-size:11px;color:var(--teks-muda);">' + m.role + ' &bull; ' + (m.kode || 'ID: #' + m.user_id) + '</div>' +
          '</div>' +
          aksi +
        '</div>';
      }).join('') +
    '</div>';

    if (isAdmin) {
      html += '<div style="margin-top:12px;">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Tambah Anggota</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input type="text" id="input-tambah-member" placeholder="ID atau kode (contoh: RGGeoNd_00001)" style="flex:1;font-size:13px;">' +
          '<button class="btn btn-hijau" style="font-size:13px;" onclick="tambahMember(' + groupID + ')">+ Tambah</button>' +
        '</div>' +
        '<div class="notifikasi" id="notif-tambah-member" style="margin-top:8px;"></div>' +
      '</div>';

      html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">' +
        '<button class="btn btn-merah" style="width:100%;font-size:13px;" onclick="hapusGroup(' + groupID + ')">Hapus Grup</button>' +
      '</div>';
    } else {
      html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">' +
        '<button class="btn btn-merah" style="width:100%;font-size:13px;" onclick="keluarDariGroup(' + groupID + ')">Keluar dari Grup</button>' +
      '</div>';
    }

    modalBody.innerHTML = html;
    document.getElementById('overlay-atur-group').classList.add('tampil');
  } catch(err) {
    alert('Gagal memuat pengaturan grup: ' + (err.message || 'Error'));
  }
}

function tutupAturGroup() {
  document.getElementById('overlay-atur-group').classList.remove('tampil');
}

async function simpanToggleMaps(groupID) {
  var checked = document.getElementById('toggle-maps-group');
  if (!checked) return;
  try {
    var res = await fetch('/api/groups/' + groupID + '/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ maps_enabled: checked.checked })
    });
    if (!res.ok) {
      var errData = await res.json();
      throw new Error(errData.error || 'Gagal menyimpan');
    }
    await muatGroup();
    alert('Pengaturan peta grup disimpan!');
  } catch(err) {
    alert('Error: ' + (err.message || 'Gagal menyimpan pengaturan'));
  }
}

async function tambahMember(groupID) {
  var input = document.getElementById('input-tambah-member');
  var notif = document.getElementById('notif-tambah-member');
  var kode = input ? input.value.trim() : '';
  if (!kode) {
    if (notif) { notif.textContent = 'Masukkan ID atau kode pengguna'; notif.className = 'notifikasi error tampil'; }
    return;
  }

  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ user_code: kode })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambah anggota');
    if (notif) { notif.textContent = data.message; notif.className = 'notifikasi sukses tampil'; }
    if (input) input.value = '';
    await muatGroup();
    bukaAturGroup(groupID);
  } catch (err) {
    if (notif) { notif.textContent = err.message; notif.className = 'notifikasi error tampil'; }
  }
}

async function ubahRoleMember(groupID, userID, role) {
  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ user_id: userID, role: role })
    });
    if (!res.ok) {
      var errData = await res.json();
      throw new Error(errData.error || 'Gagal mengubah role');
    }
    await muatGroup();
    bukaAturGroup(groupID);
  } catch(err) {
    alert('Error: ' + (err.message || 'Gagal mengubah role'));
  }
}

async function keluarkanMember(groupID, userID, nama) {
  if (!confirm('Keluarkan ' + nama + ' dari grup?')) return;
  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ user_id: userID })
    });
    if (!res.ok) {
      var errData = await res.json();
      throw new Error(errData.error || 'Gagal mengeluarkan anggota');
    }
    await muatGroup();
    bukaAturGroup(groupID);
  } catch(err) {
    alert('Error: ' + (err.message || 'Gagal mengeluarkan anggota'));
  }
}

async function hapusGroup(groupID) {
  if (!confirm('Hapus grup ini? Semua pesan dan anggota akan dihapus. Aksi ini tidak bisa dibatalkan.')) return;
  try {
    var res = await fetch('/api/groups/' + groupID, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      var errData = await res.json();
      throw new Error(errData.error || 'Gagal menghapus grup');
    }
    tutupAturGroup();
    tutupChat();
    await muatGroup();
    alert('Grup berhasil dihapus');
  } catch(err) {
    alert('Error: ' + (err.message || 'Gagal menghapus grup'));
  }
}

async function keluarDariGroup(groupID) {
  if (!confirm('Keluar dari grup ini?')) return;
  try {
    var res = await fetch('/api/groups/' + groupID + '/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ user_id: pengguna.id })
    });
    if (!res.ok) {
      var errData = await res.json();
      throw new Error(errData.error || 'Gagal keluar dari grup');
    }
    tutupAturGroup();
    tutupChat();
    await muatGroup();
    alert('Berhasil keluar dari grup');
  } catch(err) {
    alert('Error: ' + (err.message || 'Gagal keluar dari grup'));
  }
}

// ===================== PERMINTAAN TEMAN =====================

function bukaModalTeman() {
  document.getElementById('overlay-teman').classList.add('tampil');
  setTimeout(function() { document.getElementById('input-id-teman').focus(); }, 100);
}

function tutupModal() {
  document.getElementById('overlay-teman').classList.remove('tampil');
  document.getElementById('notif-teman').className = 'notifikasi';
  document.getElementById('input-id-teman').value = '';
}

async function kirimPermintaanTeman() {
  const input = document.getElementById('input-id-teman');
  const notif = document.getElementById('notif-teman');
  if (!input) return;
  let kode = input.value.trim();
  if (!kode) {
    notif.textContent = 'Masukkan ID teman';
    notif.className = 'notifikasi error tampil';
    return;
  }
  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ target_code: kode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim permintaan');
    notif.textContent = data.message || 'Permintaan terkirim!';
    notif.className = 'notifikasi sukses tampil';
    input.value = '';
    await muatPermintaan();
  } catch (err) {
    notif.textContent = err.message;
    notif.className = 'notifikasi error tampil';
  }
}

// ===================== NAVIGASI & TAB =====================

function gantitab(tab) {
  document.querySelectorAll('.shortcut-btn').forEach(function(b) { b.classList.remove('aktif'); });
  const tabs = ['peta', 'teman', 'chat', 'profil'];
  const idx = tabs.indexOf(tab);
  if (idx >= 0) {
    var btns = document.querySelectorAll('.shortcut-btn');
    if (btns[idx]) btns[idx].classList.add('aktif');
  }

  const panelSamping = document.getElementById('panel-samping');
  const panelPeta = document.getElementById('panel-peta');
  const panelChat = document.getElementById('panel-chat');

  document.querySelectorAll('.panel-tab').forEach(function(el) { el.style.display = 'none'; });
  if (isMobile()) tutupDrawer();

  switch (tab) {
    case 'peta':
      if (!isMobile()) panelSamping.style.display = 'none';
      if (panelPeta) panelPeta.style.display = 'block';
      if (panelChat) panelChat.style.display = 'none';
      if (peta) setTimeout(function() { peta.invalidateSize(); }, 100);
      break;
    case 'teman':
      if (!isMobile()) panelSamping.style.display = 'flex';
      else bukaDrawer();
      if (panelPeta) panelPeta.style.display = 'block';
      if (panelChat) panelChat.style.display = 'none';
      var kteman = document.getElementById('konten-teman');
      if (kteman) kteman.style.display = 'flex';
      if (peta) setTimeout(function() { peta.invalidateSize(); }, 100);
      break;
    case 'chat':
      if (!isMobile()) panelSamping.style.display = 'flex';
      if (panelPeta) panelPeta.style.display = 'none';
      var kchat = document.getElementById('konten-chat-list');
      if (kchat) kchat.style.display = 'flex';
      if (panelChat) {
        panelChat.style.display = 'flex';
        if (!temanAktif && !groupAktif) {
          panelChat.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--teks-muda);"><div class="halaman-kosong"><div class="halaman-kosong-ikon">&#x1F4AC;</div><div>Pilih teman atau grup dari daftar</div></div></div>';
        }
      }
      break;
    case 'profil':
      if (!isMobile()) panelSamping.style.display = 'flex';
      else bukaDrawer();
      if (panelPeta) panelPeta.style.display = 'none';
      if (panelChat) panelChat.style.display = 'none';
      var kprofil = document.getElementById('konten-profil');
      if (kprofil) kprofil.style.display = 'block';
      break;
  }
}

function gantiTabTeman(tab, el) {
  document.querySelectorAll('.sidebar-tab').forEach(function(b) { b.classList.remove('aktif'); });
  el.classList.add('aktif');
  var tabDaftar = document.getElementById('tab-daftar-teman');
  var tabPerm = document.getElementById('tab-permintaan-teman');
  var tabGroup = document.getElementById('tab-daftar-group-teman');
  if (tabDaftar) tabDaftar.style.display = tab === 'daftar' ? 'block' : 'none';
  if (tabPerm) tabPerm.style.display = tab === 'permintaan' ? 'block' : 'none';
  if (tabGroup) tabGroup.style.display = tab === 'group' ? 'block' : 'none';
}

// ===================== PROFIL =====================

function isiProfil() {
  if (!pengguna) return;
  var profNama = document.getElementById('profil-nama');
  var profEmail = document.getElementById('profil-email');
  var profID = document.getElementById('profil-id');
  var profAvatar = document.getElementById('avatar-profil');

  if (profNama) profNama.textContent = pengguna.nama;
  if (profEmail) profEmail.textContent = pengguna.email || '';
  if (profID) profID.textContent = pengguna.kode || '#' + pengguna.id;
  if (profAvatar) {
    profAvatar.textContent = (pengguna.nama || '?').charAt(0).toUpperCase();
    profAvatar.style.background = pengguna.avatar_warna || '#22c55e';
    profAvatar.style.color = '#fff';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    });
  } catch {}
  localStorage.clear();
  window.location.href = '/login.html';
}

function salinID() {
  var id = pengguna ? (pengguna.kode || String(pengguna.id)) : '';
  if (!id) return;
  navigator.clipboard.writeText(id).then(function() {
    var badge = document.getElementById('user-id-badge');
    var asli = badge.textContent;
    badge.textContent = 'Disalin!';
    setTimeout(function() { badge.textContent = asli; }, 1500);
  }).catch(function() {});
}

function escHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}