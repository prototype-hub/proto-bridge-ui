import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  brandingApi,
  resolveBrandingImages,
  type Branding,
} from '@/modules/authentication-manager-ui'
import { config } from '@/shared/config'
export const useBranding = defineStore('branding', () => {
  const front = ref<Branding>({})
  const title = computed(() => front.value.title || config.displayName)
  const images = computed(() => resolveBrandingImages(front.value))
  // Keep persisted values separate from display defaults, and reset an empty favicon to its default.
  function apply(value: Branding) {
    front.value = value
    window.document.title = value.title || config.displayName
    let icon = window.document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) {
      icon = window.document.createElement('link')
      icon.rel = 'icon'
      window.document.head.append(icon)
    }
    icon.href = images.value.ico
  }
  async function load() {
    try {
      apply(await brandingApi.front())
    } catch {
      apply({})
    }
  }
  // Branding loads asynchronously; show bundled assets on the first render as well.
  apply({})
  return { front, title, images, load, apply }
})
