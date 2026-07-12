/**
 * Chrome MV3 窗口调度与单方控制 SDK (无参数闭包直控版)
 */
class WindowManager {
    // 严格的现代规范：原生私有属性/方法必须在类最顶部声明
    #enableLogger = false

    // 原生私有日志方法
    #log(action, detail) {
        if (this.#enableLogger) {
            console.log(`%c[WindowManagerSDK] ${action}`, 'color: #1a73e8; font-weight: bold;', detail)
        }
    }

    // 原生私有 URL 处理方法
    #parseUrl(url) {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('chrome-extension://')) {
            return url
        }
        return chrome.runtime.getURL(url)
    }

    // 私有轮询器：确保能精准拿到刚创建的插件窗口物理视图
    #getTargetView(tabId, maxRetries = 20) {
        return new Promise((resolve, reject) => {
            let attempts = 0
            const check = () => {
                const views = chrome.extension.getViews({ tabId })
                if (views.length > 0) {
                    resolve(views[0])
                } else {
                    attempts++
                    if (attempts >= maxRetries) {
                        reject(new Error(`[超时] 无法获取 tabId: ${tabId} 的视图实例`))
                    } else {
                        setTimeout(check, 50) // 每 50ms 检查一次
                    }
                }
            }
            check()
        })
    }

    constructor(config = {}) {
        this.#enableLogger = !!config.logger

        /**
         * [核心] 构造单方控制手柄
         */
        this.getWindow = (windowId, tabId) => {
            if (!windowId || !tabId) return null

            return {
                windowId,
                tabId,

                // 核心大招：单方闭包直控，不再需要传递第二个参数数组
                exec: async (func) => {
                    this.#log('执行 exec (闭包直控模式)', { tabId, functionName: func.name || 'anonymous' })

                    try {
                        // 1. 获取目标窗口的物理 Window 实例
                        const targetWindow = await this.#getTargetView(tabId)
                        const targetDocument = targetWindow.document

                        // 2. 直接执行函数，只注入目标窗体的 win 和 doc
                        return func(targetWindow, targetDocument)
                    } catch (error) {
                        console.error('[WindowManagerSDK] exec 执行失败:', error)
                        throw error
                    }
                },

                // 销毁当前窗口
                close: async () => {
                    this.#log('执行 close', { windowId, tabId })
                    return chrome.windows.remove(windowId)
                }
            }
        }
    }

    /**
     * 获取所有存活的 Popup 窗口实例
     */
    async getWindows() {
        this.#log('读取 getWindows', '正在获取所有Popup窗口...')
        const winList = await chrome.windows.getAll({ populate: true })

        const instances = winList
            .filter(win => win.type === 'popup')
            .map(win => {
                const tabId = win.tabs?.[0]?.id
                const baseInstance = this.getWindow(win.id, tabId)

                if (baseInstance) {
                    baseInstance.url = win.tabs[0].url
                }
                return baseInstance
            })
            .filter(Boolean)

        this.#log('读取 getWindows 完成', `成功获取到 ${instances.length} 个活跃实例`)
        return instances
    }

    /**
     * 创建窗口并返回控制实例
     */
    async create(url, sizeConfig = '') {
        const finalUrl = this.#parseUrl(url)
        this.#log('准备 create 窗口', { url: finalUrl, sizeConfig })

        const options = {
            url: finalUrl,
            type: 'popup'
        }

        // 智能解析第二个参数
        if (typeof sizeConfig === 'string' && sizeConfig.length > 0) {
            options.state = sizeConfig
        } else if (typeof sizeConfig === 'object' && sizeConfig !== null) {
            if (sizeConfig.width) options.width = Number(sizeConfig.width)
            if (sizeConfig.height) options.height = Number(sizeConfig.height)
            if (sizeConfig.left) options.left = Number(sizeConfig.left)
            if (sizeConfig.top) options.top = Number(sizeConfig.top)
        }

        const newWindow = await chrome.windows.create(options)
        const windowId = newWindow.id
        const tabId = newWindow.tabs[0].id

        this.#log('窗口 create 成功', { windowId, tabId })
        return this.getWindow(windowId, tabId)
    }
}

export default new WindowManager({ logger: true })