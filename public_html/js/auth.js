/**
 * auth.js - Utilitas autentikasi GeoLocate
 */

function getToken() {
  return localStorage.getItem('gl_token');
}

function getUser() {
  const u = localStorage.getItem('gl_user');
  return u ? JSON.parse(u) : null;
}

function clearSession() {
  localStorage.removeItem('gl_token');
  localStorage.removeItem('gl_user');
}

function cekSudahLogin(redirect) {
  const token = getToken();
  if (token && redirect) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => {
      if (r.ok && redirect) window.location.href = redirect;
    }).catch(() => {});
  }
  return !!token;
}
