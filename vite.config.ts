import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // 相对路径。GitHub Pages 的项目站点挂在 /<repo>/ 下面，
  // 用绝对路径的话所有资源都会 404，而且本地怎么试都试不出来。
  // 这个项目没有前端路由，所以 './' 是最省事也最稳的选择。
  base: './',
  build: {
    rollupOptions: {
      output: {
        /**
         * 把 three 那一坨单独切出来。
         *
         * 它是包里最大的一块，而且**几乎不变** —— 单独成块之后，
         * 我改一行界面代码，回访的人只用重新下那几十 KB 的业务包，
         * 而不是把八百多 KB 的引擎再拉一遍。
         *
         * 这比"减小总体积"更值：总量是省不掉的，缓存命中率是能省的。
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](three|@react-three|postprocessing)/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
