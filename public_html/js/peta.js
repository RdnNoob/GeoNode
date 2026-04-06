/**
 * peta.js - Logika Peta GPS Interaktif
 * Menggunakan Leaflet.js dengan OpenStreetMap
 */

let peta = null;
let markerSaya = null;
let markersTeman = {};
let lokasiku = null;

function inisialisasiPeta() {
  peta = L.map('peta', {
    zoomControl: true,
    attributionControl: true
  }).setView([-6.2, 106.8], 12); // Default: Jakarta

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(peta);

  return peta;
}

function buatAvatarMarker(warna, nama, isSaya) {
  const inisial = nama.charAt(0).toUpperCase();
  const html = `
    <div style="
      width: 40px;
      height: 40px;
      background: ${warna};
      border-radius: 50%;
      border: 3px solid ${isSaya ? '#22c55e' : '#fff'};
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: white;
      box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      position: relative;
    ">
      ${inisial}
      ${isSaya ? '<div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;background:#22c55e;border-radius:50%;border:2px solid #1e293b;animation:denyut 1.5s infinite;"></div>' : ''}
    </div>
    ${!isSaya ? `<div style="
      background: rgba(0,0,0,0.75);
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      text-align: center;
      margin-top: 2px;
      white-space: nowrap;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    ">${nama}</div>` : ''}
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [40, isSaya ? 40 : 60],
    iconAnchor: [20, isSaya ? 20 : 40]
  });
}

function perbarui_marker_saya(lat, lon, nama) {
  if (!peta) return;
  lokasiku = { lat, lon };

  if (markerSaya) {
    markerSaya.setLatLng([lat, lon]);
    markerSaya.setIcon(buatAvatarMarker('#22c55e', nama, true));
  } else {
    markerSaya = L.marker([lat, lon], {
      icon: buatAvatarMarker('#22c55e', nama, true),
      zIndexOffset: 1000
    })
    .addTo(peta)
    .bindTooltip('Saya', { permanent: false, direction: 'top' });
  }

  const infoEl = document.getElementById('peta-info');
  const koordinatEl = document.getElementById('koordinat-saya');
  if (infoEl && koordinatEl) {
    infoEl.style.display = 'block';
    koordinatEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

function perbarui_marker_teman(userID, lat, lon, nama, isOnline) {
  if (!peta) return;

  let warna = isOnline ? '#111827' : '#ef4444';

  if (markersTeman[userID]) {
    if (lat !== null && lon !== null) {
      markersTeman[userID].setLatLng([lat, lon]);
      markersTeman[userID].setIcon(buatAvatarMarker(warna, nama, false));
    }
  } else if (lat !== null && lon !== null) {
    markersTeman[userID] = L.marker([lat, lon], {
      icon: buatAvatarMarker(warna, nama, false)
    })
    .addTo(peta)
    .on('click', () => {
      if (typeof bukaChat === 'function') bukaChat(userID, nama);
    });
  }
}

function hapusMarkerTeman(userID) {
  if (markersTeman[userID]) {
    peta.removeLayer(markersTeman[userID]);
    delete markersTeman[userID];
  }
}

function pusatKeLokasiku() {
  if (lokasiku && peta) {
    peta.setView([lokasiku.lat, lokasiku.lon], 16, { animate: true });
  }
}

function tampilkanSemuaTeman() {
  if (!peta) return;
  const semua = [];
  if (lokasiku) semua.push([lokasiku.lat, lokasiku.lon]);
  Object.values(markersTeman).forEach(m => semua.push(m.getLatLng()));
  if (semua.length > 0) {
    peta.fitBounds(semua, { padding: [50, 50], animate: true });
  }
}

function tandaiOffline(userID) {
  if (markersTeman[userID]) {
    const pos = markersTeman[userID].getLatLng();
    const nama = markersTeman[userID].options.namaDisplay || '?';
    markersTeman[userID].setIcon(buatAvatarMarker('#ef4444', nama, false));
  }
}
