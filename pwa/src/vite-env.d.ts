/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_CODE_GENERATOR_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}