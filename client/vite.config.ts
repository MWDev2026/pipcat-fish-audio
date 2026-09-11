import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/start': 'http://localhost:7860',
      '/sessions': 'http://localhost:7860',
      '/api': 'http://localhost:7860',
      '/status': 'http://localhost:7860',
    }
  }
})
