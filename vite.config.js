import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {crx} from '@crxjs/vite-plugin'
import manifest from './manifest.mjs'

// 核心引入：导入这两个自动引入工具
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

export default defineConfig(({command}) => {
    // 👈 判断是否为开发模式（npm run dev 时 command 值为 'serve'）
    const isDev = command === 'serve'
    return {
        plugins: [
            vue(),
            crx({manifest}),

            // 核心配置：加入到 plugins 数组中
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            }),
        ],
        server: {
            port: 5173,
            strictPort: true,
            hmr: {port: 5173},
        },
        build: {
            outDir: isDev ? 'devDist' : 'dist',
            emptyOutDir: true,
            sourcemap: 'inline',
            rollupOptions: {
                input: {
                    // 1. 保持你原有的 background 或者是 main 入口
                    // main: resolve(__dirname, 'index.html'),

                    // 2. 必须明确加上你的 popup 页面入口！
                    popup: 'src/html/popup/index.html'
                }
            }
        },
    }
})