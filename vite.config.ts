import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/campcaster/',
  plugins: [react(), UnoCSS()],
})
