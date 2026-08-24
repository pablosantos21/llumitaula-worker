// @ts-nocheck The template contains a token replaced during the build.
/* global caches, fetch, self, URL */
/* eslint-disable no-undef */

const CACHE_NAME = "llumitaula-shell-v1";
// Replaced with the build's root-relative asset list.
const PRECACHE_URLS = __PRECACHE_URLS__;

async function readCache(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request);
  } catch (error) {
    console.warn("PWA runtime cache read failed", error);
    return undefined;
  }
}

function cacheResponse(request, response, event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, response))
      .catch((error) => console.warn("PWA runtime cache write failed", error)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("llumitaula-shell-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    // Network-first navigation keeps deployed HTML current when online.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === "/") {
            cacheResponse("/index.html", response.clone(), event);
          }
          return response;
        })
        .catch(() =>
          readCache("/index.html").then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  if (!["script", "style", "image", "font"].includes(request.destination)) {
    return;
  }

  event.respondWith(
    readCache(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            cacheResponse(request, response.clone(), event);
          }
          return response;
        })
        .catch((error) => {
          console.warn("PWA asset network request failed", error);
          return Response.error();
        });
      return cached || network;
    }),
  );
});
