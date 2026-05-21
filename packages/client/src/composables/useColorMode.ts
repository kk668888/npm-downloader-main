import { ref, watch, type Ref } from 'vue';

type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'color-mode';

// Shared state — 默认暗色主题
const mode = ref<ColorMode>('dark');

export function useColorMode(): Ref<ColorMode> & { preference: Ref<ColorMode> } {
  // 从 localStorage 恢复用户偏好（仅首次）
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (stored === 'light' || stored === 'dark') {
      mode.value = stored;
    }
  }

  const updateDocument = (val: ColorMode) => {
    const root = document.documentElement;
    if (val === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  };

  // Initial update
  if (typeof window !== 'undefined') {
    updateDocument(mode.value);
  }

  watch(mode, (newVal) => {
    localStorage.setItem(STORAGE_KEY, newVal);
    updateDocument(newVal);
  });

  return mode as Ref<ColorMode> & { preference: Ref<ColorMode> };
}
