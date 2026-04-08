/**
 * peta.js - Logika Peta GPS Interaktif (v3)
 * Google Maps style - Dark/Light theme - Kompas - Arah hadap
 */

let peta = null;
let markerSaya = null;
let markersTeman = {};
let lokasiku = null;
let temaSaatIni = localStorage.getItem('gl_tema_peta') || 'light';
let layerTile = null;
let headingSaya = null;
let posisiSebelumnya = null;
let kompasControl = null;
let temaBtnEl = null;

const TILE_LAYERS = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    bg: '#f5f3ef'
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    bg: '#1a1a2e'
  }
};

function inisialisasiPeta() {
  peta = L.map('peta', {
    zoomControl: false,
    attributionControl: true
  }).setView([-6.2, 106.8], 13);

  // Zoom control kiri bawah
  L.control.zoom({ position: 'bottomleft' }).addTo(peta);

  // Tambah tile layer sesuai tema
  terapkanTema(temaSaatIni);

  // Tambah kompas di pojok kanan atas
  tambahKompas();

  // Tombol toggle tema (di peta-kontrol)
  setTimeout(() => {
    temaBtnEl = document.getElementById('tombol-tema-peta');
    if (temaBtnEl) {
      perbaruiTombolTema();
      temaBtnEl.onclick = toggleTemaPeta;
    }
  }, 100);

  // Device orientation untuk heading
  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+
      document.addEventListener('click', function sekaliKlik() {
        DeviceOrientationEvent.requestPermission().then(perm => {
          if (perm === 'granted') {
            window.addEventListener('deviceorientation', handleOrientasi);
          }
        }).catch(() => {});
        document.removeEventListener('click', sekaliKlik);
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', handleOrientasi, { passive: true });
    }
  }

  return peta;
}

function handleOrientasi(e) {
  if (e.alpha !== null) {
    headingSaya = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (360 - e.alpha);
    if (markerSaya && lokasiku) {
      const nama = (typeof pengguna !== 'undefined' && pengguna) ? pengguna.nama : '?';
      markerSaya.setIcon(buatAvatarMarkerSaya(nama, headingSaya));
    }
    // Putar jarum kompas
    const jarum = document.getElementById('kompas-jarum');
    if (jarum) jarum.style.transform = `rotate(${-headingSaya}deg)`;
  }
}

function hitungHeadingDariGerakan(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return bearing;
}

function terapkanTema(tema) {
  if (layerTile) peta.removeLayer(layerTile);
  const cfg = TILE_LAYERS[tema];
  layerTile = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    maxZoom: 20,
    subdomains: 'abcd'
  });
  layerTile.addTo(peta);
  document.getElementById('peta').style.background = cfg.bg;
  temaSaatIni = tema;
  localStorage.setItem('gl_tema_peta', tema);
  if (temaBtnEl) perbaruiTombolTema();
}

function toggleTemaPeta() {
  terapkanTema(temaSaatIni === 'light' ? 'dark' : 'light');
}

function perbaruiTombolTema() {
  if (!temaBtnEl) return;
  temaBtnEl.innerHTML = temaSaatIni === 'light' ? '🌙' : '☀️';
  temaBtnEl.title = temaSaatIni === 'light' ? 'Mode Gelap' : 'Mode Terang';
}

function tambahKompas() {
  const KompasControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const div = L.DomUtil.create('div', 'leaflet-kompas');
      div.innerHTML = `
        <div class="kompas-lingkaran">
          <div class="kompas-label-n">N</div>
          <div class="kompas-label-s">S</div>
          <div class="kompas-label-e">E</div>
          <div class="kompas-label-w">W</div>
          <div class="kompas-jarum" id="kompas-jarum">
            <div class="jarum-utara"></div>
            <div class="jarum-selatan"></div>
          </div>
          <div class="kompas-titik-tengah"></div>
        </div>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  kompasControl = new KompasControl();
  peta.addControl(kompasControl);
}

// Avatar style Google Maps untuk diri sendiri
function buatAvatarMarkerSaya(nama, heading) {
  const inisial = (nama || '?').charAt(0).toUpperCase();
  const arrowRot = (heading !== null && heading !== undefined) ? heading : 0;
  const showArrow = (heading !== null && heading !== undefined);

  const html = `
    <div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
      ${showArrow ? `<div style="
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-bottom:14px solid #1a73e8;
        transform:rotate(${arrowRot}deg);
        transform-origin:center 100%;
        margin-bottom:-2px;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      "></div>` : ''}
      <div style="
        width:44px;height:44px;
        background:linear-gradient(135deg,#1a73e8,#0d47a1);
        border-radius:50%;
        border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:18px;color:white;
        box-shadow:0 4px 12px rgba(26,115,232,0.6),0 2px 4px rgba(0,0,0,0.3);
        position:relative;
        font-family:-apple-system,sans-serif;
      ">
        ${inisial}
        <div style="
          position:absolute;bottom:-1px;right:-1px;
          width:14px;height:14px;
          background:#34a853;border-radius:50%;
          border:2px solid #fff;
          animation:denyut 1.5s infinite;
        "></div>
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [44, showArrow ? 66 : 50],
    iconAnchor: [22, showArrow ? 66 : 50]
  });
}

// Avatar style Google Maps untuk teman
function buatAvatarMarkerTeman(nama, warna, isOnline, heading) {
  const inisial = (nama || '?').charAt(0).toUpperCase();
  const bgColor = isOnline ? (warna || '#374151') : '#9ca3af';
  const borderColor = isOnline ? '#fff' : '#d1d5db';
  const showArrow = (heading !== null && heading !== undefined);

  const html = `
    <div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
      ${showArrow ? `<div style="
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-bottom:12px solid ${bgColor};
        transform:rotate(${heading}deg);
        transform-origin:center 100%;
        margin-bottom:-2px;
        opacity:0.8;
      "></div>` : ''}
      <div style="
        width:40px;height:40px;
        background:${bgColor};
        border-radius:50%;
        border:3px solid ${borderColor};
        display:flex;align-items:center;justify-content:center;
        font-weight:700;font-size:16px;color:white;
        box-shadow:0 3px 10px rgba(0,0,0,0.3);
        position:relative;
        font-family:-apple-system,sans-serif;
      ">
        ${inisial}
        ${isOnline ? `<div style="
          position:absolute;bottom:-1px;right:-1px;
          width:12px;height:12px;
          background:#34a853;border-radius:50%;
          border:2px solid #fff;
        "></div>` : `<div style="
          position:absolute;bottom:-1px;right:-1px;
          width:12px;height:12px;
          background:#ef4444;border-radius:50%;
          border:2px solid #fff;
        "></div>`}
      </div>
      <div style="
        background:${temaSaatIni === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.7)'};
        backdrop-filter:blur(4px);
        color:white;
        font-size:11px;font-weight:600;
        padding:2px 8px;border-radius:10px;
        margin-top:3px;white-space:nowrap;
        max-width:80px;overflow:hidden;text-overflow:ellipsis;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
      ">${escHTMLPeta(nama)}</div>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [80, showArrow ? 76 : 66],
    iconAnchor: [40, showArrow ? 76 : 66]
  });
}

function escHTMLPeta(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function perbarui_marker_saya(lat, lon, nama, heading) {
  if (!peta) return;

  // Hitung heading dari gerakan jika tidak ada sensor
  let finalHeading = heading;
  if (finalHeading === undefined || finalHeading === null) {
    finalHeading = headingSaya;
  }
  if (finalHeading === null && posisiSebelumnya) {
    const dist = Math.hypot(lat - posisiSebelumnya.lat, lon - posisiSebelumnya.lon);
    if (dist > 0.00005) {
      finalHeading = hitungHeadingDariGerakan(posisiSebelumnya.lat, posisiSebelumnya.lon, lat, lon);
    }
  }
  posisiSebelumnya = { lat, lon };
  lokasiku = { lat, lon };

  const icon = buatAvatarMarkerSaya(nama, finalHeading);

  if (markerSaya) {
    markerSaya.setLatLng([lat, lon]);
    markerSaya.setIcon(icon);
  } else {
    markerSaya = L.marker([lat, lon], {
      icon,
      zIndexOffset: 1000
    }).addTo(peta)
      .bindTooltip('Saya', { permanent: false, direction: 'top', className: 'leaflet-tooltip-saya' });
  }

  const infoEl = document.getElementById('peta-info');
  const koordinatEl = document.getElementById('koordinat-saya');
  if (infoEl && koordinatEl) {
    infoEl.style.display = 'block';
    koordinatEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

function perbarui_marker_teman(userID, lat, lon, nama, isOnline, heading) {
  if (!peta) return;
  if (lat === null || lon === null) return;

  // Hitung heading dari pergerakan jika ada data sebelumnya
  let finalHeading = heading;
  if (finalHeading === undefined || finalHeading === null) {
    if (markersTeman[userID] && markersTeman[userID]._lastPos) {
      const prev = markersTeman[userID]._lastPos;
      const dist = Math.hypot(lat - prev.lat, lon - prev.lon);
      if (dist > 0.00005) {
        finalHeading = hitungHeadingDariGerakan(prev.lat, prev.lon, lat, lon);
      }
    }
  }

  const warna = isOnline ? '#374151' : '#9ca3af';
  const icon = buatAvatarMarkerTeman(nama, warna, isOnline, finalHeading);

  if (markersTeman[userID]) {
    markersTeman[userID].setLatLng([lat, lon]);
    markersTeman[userID].setIcon(icon);
    markersTeman[userID]._lastPos = { lat, lon };
  } else {
    markersTeman[userID] = L.marker([lat, lon], { icon })
      .addTo(peta)
      .bindTooltip(nama, { permanent: false, direction: 'top', className: 'leaflet-tooltip-teman' })
      .on('click', () => {
        if (typeof bukaChat === 'function') bukaChat(userID, nama);
      });
    markersTeman[userID]._lastPos = { lat, lon };
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
    peta.setView([lokasiku.lat, lokasiku.lon], 17, { animate: true });
  }
}

function tampilkanSemuaTeman() {
  if (!peta) return;
  const semua = [];
  if (lokasiku) semua.push([lokasiku.lat, lokasiku.lon]);
  Object.values(markersTeman).forEach(m => {
    const ll = m.getLatLng();
    if (ll) semua.push([ll.lat, ll.lng]);
  });
  if (semua.length > 0) {
    peta.fitBounds(semua, { padding: [60, 60], animate: true, maxZoom: 16 });
  }
}

function tandaiOffline(userID) {
  if (markersTeman[userID]) {
    const pos = markersTeman[userID].getLatLng();
    const namaDisplay = markersTeman[userID]._namaDisplay || '?';
    markersTeman[userID].setIcon(buatAvatarMarkerTeman(namaDisplay, '#9ca3af', false, null));
  }
}
