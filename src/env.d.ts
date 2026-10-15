/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_BASE_API?: string
  readonly VITE_PUBLIC_PATH?: string
  readonly VITE_TOKEN_KEY?: string
  readonly VITE_LANGUAGE_HEADER?: string
  readonly VITE_LEGACY_TOKEN_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
