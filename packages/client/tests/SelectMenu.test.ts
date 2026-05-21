import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SelectMenu from '../src/components/ui/SelectMenu.vue'
import { setupComponentMocks } from './test-utils'

describe('SelectMenu.vue', () => {
  const options = [
    { label: 'Option 1', value: 'opt1' },
    { label: 'Option 2', value: 'opt2' },
    { label: 'Option 3', value: 'opt3' }
  ]

  beforeEach(() => {
    setupComponentMocks()
  })

  const mountSelect = (props = {}) => {
    return mount(SelectMenu, {
      props: {
        options,
        ...props
      },
      attachTo: document.body,
      global: {
        stubs: {
          Icon: true,
          Teleport: {
            template: '<div><slot /></div>'
          }
        }
      }
    })
  }

  describe('rendering', () => {
    it('should render trigger button', () => {
      const wrapper = mountSelect()

      expect(wrapper.find('button').exists()).toBe(true)
    })

    it('should display placeholder when no value selected', () => {
      const wrapper = mountSelect({ placeholder: 'Choose option' })

      expect(wrapper.text()).toContain('Choose option')
    })

    it('should display selected option label', () => {
      const wrapper = mountSelect({ modelValue: 'opt1' })

      expect(wrapper.text()).toContain('Option 1')
    })

    it('should display multiple selected labels', () => {
      const wrapper = mountSelect({
        modelValue: ['opt1', 'opt2'],
        multiple: true
      })

      expect(wrapper.text()).toContain('Option 1')
      expect(wrapper.text()).toContain('Option 2')
    })
  })

  describe('toggle dropdown', () => {
    it('should open dropdown on click', async () => {
      const wrapper = mountSelect()

      await wrapper.find('button').trigger('click')
      await nextTick()

      expect(wrapper.vm.open).toBe(true)
    })

    it('should close dropdown on second click', async () => {
      const wrapper = mountSelect()

      await wrapper.find('button').trigger('click')
      await nextTick()

      await wrapper.find('button').trigger('click')
      await nextTick()

      expect(wrapper.vm.open).toBe(false)
    })
  })

  describe('single selection', () => {
    it('should emit update:modelValue on selection', async () => {
      const wrapper = mountSelect()

      await wrapper.find('button').trigger('click')
      await nextTick()

      const option = wrapper.find('label')
      await option.trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['opt1'])
    })

    it('should close dropdown after selection', async () => {
      const wrapper = mountSelect()

      await wrapper.find('button').trigger('click')
      await nextTick()

      const option = wrapper.find('label')
      await option.trigger('click')

      expect(wrapper.vm.open).toBe(false)
    })

    it('should show check icon for selected option', async () => {
      const wrapper = mountSelect({ modelValue: 'opt1' })

      await wrapper.find('button').trigger('click')
      await nextTick()

      const icons = wrapper.findAllComponents({ name: 'Icon' })
      // Should have chevron icon + check icon
      expect(icons.length).toBeGreaterThan(1)
    })
  })

  describe('multiple selection', () => {
    it('should render checkboxes when multiple is true', async () => {
      const wrapper = mountSelect({ multiple: true })

      await wrapper.find('button').trigger('click')
      await nextTick()

      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    })

    it('should toggle selection on checkbox click', async () => {
      const wrapper = mountSelect({ multiple: true, modelValue: [] })

      await wrapper.find('button').trigger('click')
      await nextTick()

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.trigger('change')

      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['opt1']])
    })

    it('should remove from selection when already selected', async () => {
      const wrapper = mountSelect({ multiple: true, modelValue: ['opt1'] })

      await wrapper.find('button').trigger('click')
      await nextTick()

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.trigger('change')

      expect(wrapper.emitted('update:modelValue')![0]).toEqual([[]])
    })

    it('should not close dropdown after selection in multiple mode', async () => {
      const wrapper = mountSelect({ multiple: true })

      await wrapper.find('button').trigger('click')
      await nextTick()

      const option = wrapper.find('label')
      await option.trigger('click')

      expect(wrapper.vm.open).toBe(true)
    })
  })

  describe('size variants', () => {
    it('should apply xs size classes', () => {
      const wrapper = mountSelect({ size: 'xs' })

      expect(wrapper.find('button').classes()).toContain('text-xs')
      expect(wrapper.find('button').classes()).toContain('px-2')
    })

    it('should apply sm size classes (default)', () => {
      const wrapper = mountSelect()

      expect(wrapper.find('button').classes()).toContain('text-xs')
      expect(wrapper.find('button').classes()).toContain('px-2.5')
    })

    it('should apply md size classes', () => {
      const wrapper = mountSelect({ size: 'md' })

      expect(wrapper.find('button').classes()).toContain('text-sm')
      expect(wrapper.find('button').classes()).toContain('px-3')
    })

    it('should apply lg size classes', () => {
      const wrapper = mountSelect({ size: 'lg' })

      expect(wrapper.find('button').classes()).toContain('text-base')
      expect(wrapper.find('button').classes()).toContain('px-4')
    })
  })

  describe('outside click', () => {
    it('should close dropdown on outside click', async () => {
      const wrapper = mountSelect()

      await wrapper.find('button').trigger('click')
      await nextTick()

      expect(wrapper.vm.open).toBe(true)

      // Simulate outside click
      document.body.click()
      await nextTick()

      expect(wrapper.vm.open).toBe(false)
    })
  })

  describe('isSelected', () => {
    it('should return true for selected value in single mode', () => {
      const wrapper = mountSelect({ modelValue: 'opt1' })

      expect(wrapper.vm.isSelected('opt1')).toBe(true)
      expect(wrapper.vm.isSelected('opt2')).toBe(false)
    })

    it('should return true for selected value in multiple mode', () => {
      const wrapper = mountSelect({ multiple: true, modelValue: ['opt1', 'opt2'] })

      expect(wrapper.vm.isSelected('opt1')).toBe(true)
      expect(wrapper.vm.isSelected('opt3')).toBe(false)
    })
  })

  describe('displayLabel', () => {
    it('should return placeholder when no selection in multiple mode', () => {
      const wrapper = mountSelect({ multiple: true, modelValue: [], placeholder: 'Select items' })

      expect(wrapper.vm.displayLabel).toBe('Select items')
    })

    it('should return comma-separated labels for multiple selection', () => {
      const wrapper = mountSelect({ multiple: true, modelValue: ['opt1', 'opt2'] })

      expect(wrapper.vm.displayLabel).toBe('Option 1, Option 2')
    })
  })
})
