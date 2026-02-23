// Service worker minimal pour rendre l'app installable (PWA)
// Chrome/Android exige un SW pour afficher "Installer l'app" au lieu d'un simple raccourci
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
