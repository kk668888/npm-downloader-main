import { ref } from 'vue';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  color: 'green' | 'red' | 'yellow' | 'gray' | 'blue';
  icon?: string;
  timeout?: number;
}

let id = 0;
const toasts = ref<Toast[]>([]);

export function useToast() {
  const add = (title: string, options?: Partial<Omit<Toast, 'id'>>) => {
    const toast: Toast = {
      id: id++,
      title,
      color: options?.color || 'gray',
      description: options?.description,
      icon: options?.icon,
      timeout: options?.timeout ?? 3000,
    };

    toasts.value.push(toast);

    if (toast.timeout && toast.timeout > 0) {
      setTimeout(() => remove(toast.id), toast.timeout);
    }

    return toast.id;
  };

  const remove = (id: number) => {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index >= 0) toasts.value.splice(index, 1);
  };

  const clear = () => {
    toasts.value = [];
  };

  return { add, remove, clear, toasts };
}
