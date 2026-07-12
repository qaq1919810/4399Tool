/**
 */
class WindowManager{
    constructor() {
        // [内部方法] 智能处理 URL
        this._parseUrl = (url) => {
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('chrome-extension://')) {
                return url
            }
            return chrome.runtime.getURL(url)
        }

        /**
         * [核心] 构造单方控制手柄
         * @param {number} windowId - 窗口物理 ID
         * @param {number} tabId - 内部标签页 ID
         */
        this.getWindow = (windowId, tabId) => {
            if (!windowId || !tabId) return null

            return {
                windowId: windowId,
                tabId: tabId,

                // 核心大招：单方执行代码（严格要求必须传递函数）
                exec: async (func, args = []) => {
                    return chrome.scripting.executeScript({
                        target: {tabId: tabId},
                        func: func,
                        args: args
                    })
                },

                // 销毁当前窗口
                close: async () => {
                    return chrome.windows.remove(windowId)
                }
            }
        }
    }

    /**
     * 获取所有存活的 Popup 窗口实例
     */
    async getWindows() {
        const winList = await chrome.windows.getAll({populate: true})

        return winList
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
    }

    /**
     * 创建窗口并返回控制实例
     */
    async create(url, sizeConfig = '') {
        const finalUrl = this._parseUrl(url)

        const options = {
            url: finalUrl,
            type: 'popup',
            populate: true
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

        // 召唤窗口
        const newWindow = await chrome.windows.create(options)

        // 返回操控手柄
        return this.getWindow(newWindow.id, newWindow.tabs[0].id)
    }
}

// 导出全局单例
export const windowManager = new WindowManager()