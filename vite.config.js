import { defineConfig } from 'vite';

export default defineConfig({
  // Set this to your GitHub Pages repo name, e.g. '/bedrock/'
  // For a custom domain or root deployment, use '/'
  base: '/Budgeting-app/',

  build: {
    target:  'es2020',
    outDir:  'dist',
    // Emit source maps for production debugging
    sourcemap: true,
  },
});