import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// viteSingleFile inlines JS/CSS into dist/index.html so the whole viewer is a
// single self-contained HTML file that tools/allure_waveform.py can inject the
// signal dataset into and attach to an Allure report.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
  },
});
