<template>
  <div class="space-y-3">
    <!-- Package Input with Autocomplete -->
    <div class="relative">
      <Input
        ref="inputElement"
        v-model="inputValue"
        :disabled="busy"
        placeholder="例如 react, vue@3.0.0"
        icon="i-heroicons-cube"
        size="md"
        @keydown.enter="handleEnter"
        @keydown.down="focusNextSuggestion"
        @keydown.up="focusPrevSuggestion"
        @keydown.escape="closeSuggestions"
        @focus="handleFocus"
        @blur="handleBlur"
      />

      <!-- Suggestions Dropdown (Portal to body) -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition ease-out duration-200"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-150"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="showSuggestions && inputPosition"
            class="fixed z-[100] bg-base-900 border border-base-700 rounded-lg shadow-soft-lg overflow-hidden"
            :style="dropdownStyle"
          >
            <div class="max-h-64 overflow-y-auto scrollbar-thin">
              <div
                v-for="(pkg, index) in suggestions"
                :key="pkg.name"
                class="px-3 py-2 cursor-pointer hover:bg-base-800 transition-colors"
                :class="{ 'bg-base-800': focusedIndex === index }"
                @mousedown="selectSuggestion(pkg)"
                @mouseenter="focusedIndex = index"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-xs text-base-200 truncate">
                      {{ pkg.name }}
                    </div>
                    <div class="text-[10px] text-base-500 truncate">
                      {{ pkg.description }}
                    </div>
                  </div>
                  <div class="text-[10px] text-base-600 ml-2 font-mono">
                    {{ pkg.version }}
                  </div>
                </div>
              </div>
            </div>
            <div v-if="isSearching" class="px-3 py-2 text-xs text-base-500 text-center">
              搜索中...
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>

    <!-- Download Button -->
    <Button
      block
      size="md"
      :loading="downloading"
      :disabled="!inputValue.trim() || busy"
      icon="i-heroicons-arrow-down-tray"
      @click="$emit('download')"
    >
      下载包
    </Button>
  </div>
</template>

<script setup lang="ts">
import Button from './ui/Button.vue';
import Input from './ui/Input.vue';

interface NpmPackage {
  name: string;
  version: string;
  description: string;
}

const props = defineProps<{
  packageName: string;
  downloading: boolean;
  /** 有任何任务进行中时为 true，禁用整个面板 */
  busy: boolean;
  taskId: string | null;
  statusMessage: string;
  progress: { current: number; total: number } | null;
  downloadUrl: string;
}>();

const emit = defineEmits<{
  (e: "update:packageName", value: string): void;
  (e: "download"): void;
  (e: "viewLogs", taskId: string): void;
}>();

const inputValue = computed({
  get: () => props.packageName,
  set: (value) => emit("update:packageName", value),
});

const suggestions = ref<NpmPackage[]>([]);
const showSuggestions = ref(false);
const isSearching = ref(false);
const focusedIndex = ref(-1);
const searchAbortController = ref<AbortController | null>(null);
const searchTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const inputElement = ref<{ inputRef: { value: HTMLInputElement | null } } | null>(null);
const inputPosition = ref<{ top: number; left: number; width: number } | null>(null);

const dropdownStyle = computed(() => {
  if (!inputPosition.value) return {};
  return {
    top: `${inputPosition.value.top + 40}px`,
    left: `${inputPosition.value.left}px`,
    width: `${inputPosition.value.width}px`,
  };
});

// Get input element position
const updateInputPosition = () => {
  const input = inputElement.value?.inputRef?.value || (inputElement.value as any)?.$el?.querySelector('input');
  if (input) {
    const rect = input.getBoundingClientRect();
    inputPosition.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
    };
  }
};

const searchDebounceMs = 300;
const minSearchLength = 2;

// Search npm packages
const searchPackages = async (query: string) => {
  if (query.length < minSearchLength) {
    suggestions.value = [];
    showSuggestions.value = false;
    return;
  }

  // Cancel previous search
  if (searchAbortController.value) {
    searchAbortController.value.abort();
  }

  isSearching.value = true;
  searchAbortController.value = new AbortController();
  updateInputPosition();

  try {
    const response = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`,
      {
        signal: searchAbortController.value.signal,
      }
    );

    if (!response.ok) {
      throw new Error("Search failed");
    }

    const data = await response.json();
    suggestions.value = data.objects.map((obj: any) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description || "",
    }));
    showSuggestions.value = true;
    // Update position after results arrive
    updateInputPosition();
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") {
      console.error("Search error:", error);
    }
  } finally {
    isSearching.value = false;
  }
};

// Debounced search
const debouncedSearch = (query: string) => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }

  searchTimeout.value = setTimeout(() => {
    searchPackages(query);
  }, searchDebounceMs);
};

// Watch input changes
watch(inputValue, (newValue) => {
  focusedIndex.value = -1;

  // Don't search if it looks like a full spec (name@version)
  if (newValue && !newValue.includes("@")) {
    debouncedSearch(newValue);
  } else {
    showSuggestions.value = false;
  }
});

const handleEnter = () => {
  if (focusedIndex.value >= 0 && suggestions.value[focusedIndex.value]) {
    selectSuggestion(suggestions.value[focusedIndex.value]);
  } else {
    emit("download");
  }
  showSuggestions.value = false;
};

const selectSuggestion = (pkg: NpmPackage) => {
  inputValue.value = pkg.name;
  showSuggestions.value = false;
  focusedIndex.value = -1;
};

const focusNextSuggestion = () => {
  if (suggestions.value.length > 0) {
    focusedIndex.value = (focusedIndex.value + 1) % suggestions.value.length;
  }
};

const focusPrevSuggestion = () => {
  if (suggestions.value.length > 0) {
    focusedIndex.value =
      focusedIndex.value <= 0
        ? suggestions.value.length - 1
        : focusedIndex.value - 1;
  }
};

const closeSuggestions = () => {
  showSuggestions.value = false;
  focusedIndex.value = -1;
};

const handleFocus = () => {
  updateInputPosition();
  if (inputValue.value && inputValue.value.length >= minSearchLength && suggestions.value.length > 0) {
    showSuggestions.value = true;
  }
};

const handleBlur = () => {
  // Delay closing to allow click events to complete
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};

// Update position on window resize
onMounted(() => {
  window.addEventListener('resize', updateInputPosition);
  window.addEventListener('scroll', updateInputPosition);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateInputPosition);
  window.removeEventListener('scroll', updateInputPosition);
  if (searchAbortController.value) {
    searchAbortController.value.abort();
  }
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
});
</script>
