import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import Input from '../src/components/ui/Input.vue'
import { setupComponentMocks } from './test-utils'

describe('Input.vue', () => {
  beforeEach(() => {
    setupComponentMocks()
  })

  const mountInput = (props = {}, slots = {}) => {
    return mount(Input, {
      props: {
        modelValue: '',
        ...props
      },
      slots,
      global: {
        stubs: {
          Icon: true
        }
      }
    })
  }

  describe('rendering', () => {
    it('should render input element', () => {
      const wrapper = mountInput()

      expect(wrapper.find('input').exists()).toBe(true)
    })

    it('should render with placeholder', () => {
      const wrapper = mountInput({ placeholder: 'Enter text' })

      expect(wrapper.find('input').attributes('placeholder')).toBe('Enter text')
    })

    it('should render with id', () => {
      const wrapper = mountInput({ id: 'test-input' })

      expect(wrapper.find('input').attributes('id')).toBe('test-input')
    })

    it('should render with type', () => {
      const wrapper = mountInput({ type: 'password' })

      expect(wrapper.find('input').attributes('type')).toBe('password')
    })

    it('should render with maxlength', () => {
      const wrapper = mountInput({ maxlength: 10 })

      expect(wrapper.find('input').attributes('maxlength')).toBe('10')
    })
  })

  describe('v-model binding', () => {
    it('should emit update:modelValue on input', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').setValue('test value')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['test value'])
    })

    it('should display modelValue', () => {
      const wrapper = mountInput({ modelValue: 'initial value' })

      expect(wrapper.find('input').element.value).toBe('initial value')
    })
  })

  describe('focus/blur events', () => {
    it('should emit focus event', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').trigger('focus')

      expect(wrapper.emitted('focus')).toBeTruthy()
    })

    it('should emit blur event', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').trigger('blur')

      expect(wrapper.emitted('blur')).toBeTruthy()
    })

    it('should apply focus styles on focus', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').trigger('focus')

      const inputClasses = wrapper.find('input').classes()
      expect(inputClasses.some(c => c.includes('ring'))).toBe(true)
    })

    it('should remove focus styles on blur', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').trigger('focus')
      await wrapper.find('input').trigger('blur')

      // After blur, focused state should be false
      expect(wrapper.find('input').classes().some(c => c.includes('ring-primary'))).toBe(false)
    })
  })

  describe('disabled state', () => {
    it('should render disabled input', () => {
      const wrapper = mountInput({ disabled: true })

      expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    })

    it('should apply disabled styles', () => {
      const wrapper = mountInput({ disabled: true })

      expect(wrapper.find('input').classes()).toContain('disabled:opacity-50')
    })
  })

  describe('readonly state', () => {
    it('should render readonly input', () => {
      const wrapper = mountInput({ readonly: true })

      expect(wrapper.find('input').attributes('readonly')).toBeDefined()
    })
  })

  describe('size variants', () => {
    it('should apply xs size classes', () => {
      const wrapper = mountInput({ size: 'xs' })

      expect(wrapper.find('input').classes()).toContain('text-xs')
      expect(wrapper.find('input').classes()).toContain('px-2')
      expect(wrapper.find('input').classes()).toContain('py-1')
    })

    it('should apply sm size classes', () => {
      const wrapper = mountInput({ size: 'sm' })

      expect(wrapper.find('input').classes()).toContain('text-xs')
      expect(wrapper.find('input').classes()).toContain('px-2.5')
    })

    it('should apply md size classes (default)', () => {
      const wrapper = mountInput()

      expect(wrapper.find('input').classes()).toContain('text-sm')
      expect(wrapper.find('input').classes()).toContain('px-3')
      expect(wrapper.find('input').classes()).toContain('py-2')
    })

    it('should apply lg size classes', () => {
      const wrapper = mountInput({ size: 'lg' })

      expect(wrapper.find('input').classes()).toContain('text-base')
      expect(wrapper.find('input').classes()).toContain('px-4')
    })

    it('should apply xl size classes', () => {
      const wrapper = mountInput({ size: 'xl' })

      expect(wrapper.find('input').classes()).toContain('text-lg')
      expect(wrapper.find('input').classes()).toContain('px-5')
    })
  })

  describe('color variants', () => {
    it('should apply gray color (default)', () => {
      const wrapper = mountInput()

      expect(wrapper.find('input').classes().some(c => c.includes('border-slate'))).toBe(true)
    })

    it('should apply primary color', () => {
      const wrapper = mountInput({ color: 'primary' })

      expect(wrapper.find('input').classes().some(c => c.includes('border-primary'))).toBe(true)
    })

    it('should apply red color', () => {
      const wrapper = mountInput({ color: 'red' })

      expect(wrapper.find('input').classes().some(c => c.includes('border-red'))).toBe(true)
    })

    it('should apply green color', () => {
      const wrapper = mountInput({ color: 'green' })

      expect(wrapper.find('input').classes().some(c => c.includes('border-green'))).toBe(true)
    })
  })

  describe('prefix and suffix', () => {
    it('should render prefix text', () => {
      const wrapper = mountInput({ prefix: '$' })

      expect(wrapper.text()).toContain('$')
    })

    it('should render suffix text', () => {
      const wrapper = mountInput({ suffix: '.00' })

      expect(wrapper.text()).toContain('.00')
    })

    it('should add padding for icon', () => {
      const wrapper = mountInput({ icon: 'i-heroicons-search' })

      expect(wrapper.find('input').classes()).toContain('pl-10')
    })

    it('should render prefix slot', () => {
      const wrapper = mountInput({}, {
        prefix: '<span class="custom-prefix">PRE</span>'
      })

      expect(wrapper.html()).toContain('custom-prefix')
    })

    it('should render suffix slot', () => {
      const wrapper = mountInput({}, {
        suffix: '<span class="custom-suffix">SUF</span>'
      })

      expect(wrapper.html()).toContain('custom-suffix')
    })
  })

  describe('keydown event', () => {
    it('should emit keydown event', async () => {
      const wrapper = mountInput()

      await wrapper.find('input').trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('keydown')).toBeTruthy()
    })
  })
})
