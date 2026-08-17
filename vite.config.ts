import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // 相对路径。GitHub Pages 的项目站点挂在 /<repo>/ 下面，
  // 用绝对路径的话所有资源都会 404，而且本地怎么试都试不出来。
  // 这个项目没有前端路由，所以 './' 是最省事也最稳的选择。
  base: './',
})
