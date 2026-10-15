import logo from './logo/logo.svg'
import background from './login/login.svg'
const ico = logo
import type { Branding } from '@/modules/authentication-manager-ui/types/basis'

export const defaultBrandingImages = { logo, ico, background } as const
export type BrandingImageKind = keyof typeof defaultBrandingImages

/** Display fallback only: bundled URLs must not be injected into the saved scope DTO. */
export function resolveBrandingImage(kind: BrandingImageKind, value?: string | null): string {
  return value?.trim() ? value : defaultBrandingImages[kind]
}

/** Resolve each image independently so a partially configured brand still uses the other defaults. */
export function resolveBrandingImages(value: Branding) {
  return {
    logo: resolveBrandingImage('logo', value.logo),
    ico: resolveBrandingImage('ico', value.ico),
    background: resolveBrandingImage('background', value.background),
  }
}
