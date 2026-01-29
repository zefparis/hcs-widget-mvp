/**
 * Détection DevTools - Module de sécurité
 * Détecte si les outils de développement sont ouverts
 */

let devtoolsDetected = false;
let detectionInterval: NodeJS.Timeout | null = null;

export function detectDevTools(onDetected: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const threshold = 160;

  const checkWindowSize = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;

    if ((widthThreshold || heightThreshold) && !devtoolsDetected) {
      devtoolsDetected = true;
      onDetected();
    }
  };

  // Méthode 1: Vérification taille fenêtre
  checkWindowSize();
  window.addEventListener('resize', checkWindowSize);

  // Méthode 2: Console timing detection
  const checkConsole = () => {
    const start = performance.now();
    // Cette technique exploite le fait que console.log est plus lent avec DevTools ouvert
    for (let i = 0; i < 100; i++) {
      console.log('');
      console.clear();
    }
    const end = performance.now();

    if (end - start > 100 && !devtoolsDetected) {
      devtoolsDetected = true;
      onDetected();
    }
  };

  // Méthode 3: Object getter trap
  const checkObjectTrap = () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'id', {
      get: function () {
        if (!devtoolsDetected) {
          devtoolsDetected = true;
          onDetected();
        }
        return '';
      },
    });

    console.log('%c', element);
    console.clear();
  };

  // Exécuter les vérifications périodiquement
  detectionInterval = setInterval(() => {
    checkWindowSize();
    try {
      checkObjectTrap();
    } catch {
      // Ignorer les erreurs
    }
  }, 2000);

  // Retourner fonction de cleanup
  return () => {
    window.removeEventListener('resize', checkWindowSize);
    if (detectionInterval) {
      clearInterval(detectionInterval);
    }
  };
}

export function isDevToolsOpen(): boolean {
  return devtoolsDetected;
}

export function resetDevToolsDetection(): void {
  devtoolsDetected = false;
}
