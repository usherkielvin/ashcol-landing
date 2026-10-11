import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // npm run dev has no Vercel functions — proxy /api/chat to a deployed origin (no trailing slash)
  const publicAiProxyOrigin =
    env.PUBLIC_AI_DEV_PROXY?.trim() ||
    env.VITE_PUBLIC_AI_DEV_PROXY?.trim() ||
    ''

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: publicAiProxyOrigin
        ? {
            '/api/chat': {
              target: publicAiProxyOrigin,
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
  }
})
