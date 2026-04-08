const VAPID_PUBLIC_KEY = 'BKLSQwXALRS92YqtJsjUCZZUhTmUfElrZZc0SCzJ5U9zCKdGpg0CiJIA_-3U2vjdUFC-OAXTyeuMeH7CxA__Nv0';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications tidak didukung browser ini');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('Service Worker terdaftar');

    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Izin notifikasi ditolak');
      return;
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('Push subscription berhasil dibuat');
    }

    const subJSON = subscription.toJSON();
    const t = localStorage.getItem('gl_token');
    if (!t) return;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + t
      },
      body: JSON.stringify({
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys.p256dh,
        auth: subJSON.keys.auth
      })
    });

    console.log('Push subscription disimpan ke server');
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open_chat' && e.data.fromId) {
      if (typeof bukaChat === 'function') {
        bukaChat(e.data.fromId, e.data.fromNama || 'Teman');
      }
    }
    if (e.data && e.data.type === 'open_group_chat' && e.data.groupId) {
      if (typeof bukaGroupChat === 'function') {
        bukaGroupChat(e.data.groupId, e.data.groupNama || 'Grup', false, 'member');
      }
    }
  });
}
