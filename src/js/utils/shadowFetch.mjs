// noinspection SpellCheckingInspection,JSUnusedAssignment

/**
 * 全局配置项
 */
const SHADOW_CONFIG = {
    logger: {
        enabled: true,         // 日志总开关
        options: {
            resHeaders: true   // 是否强制截获并读取真实的响应头 (如 Set-Cookie)
        }
    }
}

const DNR_RULE_PREFIX = 20000
const DNR_MAX_RULES = 10000
let ruleCounter = 0 // 静态原子递增，仅作为 ID 生成器，不涉及并发状态污染

// 跨异步事件的数据转交中心，以 ruleId 为 Key，绝对不串数据
const shadowResponseHeadersMap = new Map()

/**
 * 后台静默监听所有带有 _shadow_req_id 标记的底层响应头
 */
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        try {
            const urlObj = new URL(details.url)
            const shadowReqId = urlObj.searchParams.get('_shadow_req_id')
            if (shadowReqId && details.responseHeaders) {
                shadowResponseHeadersMap.set(Number(shadowReqId), details.responseHeaders)
            }
        } catch (e) {
            // 忽略非标准 URL 解析错误
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest"] },
    ["responseHeaders", "extraHeaders"] // 必须加 extraHeaders 才能读到隐私头
)


/**
 * ShadowFetch 核心静态类
 * 设计哲学：无状态 (Stateless)、静态化、闭包隔离、高并发安全
 */
class ShadowFetch {
    static _FORBIDDEN_HEADERS = new Set([
        'cookie', 'cookie2', 'referer', 'origin', 'dnt',
        'te', 'upgrade', 'connection', 'date', 'expect',
        'keep-alive', 'transfer-encoding', 'via'
    ])

    /**
     * 垃圾回收：清理上一生命周期可能遗留的 DNR 规则
     */
    static async cleanupLeakedRules() {
        try {
            const rules = await chrome.declarativeNetRequest.getSessionRules()
            const leakedRuleIds = rules
                .map(r => r.id)
                .filter(id => id >= DNR_RULE_PREFIX && id < DNR_RULE_PREFIX + DNR_MAX_RULES)

            if (leakedRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: leakedRuleIds })
                console.debug(`[ShadowFetch] Cleaned up ${leakedRuleIds.length} leaked DNR rules.`)
            }
        } catch (e) {
            console.warn('[ShadowFetch] Failed to cleanup rules:', e)
        }
    }

    /**
     * 判断是否为浏览器禁止写入的 Header
     */
    static _isForbiddenHeader(key) {
        const lowerKey = key.toLowerCase()
        return this._FORBIDDEN_HEADERS.has(lowerKey) ||
            lowerKey.startsWith('sec-') ||
            lowerKey.startsWith('proxy-')
    }

    /**
     * 后台异步打印日志 (闭包安全)
     */
    static async _printShadowLog(originalUrl, options, dnrHeaders, response, fetchError, realCapturedHeaders) {
        if (!SHADOW_CONFIG.logger.enabled) return

        // 强行让出微任务队列，确保 webRequest 的拦截已经写入 Map
        await new Promise(resolve => setTimeout(resolve, 0))

        const urlObj = new URL(originalUrl, globalThis.location?.origin)
        const baseURL = urlObj.origin + urlObj.pathname
        const method = (options.method || 'GET').toUpperCase()

        const queries = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({ key, value }))

        const reqHeaders = []
        if (options.headers instanceof Headers) {
            for (const [key, value] of options.headers.entries()) {
                reqHeaders.push({ key, value })
            }
        }
        for (const h of dnrHeaders) {
            reqHeaders.push({ key: h.header, value: h.value, _isShadowed: true })
        }

        const logData = {
            baseURL, method,
            statusCode: response ? response.status : (fetchError ? 0 : -1),
            req: { headers: reqHeaders, queries, body: options.body || null },
            res: null
        }

        if (response) {
            let resHeaders = []

            // 核心逻辑：如果在底层捕获到了真实的头，直接无条件打印（反正都读取了不打印也亏）
            if (realCapturedHeaders && realCapturedHeaders.length > 0) {
                resHeaders = realCapturedHeaders.map(h => ({ key: h.name, value: h.value }))
            } else {
                // 降级使用 fetch 原生暴露的可打印头
                for (const [key, value] of response.headers.entries()) {
                    resHeaders.push({ key, value })
                }
            }

            let resBody = null
            try {
                const cloneRes = response.clone()
                const text = await cloneRes.text()
                try { resBody = JSON.parse(text) } catch { resBody = text }
            } catch (e) {
                resBody = '[Unable to read or parse body]'
            }
            logData.res = { headers: resHeaders, body: resBody }
        } else if (fetchError) {
            logData.res = { error: fetchError.message || String(fetchError) }
        }

        const color = response?.ok ? '#4caf50' : '#f44336'
        console.groupCollapsed(`%c[ShadowFetch] ${method} ${baseURL}`, `color: ${color}; font-weight: bold;`)
        console.log(logData)
        console.groupEnd()
    }

    /**
     * 包装 Response 对象，实现被隐藏响应头的穿透读取
     */
    static _wrapResponse(response, realCapturedHeaders) {
        if (!realCapturedHeaders) return response;

        return new Proxy(response, {
            get(target, prop) {
                if (prop === 'headers') {
                    return new Proxy(target.headers, {
                        get(hTarget, hProp) {
                            // === 新增：完美适配 Node.js 18+ 的 getSetCookie ===
                            if (hProp === 'getSetCookie') {
                                return function() {
                                    // 从底层拦截到的头里，找出所有 set-cookie，并以数组形式返回
                                    return realCapturedHeaders
                                        .filter(h => h.name.toLowerCase() === 'set-cookie')
                                        .map(h => h.value);
                                }
                            }

                            if (hProp === 'get') {
                                return function(name) {
                                    const lowerName = name.toLowerCase()
                                    const found = realCapturedHeaders.find(h => h.name.toLowerCase() === lowerName)
                                    if (found) return found.value
                                    return hTarget.get(name)
                                }
                            }
                            if (hProp === 'has') {
                                return function(name) {
                                    const lowerName = name.toLowerCase()
                                    const hasInShadow = realCapturedHeaders.some(h => h.name.toLowerCase() === lowerName)
                                    return hasInShadow || hTarget.has(name)
                                }
                            }
                            const value = hTarget[hProp]
                            return typeof value === 'function' ? value.bind(hTarget) : value
                        }
                    })
                }
                const value = target[prop]
                return typeof value === 'function' ? value.bind(target) : value
            }
        })
    }

    /**
     * 拥有覆写、读取禁忌头部能力的 fetch
     * @type {typeof fetch}
     */
    static async fetch(url, options = {}) {
        const ClassObject = this // 锁死类对象，防止在 Proxy 等异步回调中 this 丢失
        const cleanOptions = { ...options }
        const dnrHeadersToSet = []
        const extractedForbiddenHeaders = new Map()

        // 1. 提取 Header 逻辑
        if (cleanOptions.headers) {
            let headerEntries = []
            if (cleanOptions.headers instanceof Headers) {
                headerEntries = Array.from(cleanOptions.headers.entries())
            } else if (Array.isArray(cleanOptions.headers)) {
                headerEntries = cleanOptions.headers
            } else {
                headerEntries = Object.entries(cleanOptions.headers)
            }

            const newHeaders = new Headers()
            for (let [key, value] of headerEntries) {
                const lowerKey = key.toLowerCase()
                if (ClassObject._isForbiddenHeader(lowerKey)) {
                    if (lowerKey === 'cookie' && Array.isArray(value)) {
                        value = value.map(c => `${c.name}=${c.value}`).join('; ')
                    }
                    extractedForbiddenHeaders.set(lowerKey, String(value))
                } else {
                    newHeaders.append(key, String(value))
                }
            }
            cleanOptions.headers = newHeaders

            for (const [key, value] of extractedForbiddenHeaders.entries()) {
                dnrHeadersToSet.push({ header: key, operation: "set", value: value })
            }
        }

        const useDnr = dnrHeadersToSet.length > 0
        // 是否需要追踪响应头：1.主动开启了读取响应头配置；2.因为有不可见请求头被迫用DNR，顺便读取
        const needCaptureRes = SHADOW_CONFIG.logger.options.resHeaders || useDnr

        let ruleId = null
        let magicUrl = url
        let removeRule = () => {}

        // 如果需要追踪，打上 _shadow_req_id 水印
        if (needCaptureRes) {
            ruleCounter = (ruleCounter + 1) % DNR_MAX_RULES
            ruleId = DNR_RULE_PREFIX + ruleCounter

            const magicUrlObj = new URL(url, globalThis.location?.origin)
            magicUrlObj.searchParams.set('_shadow_req_id', ruleId.toString())
            magicUrl = magicUrlObj.toString()

            removeRule = () => {
                if (useDnr) {
                    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {})
                }
            }
        }

        let response = null
        let fetchError = null
        let realCapturedHeaders = null

        try {
            // 只有涉及到修改 请求头 时，才真正需要下发 DNR 规则
            if (useDnr) {
                await chrome.declarativeNetRequest.updateSessionRules({
                    removeRuleIds: [ruleId],
                    addRules: [{
                        id: ruleId,
                        priority: 100,
                        action: { type: "modifyHeaders", requestHeaders: dnrHeadersToSet },
                        condition: { urlFilter: `*_shadow_req_id=${ruleId}*`, resourceTypes: ["xmlhttprequest"] }
                    }]
                })
                if (cleanOptions.signal) {
                    cleanOptions.signal.addEventListener('abort', removeRule, { once: true })
                }
            }

            // 发送请求
            response = await fetch(magicUrl, cleanOptions)

            // 如果打过水印，尝试去 Map 提取真实响应头
            if (needCaptureRes) {
                await new Promise(resolve => setTimeout(resolve, 0))
                realCapturedHeaders = shadowResponseHeadersMap.get(ruleId)
                if (realCapturedHeaders) {
                    response = ClassObject._wrapResponse(response, realCapturedHeaders)
                }
            }

            return response
        } catch (e) {
            fetchError = e
            throw e
        } finally {
            removeRule()

            // 只要打过标记的请求，结束后统统从内存清理
            if (ruleId) {
                setTimeout(() => shadowResponseHeadersMap.delete(ruleId), 500)
            }

            // 执行日志
            ClassObject._printShadowLog(url, cleanOptions, dnrHeadersToSet, response, fetchError, realCapturedHeaders).catch(() => {})
        }
    }
}

// 初始化时自动执行泄漏规则清理
// noinspection JSIgnoredPromiseFromCall
ShadowFetch.cleanupLeakedRules()

// 对外暴露与原生行为完全一致的调用接口
export const shadowFetch = (url, options) => ShadowFetch.fetch(url, options)