import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages のプロジェクトページは https://<user>.github.io/<repo>/ 配下になるため、
// CI(GitHub Actions)からのビルド時のみ base をリポジトリ名に合わせる。
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/yubi-labo/' : '/',
  plugins: [react()],
});
