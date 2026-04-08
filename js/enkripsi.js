/**
 * enkripsi.js - Enkripsi End-to-End untuk GeoLocate
 * Menggunakan Web Crypto API (SubtleCrypto)
 * ECDH untuk pertukaran kunci, AES-GCM untuk enkripsi pesan
 */

const Enkripsi = {
  // Buat pasangan kunci ECDH
  async buatKunciPasangan() {
    const pasangan = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    return pasangan;
  },

  // Export kunci publik ke format Base64
  async eksporKunciPublik(kunciPublik) {
    const raw = await crypto.subtle.exportKey('raw', kunciPublik);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  },

  // Import kunci publik dari Base64
  async imporKunciPublik(base64) {
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'raw', raw,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
  },

  // Export kunci privat untuk disimpan di localStorage
  async eksporKunciPrivat(kunciPrivat) {
    const jwk = await crypto.subtle.exportKey('jwk', kunciPrivat);
    return JSON.stringify(jwk);
  },

  // Import kunci privat dari localStorage
  async imporKunciPrivat(jwkStr) {
    const jwk = JSON.parse(jwkStr);
    return crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    );
  },

  // Buat kunci bersama dari ECDH
  async buatKunciRahasia(kunciPrivatKita, kunciPublikMereka) {
    return crypto.subtle.deriveKey(
      { name: 'ECDH', public: kunciPublikMereka },
      kunciPrivatKita,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Enkripsi pesan
  async enkripsi(pesan, kunciRahasia) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(pesan);
    const terenkripsi = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      kunciRahasia,
      encoded
    );
    const gabungan = new Uint8Array(iv.length + terenkripsi.byteLength);
    gabungan.set(iv, 0);
    gabungan.set(new Uint8Array(terenkripsi), iv.length);
    return btoa(String.fromCharCode(...gabungan));
  },

  // Dekripsi pesan
  async dekripsi(base64, kunciRahasia) {
    try {
      const gabungan = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const iv = gabungan.slice(0, 12);
      const data = gabungan.slice(12);
      const decoded = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        kunciRahasia,
        data
      );
      return new TextDecoder().decode(decoded);
    } catch {
      return '[Pesan terenkripsi - tidak dapat didekripsi]';
    }
  },

  // Simpan dan muat kunci dari localStorage
  async inisialisasi(userID) {
    const kunciKey = `gl_key_${userID}`;
    const kunciPublikKey = `gl_pubkey_${userID}`;

    let kunciPrivat, kunciPublik, kunciPublikBase64;

    const tersimpan = localStorage.getItem(kunciKey);
    if (tersimpan) {
      try {
        kunciPrivat = await this.imporKunciPrivat(tersimpan);
        kunciPublikBase64 = localStorage.getItem(kunciPublikKey);
        kunciPublik = await this.imporKunciPublik(kunciPublikBase64);
      } catch {
        localStorage.removeItem(kunciKey);
        localStorage.removeItem(kunciPublikKey);
      }
    }

    if (!kunciPrivat) {
      const pasangan = await this.buatKunciPasangan();
      kunciPrivat = pasangan.privateKey;
      kunciPublik = pasangan.publicKey;
      kunciPublikBase64 = await this.eksporKunciPublik(kunciPublik);

      localStorage.setItem(kunciKey, await this.eksporKunciPrivat(kunciPrivat));
      localStorage.setItem(kunciPublikKey, kunciPublikBase64);
    }

    this.kunciPrivat = kunciPrivat;
    this.kunciPublikBase64 = kunciPublikBase64;
    this.kunciRahasiaCache = {};

    return kunciPublikBase64;
  },

  // Dapatkan kunci rahasia untuk percakapan dengan teman
  async kunciUntukTeman(friendID, token) {
    if (this.kunciRahasiaCache[friendID]) {
      return this.kunciRahasiaCache[friendID];
    }

    try {
      const res = await fetch(`/api/keys/get?user_id=${friendID}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;

      const data = await res.json();
      const kunciPublikTeman = await this.imporKunciPublik(data.public_key);
      const kunciRahasia = await this.buatKunciRahasia(this.kunciPrivat, kunciPublikTeman);
      this.kunciRahasiaCache[friendID] = kunciRahasia;
      return kunciRahasia;
    } catch {
      return null;
    }
  }
};
