'use client';
import { useEffect, useState } from 'react';

let manifest: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;
const listeners = new Set<() => void>();

function loadManifest() {
  if (manifest) return Promise.resolve(manifest);
  if (loading) return loading;
  loading = fetch('/api/logos')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((data: Record<string, string>) => {
      manifest = data;
      listeners.forEach((fn) => fn());
      return data;
    });
  return loading;
}

export function useLogo(key: string): { url: string | null; ready: boolean } {
  const [, force] = useState(0);

  useEffect(() => {
    if (manifest) return;
    const notify = () => force((n) => n + 1);
    listeners.add(notify);
    loadManifest();
    return () => { listeners.delete(notify); };
  }, []);

  if (!manifest) return { url: null, ready: false };
  return { url: manifest[key] ?? null, ready: true };
}
