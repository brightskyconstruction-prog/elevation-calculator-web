import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',

  build: {
    // Raise the chunk size warning threshold slightly — Firebase is legitimately large
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Split Firebase into its own chunk so it only loads when cloud sync
        // is active. Guest-mode users never fetch this chunk.
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
        },
      },
    },
  },

  // Improves dev-server cold start time by pre-bundling heavy dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand'],
  },
});
