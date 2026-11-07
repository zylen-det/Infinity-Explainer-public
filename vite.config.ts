import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from "vite";

// Vite 8 + Rolldown uses the OXC compiler for JSX by default.
// The tsconfig sets jsx: "react-jsx" (automatic runtime), so
// OXC picks it up and handles JSX compilation without needing
// @vitejs/plugin-react. This avoids the $RefreshSig$ CJS hoisting
// conflict that occurs when the React plugin's Fast Refresh transform
// interacts with Rolldown's import hoisting for react/react-dom.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { 'codemirror-markdown-hybrid': new URL('./node_modules/codemirror-markdown-hybrid/lib/index.js', import.meta.url).pathname } },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
      // Disable Fast Refresh to avoid the CJS hoisting bug.
      refresh: false,
    },
  },

  server: {
    host: '0.0.0.0',
    cors: true,
  },
  build: {
    rolldownOptions: { input: { app: 'index.html' } },
  },
});
