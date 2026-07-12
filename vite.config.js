import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {crx} from '@crxjs/vite-plugin'
import manifest from './manifest.mjs'
import { resolve, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { globSync } from 'fs'

// 核心引入：导入这两个自动引入工具
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

function getHtmlEntries(){
    const entries = {}
    // 💡 直接扫描整个 src 目录下所有的 html 文件！
    const files = globSync('src/**/*.html')

    files.forEach(file => {
        // 提取文件名（不带后缀），如：index, batch-edit
        const name = basename(file, extname(file))

        const __dirname = fileURLToPath(new URL('.', import.meta.url))
        entries[name] = resolve(__dirname, file)
    })
    return entries
}

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
                input: getHtmlEntries()
            }
        },
    }
})