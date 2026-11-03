import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/NGO_REPORTING/' : '/',
  plugins: [react()],
}))
