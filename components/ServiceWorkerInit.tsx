'use client';

import { useEffect } from 'react';

/**
 * Registers the app-shell service worker (`public/sw.js`) once, in the browser.
 *
 * Mounted next to `MonitoringInit` in the root layout for the same reason: the
 * worker has to be *registered* before it can help, and only the browser can do
 * that. Registration waits for the `load` event so the first paint never has to
 * compete with the worker's install for the network.
 *
 * Failure is silent by design - a private window, a browser without service
 * worker support, or a refused registration all leave the app running exactly as
 * it did before.
 */
export default function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Nothing to recover: the app works without a worker, it is just not
           installable and not resilient to a cold offline load. */
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
