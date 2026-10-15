import project from '../../../project.config.json'
export const config = {
  ...project,
  apiBase: import.meta.env.VITE_APP_BASE_API || '/api',
  tokenHeader: import.meta.env.VITE_TOKEN_KEY || 'X-Access-Token',
  languageHeader: import.meta.env.VITE_LANGUAGE_HEADER || 'Accept-Language',
  legacyTokenKey: import.meta.env.VITE_LEGACY_TOKEN_KEY || 'X-Access-Token',
}
