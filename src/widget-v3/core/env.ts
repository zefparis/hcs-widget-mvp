/**
 * HCS-U7 Widget v3 — Environment detection
 */

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function getHostname(): string {
  try {
    return window.location.hostname;
  } catch {
    return '';
  }
}

export function getHref(): string {
  try {
    return window.location.href;
  } catch {
    return '';
  }
}

export function getReferrer(): string {
  try {
    return document.referrer;
  } catch {
    return '';
  }
}

export function supportsPerformance(): boolean {
  return typeof performance !== 'undefined' && typeof performance.now === 'function';
}

export function supportsFetch(): boolean {
  return typeof fetch === 'function';
}

export function supportsLocalStorage(): boolean {
  try {
    const k = '__hcs_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function supportsSessionStorage(): boolean {
  try {
    const k = '__hcs_test__';
    sessionStorage.setItem(k, '1');
    sessionStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
