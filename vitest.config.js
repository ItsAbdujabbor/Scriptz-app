import { defineConfig, mergeConfig } from 'vite'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      passWithNoTests: true,
    },
  })
)
