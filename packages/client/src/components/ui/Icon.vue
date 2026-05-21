<template>
  <component :is="iconComponent" :class="sizeClasses" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as HeroIconsOutline from '@heroicons/vue/24/outline';
import * as HeroIconsSolid from '@heroicons/vue/24/solid';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  }>(),
  {
    size: 'md',
  }
);

const sizeClasses = computed(() => {
  const sizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
    '2xl': 'w-10 h-10',
  };
  return sizes[props.size];
});

const iconComponent = computed(() => {
  const name = props.name.replace('i-heroicons-', '');
  const pascalName = toPascalCase(name) + 'Icon';

  // Check if it's a solid icon (ends with 20solid)
  if (name.endsWith('20solid')) {
    const baseName = name.replace('20solid', '');
    return (HeroIconsSolid as any)[toPascalCase(baseName) + 'Icon'];
  }

  return (HeroIconsOutline as any)[pascalName];
});

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
</script>
