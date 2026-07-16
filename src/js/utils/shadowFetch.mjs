// noinspection SpellCheckingInspection,JSUnusedAssignment

/**
 * 全局配置项
 */
const SHADOW_CONFIG = {
    logger: {
        enabled: true,         // 日志总开关
        options: {
            reqHeaders: true,  // 【新增开关】是否截获并读取底层真实外发的请求头（不需要时设为 false，速度飞快）
            resHeaders: true   // 是否强制截获并读取真实的响应头 (如 Set-Cookie)
        }
    }
}

const DNR_RULE_PREFIX = 20000
const DNR_MAX_RULES = 10000
const DNR_RULE_RESERVATIONS_KEY = 'shadowFetchRuleReservations'
const RESPONSE_HEADER_TIMEOUT_MS = 500

// 跨异步事件的数据转交中心，以 ruleId 为 Key，绝对不串数据
const shadowResponseHeadersMap = new Map()
const shadowRequestHeadersMap = new Map()
const responseHeaderWaiters = new Map()

/**
 * 在所有扩展页面之间分配唯一的 DNR Session Rule ID。
 *
 * chrome.storage.session 让刷新后的页面也能看到当前占用；Web Locks 让多个
 * Popup 同时发请求时的“读取占用 → 分配 ID → 写回”保持原子性。
 * 这里不依赖 runtime 消息或后台转发。
 * @returns {Promise<number>}
 */
async function reserveRuleId() {
    // noinspection JSValidateTypes
    return navigator.locks.request('4399-shadow-fetch-rule-ids', async () => {
        const [{[DNR_RULE_RESERVATIONS_KEY]: reservations = {}}, sessionRules] = await Promise.all([
            chrome.storage.session.get(DNR_RULE_RESERVATIONS_KEY),
            chrome.declarativeNetRequest.getSessionRules()
        ])
        // noinspection JSUnresolvedReference
        const occupiedIds = new Set([
            ...Object.keys(reservations).map(Number),
            ...sessionRules.map(rule => rule.id)
        ])

        for (let offset = 0; offset < DNR_MAX_RULES; offset++) {
            const ruleId = DNR_RULE_PREFIX + offset
            if (!occupiedIds.has(ruleId)) {
                await chrome.storage.session.set({
                    [DNR_RULE_RESERVATIONS_KEY]: {
                        ...reservations,
                        [ruleId]: Date.now()
                    }
                })
                return ruleId
            }
        }

        throw new Error('ShadowFetch 可用的 DNR Rule ID 已耗尽')
    })
}

/**
 * 释放当前请求占用的 Rule ID。正常请求会先移除 DNR Rule，再释放预留记录。
 * @param {number} ruleId
 */
async function releaseRuleId(ruleId) {
    await navigator.locks.request('4399-shadow-fetch-rule-ids', async () => {
        const {[DNR_RULE_RESERVATIONS_KEY]: reservations = {}} = await chrome.storage.session.get(DNR_RULE_RESERVATIONS_KEY)
        if (!(ruleId in reservations)) return

        const nextReservations = {...reservations}
        delete nextReservations[ruleId]
        await chrome.storage.session.set({[DNR_RULE_RESERVATIONS_KEY]: nextReservations})
    })
}

/**
 * 等待 webRequest 监听器收到对应请求的真实响应头；仅在事件丢失时才超时回退。
 * @param {number} ruleId
 * @returns {Promise<Array|undefined>}
 */
function waitForResponseHeaders(ruleId) {
    const capturedHeaders = shadowResponseHeadersMap.get(ruleId)
    if (capturedHeaders) return Promise.resolve(capturedHeaders)

    return new Promise(resolve => {
        const timeoutId = setTimeout(() => {
            responseHeaderWaiters.delete(ruleId)
            resolve(undefined)
        }, RESPONSE_HEADER_TIMEOUT_MS)

        responseHeaderWaiters.set(ruleId, headers => {
            clearTimeout(timeoutId)
            responseHeaderWaiters.delete(ruleId)
            resolve(headers)
        })
    })
}

/**
 * 1. 后台静默监听：捕获浏览器底层真正外发的请求头（包含隐式自动补全的 Cookie 等）
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        // 核心优化：如果总开关关闭，或者未开启请求头捕获，直接最速返回，不消耗任何 CPU 和内存
        if (!SHADOW_CONFIG.logger.enabled || !SHADOW_CONFIG.logger.options.reqHeaders) return

        try {
            const urlObj = new URL(details.url)
            const shadowReqId = urlObj.searchParams.get('_shadow_req_id')
            if (shadowReqId && details.requestHeaders) {
                // 命中影子水印，存入请求头 Map
                shadowRequestHeadersMap.set(Number(shadowReqId), details.requestHeaders)
            }
        } catch (e) {
            // 忽略非标准 URL 解析错误
        }
    },
    {urls: ["<all_urls>"], types: ["xmlhttprequest"]},
    ["requestHeaders", "extraHeaders"]
)

/**
 * 2. 后台静默监听：所有带有 _shadow_req_id 标记的底层真实响应头
 */
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        // 核心优化：如果总开关关闭，或者未开启响应头捕获，直接最速返回
        if (!SHADOW_CONFIG.logger.enabled || !SHADOW_CONFIG.logger.options.resHeaders) return

        try {
            const urlObj = new URL(details.url)
            const shadowReqId = urlObj.searchParams.get('_shadow_req_id')
            if (shadowReqId && details.responseHeaders) {
                const ruleId = Number(shadowReqId)
                shadowResponseHeadersMap.set(ruleId, details.responseHeaders)
                responseHeaderWaiters.get(ruleId)?.(details.responseHeaders)
            }
        } catch (e) {
            // 忽略非标准 URL 解析错误
        }
    },
    {urls: ["<all_urls>"], types: ["xmlhttprequest"]},
    ["responseHeaders", "extraHeaders"]
)


/**
 * ShadowFetch 核心静态类
 */
class ShadowFetch {
    static _FORBIDDEN_HEADERS = new Set([
        'cookie', 'cookie2', 'referer', 'origin', 'dnt',
        'te', 'upgrade', 'connection', 'date', 'expect',
        'keep-alive', 'transfer-encoding', 'via'
    ])

    static _isForbiddenHeader(key) {
        const lowerKey = key.toLowerCase()
        return this._FORBIDDEN_HEADERS.has(lowerKey) ||
            lowerKey.startsWith('sec-') ||
            lowerKey.startsWith('proxy-')
    }

    static async _printShadowLog(originalUrl, options, dnrHeaders, response, fetchError, realCapturedHeaders, realOutgoingHeaders) {
        if (!SHADOW_CONFIG.logger.enabled) return

        const urlObj = new URL(originalUrl, globalThis.location?.origin)
        const baseURL = urlObj.origin + urlObj.pathname
        const method = (options.method || 'GET').toUpperCase()
        const queries = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({key, value}))
        const reqHeaders = []

        if (realOutgoingHeaders && realOutgoingHeaders.length > 0) {
            for (const h of realOutgoingHeaders) {
                const isImplicit = dnrHeaders.every(dh => dh.header !== h.name.toLowerCase()) &&
                    !(options.headers instanceof Headers ? options.headers.has(h.name) : false)
                reqHeaders.push({
                    key: h.name,
                    value: h.value,
                    _isImplicit: isImplicit || undefined,
                    _isShadowed: !isImplicit ? true : undefined
                })
            }
        } else {
            if (options.headers instanceof Headers) {
                for (const [key, value] of options.headers.entries()) {
                    reqHeaders.push({key, value})
                }
            }
            for (const h of dnrHeaders) {
                reqHeaders.push({key: h.header, value: h.value, _isShadowed: true})
            }
        }

        const logData = {
            baseURL, method,
            statusCode: response ? response.status : (fetchError ? 0 : -1),
            req: {headers: reqHeaders, queries, body: options.body || null},
            res: null
        }

        if (response) {
            let resHeaders = []
            if (realCapturedHeaders && realCapturedHeaders.length > 0) {
                resHeaders = realCapturedHeaders.map(h => ({key: h.name, value: h.value}))
            } else {
                for (const [key, value] of response.headers.entries()) {
                    resHeaders.push({key, value})
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
            logData.res = {headers: resHeaders, body: resBody}
        } else if (fetchError) {
            logData.res = {error: fetchError.message || String(fetchError)}
        }

        const color = response?.ok ? '#4caf50' : '#f44336'
        console.groupCollapsed(`%c[ShadowFetch] ${method} ${baseURL}`, `color: ${color}; font-weight: bold;`)
        console.log(logData)
        console.groupEnd()
    }

    static #wrapResponse(response, realCapturedHeaders) {
        if (!realCapturedHeaders) return response

        return new Proxy(response, {
            get(target, prop) {
                if (prop === 'headers') {
                    return new Proxy(target.headers, {
                        get(hTarget, hProp) {
                            if (hProp === 'getSetCookie') {
                                return function () {
                                    return realCapturedHeaders
                                        .filter(h => h.name.toLowerCase() === 'set-cookie')
                                        .map(h => h.value)
                                }
                            }
                            if (hProp === 'get') {
                                return function (name) {
                                    const lowerName = name.toLowerCase()
                                    const found = realCapturedHeaders.find(h => h.name.toLowerCase() === lowerName)
                                    if (found) return found.value
                                    return hTarget.get(name)
                                }
                            }
                            if (hProp === 'has') {
                                return function (name) {
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

    static async fetch(url, options = {}, shadowOptions = {}) {
        const ClassObject = this

        const setCookie = shadowOptions.setCookie ?? true
        const cleanOptions = { ...options }

        if (setCookie === false) {
            cleanOptions.credentials = 'omit'
        }

        const dnrHeadersToSet = []
        const extractedForbiddenHeaders = new Map()

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
                dnrHeadersToSet.push({header: key, operation: "set", value: value})
            }
        }

        const useDnr = dnrHeadersToSet.length > 0

        // 判定是否需要启动水印追踪：只要响应头或请求头有一个需要捕获，或者用了 Omit 就要打水印
        const needCaptureReq = SHADOW_CONFIG.logger.options.reqHeaders
        const needCaptureRes = SHADOW_CONFIG.logger.options.resHeaders || useDnr || (setCookie === false)
        const anyTracking = needCaptureReq || needCaptureRes

        let ruleId = null
        let magicUrl = url
        let removeRule = async () => {}

        if (anyTracking) {
            ruleId = await reserveRuleId()

            const magicUrlObj = new URL(url, globalThis.location?.origin)
            magicUrlObj.searchParams.set('_shadow_req_id', ruleId.toString())
            magicUrl = magicUrlObj.toString()

            removeRule = async () => {
                if (useDnr) {
                    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [ruleId]})
                }
            }
        }

        let response = null
        let fetchError = null
        let realCapturedHeaders = null
        let realOutgoingHeaders = null

        try {
            if (useDnr) {
                await chrome.declarativeNetRequest.updateSessionRules({
                    removeRuleIds: [ruleId],
                    addRules: [{
                        id: ruleId,
                        priority: 100,
                        action: {type: "modifyHeaders", requestHeaders: dnrHeadersToSet},
                        condition: {urlFilter: `*_shadow_req_id=${ruleId}*`, resourceTypes: ["xmlhttprequest"]}
                    }]
                })
                if (cleanOptions.signal) {
                    cleanOptions.signal.addEventListener('abort', removeRule, {once: true})
                }
            }

            response = await fetch(magicUrl, cleanOptions)

            if (needCaptureRes) {
                realCapturedHeaders = await waitForResponseHeaders(ruleId)
                if (realCapturedHeaders) {
                    response = ClassObject.#wrapResponse(response, realCapturedHeaders)
                }
            }

            return response
        } catch (e) {
            fetchError = e
            throw e
        } finally {
            try {
                await removeRule()
            } finally {
                if (ruleId) {
                    await releaseRuleId(ruleId)
                }
            }

            if (ruleId) {
                // 只有开启了配置，才去拿真正的请求头
                if (needCaptureReq) {
                    realOutgoingHeaders = shadowRequestHeadersMap.get(ruleId)
                }

                setTimeout(() => {
                    shadowRequestHeadersMap.delete(ruleId)
                    shadowResponseHeadersMap.delete(ruleId)
                    responseHeaderWaiters.delete(ruleId)
                }, 500)
            }

            ClassObject._printShadowLog(
                url, cleanOptions, dnrHeadersToSet, response, fetchError,
                realCapturedHeaders, realOutgoingHeaders
            ).catch(() => {})
        }
    }
}

export const shadowFetch = (url, options, shadowOptions) => ShadowFetch.fetch(url, options, shadowOptions)
