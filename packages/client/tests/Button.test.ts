import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '../src/components/ui/Button.vue'
import { setupComponentMocks } from './test-utils'

describe('Button.vue', () => {
  beforeEach(() => {
    setupComponentMocks()
  })

  const mountButton = (props = {}, slots = {}) => {
    return mount(Button, {
      props,
      slots,
      global: {
        stubs: {
          Icon: true
        }
      }
    })
  }

  describe('rendering', () => {
    it('should render button element by default', () => {
      const wrapper = mountButton()

      expect(wrapper.find('button').exists()).toBe(true)
    })

    it('should render anchor when to prop is set', () => {
      const wrapper = mountButton({ to: 'https://example.com' })

      expect(wrapper.find('a').exists()).toBe(true)
    })

    it('should render slot content', () => {
      const wrapper = mountButton({}, { default: 'Click me' })

      expect(wrapper.text()).toContain('Click me')
    })

    it('should render icon when icon prop is set', () => {
      const wrapper = mountButton({ icon: 'i-heroicons-plus' })

      expect(wrapper.findComponent({ name: 'Icon' }).exists()).toBe(true)
    })
  })

  describe('click handling', () => {
    it('should emit click event', async () => {
      const wrapper = mountButton()

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeTruthy()
    })

    it('should not emit click when disabled', async () => {
      const wrapper = mountButton({ disabled: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeFalsy()
    })

    it('should not emit click when loading', async () => {
      const wrapper = mountButton({ loading: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeFalsy()
    })

    it('should not emit click when to is set (link mode)', async () => {
      const wrapper = mountButton({ to: 'https://example.com' })

      await wrapper.find('a').trigger('click')

      expect(wrapper.emitted('click')).toBeFalsy()
    })
  })

  describe('loading state', () => {
    it('should show spinner icon when loading', () => {
      const wrapper = mountButton({ loading: true })

      const icon = wrapper.findComponent({ name: 'Icon' })
      expect(icon.exists()).toBe(true)
    })

    it('should hide regular icon when loading', () => {
      const wrapper = mountButton({ icon: 'i-heroicons-plus', loading: true })

      // Should have Icon component with spinner icon
      const icons = wrapper.findAllComponents({ name: 'Icon' })
      expect(icons.length).toBe(1)
    })

    it('should be disabled when loading', () => {
      const wrapper = mountButton({ loading: true })

      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })
  })

  describe('disabled state', () => {
    it('should have disabled attribute', () => {
      const wrapper = mountButton({ disabled: true })

      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('should apply disabled styles', () => {
      const wrapper = mountButton({ disabled: true })

      expect(wrapper.find('button').classes()).toContain('disabled:opacity-50')
    })
  })

  describe('size variants', () => {
    it('should apply xs size classes', () => {
      const wrapper = mountButton({ size: 'xs' })

      expect(wrapper.find('button').classes()).toContain('text-xs')
      expect(wrapper.find('button').classes()).toContain('px-2')
    })

    it('should apply sm size classes', () => {
      const wrapper = mountButton({ size: 'sm' })

      expect(wrapper.find('button').classes()).toContain('text-xs')
      expect(wrapper.find('button').classes()).toContain('px-2.5')
    })

    it('should apply md size classes (default)', () => {
      const wrapper = mountButton()

      expect(wrapper.find('button').classes()).toContain('text-sm')
      expect(wrapper.find('button').classes()).toContain('px-3')
    })

    it('should apply lg size classes', () => {
      const wrapper = mountButton({ size: 'lg' })

      expect(wrapper.find('button').classes()).toContain('text-base')
      expect(wrapper.find('button').classes()).toContain('px-4')
    })

    it('should apply xl size classes', () => {
      const wrapper = mountButton({ size: 'xl' })

      expect(wrapper.find('button').classes()).toContain('text-lg')
      expect(wrapper.find('button').classes()).toContain('px-5')
    })
  })

  describe('color variants', () => {
    it('should apply primary color (default)', () => {
      const wrapper = mountButton()

      expect(wrapper.find('button').classes().some(c => c.includes('bg-primary'))).toBe(true)
    })

    it('should apply gray color', () => {
      const wrapper = mountButton({ color: 'gray' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-slate'))).toBe(true)
    })

    it('should apply red color', () => {
      const wrapper = mountButton({ color: 'red' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-red'))).toBe(true)
    })

    it('should apply green color', () => {
      const wrapper = mountButton({ color: 'green' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-green'))).toBe(true)
    })

    it('should apply yellow color', () => {
      const wrapper = mountButton({ color: 'yellow' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-amber'))).toBe(true)
    })

    it('should apply blue color', () => {
      const wrapper = mountButton({ color: 'blue' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-blue'))).toBe(true)
    })
  })

  describe('variant styles', () => {
    it('should apply solid variant (default)', () => {
      const wrapper = mountButton()

      expect(wrapper.find('button').classes().some(c => c.includes('bg-primary'))).toBe(true)
    })

    it('should apply outline variant', () => {
      const wrapper = mountButton({ variant: 'outline' })

      expect(wrapper.find('button').classes().some(c => c.includes('border'))).toBe(true)
    })

    it('should apply ghost variant', () => {
      const wrapper = mountButton({ variant: 'ghost' })

      expect(wrapper.find('button').classes().some(c => c.includes('hover:bg-primary'))).toBe(true)
    })

    it('should apply soft variant', () => {
      const wrapper = mountButton({ variant: 'soft' })

      expect(wrapper.find('button').classes().some(c => c.includes('bg-primary-50'))).toBe(true)
    })

    it('should apply subtle variant', () => {
      const wrapper = mountButton({ variant: 'subtle' })

      expect(wrapper.find('button').classes().some(c => c.includes('text-primary'))).toBe(true)
    })
  })

  describe('block prop', () => {
    it('should apply w-full class when block is true', () => {
      const wrapper = mountButton({ block: true })

      expect(wrapper.find('button').classes()).toContain('w-full')
    })
  })

  describe('square prop', () => {
    it('should apply p-0 class when square is true', () => {
      const wrapper = mountButton({ square: true })

      expect(wrapper.find('button').classes()).toContain('p-0')
    })
  })

  describe('link mode', () => {
    it('should render anchor with href', () => {
      const wrapper = mountButton({ to: 'https://example.com' })

      expect(wrapper.find('a').attributes('href')).toBe('https://example.com')
    })

    it('should set target _blank when blank is true', () => {
      const wrapper = mountButton({ to: 'https://example.com', blank: true })

      expect(wrapper.find('a').attributes('target')).toBe('_blank')
    })
  })

  describe('icon with text', () => {
    it('should add margin between icon and text', () => {
      const wrapper = mountButton({ icon: 'i-heroicons-plus' }, { default: 'Click' })

      expect(wrapper.find('span').classes()).toContain('ml-2')
    })
  })
})
