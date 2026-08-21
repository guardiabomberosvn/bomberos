// Service Worker del Sistema Bomberos.
// Corre en segundo plano en el navegador, incluso con la app cerrada o el
// celular bloqueado, esperando avisos push del servidor.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sistema Bomberos", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "🚒 Sistema Bomberos";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    tag: data.tag || "bomberos-alerta",
    requireInteraction: true,
    data: { url: data.url || "/emergencias" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación, abre (o enfoca) la app en la pantalla de
// emergencias.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/emergencias";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
