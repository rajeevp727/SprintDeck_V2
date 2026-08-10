

export function initPerf() {
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2;
    const lowCores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2;
    const saveData = nav.connection?.saveData === true;

    if (reducedMotion || lowMemory || lowCores || saveData) {
      document.documentElement.setAttribute('data-perf', 'lite');
    }
  } catch { void 0; }
}
