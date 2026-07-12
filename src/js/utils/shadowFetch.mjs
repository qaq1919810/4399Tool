// noinspection SpellCheckingInspection,JSUnusedAssignment

/**
 * 配置常量
 */
const ENABLE_SHADOW_LOG = true // 日志总开关：顶端控制是否打印
const DNR_RULE_PREFIX = 20000
const DNR_MAX_RULES = 10000
let currentRuleId = 0

const FORBIDDEN_HEADERS = new Set([
    'cookie', 'cookie2', 'referer', 'origin', 'dnt',
    'te', 'upgrade', 'connection', 'date', 'expect',
    'keep-alive', 'transfer-encoding', 'via'
])

/**
 * 垃圾回收：Service Worker 启动时，清理上一生命周期可能遗留的规则
 */
async function cleanupLeakedRules() {
    try {
        const rules = await chrome.declarativeNetRequest.getSessionRules()
        const leakedRuleIds = rules
            .map(r => r.id)
            .filter(id => id >= DNR_RULE_PREFIX && id < DNR_RULE_PREFIX + DNR_MAX_RULES)

        if (leakedRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: leakedRuleIds
            })
            console.debug(`[shadowFetch] Cleaned up ${leakedRuleIds.length} leaked DNR rules.`)
        }
    } catch (e) {
        console.warn('[shadowFetch] Failed to cleanup rules:', e)
    }
}

// noinspection JSIgnoredPromiseFromCall
cleanupLeakedRules()

function isForbiddenHeader(key) {
    const lowerKey = key.toLowerCase()
    return FORBIDDEN_HEADERS.has(lowerKey) ||
        lowerKey.startsWith('sec-') ||
        lowerKey.startsWith('proxy-')
}

/**
 * 后台异步格式化并打印请求日志，不阻塞主流程
 */
async function printShadowLog(originalUrl, options, dnrHeaders, response, fetchError) {
    const urlObj = new URL(originalUrl, globalThis.location?.origin)
    const baseURL = urlObj.origin + urlObj.pathname
    const method = (options.method || 'GET').toUpperCase()

    // 构建请求 queries
    const queries = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({key, value}))

    // 构建请求 headers (合并普通头和被 DNR 拦截处理的影子头)
    const reqHeaders = []
    if (options.headers instanceof Headers) {
        for (const [key, value] of options.headers.entries()) {
            reqHeaders.push({key, value})
        }
    }
    for (const h of dnrHeaders) {
        reqHeaders.push({key: h.header, value: h.value, _isShadowed: true})
    }

    // 组装符合你要求的输出结构
    const logData = {
        baseURL,
        method,
        statusCode: response ? response.status : (fetchError ? 0 : -1),
        req: {
            headers: reqHeaders,
            queries,
            body: options.body || null
        },
        res: null
    }

    if (response) {
        const resHeaders = []
        for (const [key, value] of response.headers.entries()) {
            resHeaders.push({key, value})
        }

        let resBody = null
        try {
            // 核心细节：必须使用 clone()，否则会消耗掉响应流，导致外部代码无法解析 body
            const cloneRes = response.clone()
            const text = await cloneRes.text()
            try {
                resBody = JSON.parse(text) // 尝试将响应体解析为 JSON 以提升可读性
            } catch {
                resBody = text // 非 JSON 则保留文本
            }
        } catch (e) {
            resBody = '[Unable to read or parse body]'
        }

        logData.res = {
            headers: resHeaders,
            body: resBody
        }
    } else if (fetchError) {
        logData.res = {
            error: fetchError.message || String(fetchError)
        }
    }

    // 打印美化后的日志
    const color = response?.ok ? '#4caf50' : '#f44336'
    console.groupCollapsed(`%c[shadowFetch] ${method} ${baseURL}`, `color: ${color}; font-weight: bold;`)
    console.log(logData)
    console.groupEnd()
}

/**
 * 拥有覆写头能力的 fetch
 * @type {typeof fetch}
 */
export async function shadowFetch(url, options = {}) {
    const cleanOptions = {...options}
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
            if (isForbiddenHeader(lowerKey)) {
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
            dnrHeadersToSet.push({
                header: key,
                operation: "set",
                value: value
            })
        }
    }

    const useDnr = dnrHeadersToSet.length > 0
    let ruleId = null
    let magicUrl = url
    let removeRule = () => {
    }

    if (useDnr) {
        currentRuleId = (currentRuleId + 1) % DNR_MAX_RULES
        ruleId = DNR_RULE_PREFIX + currentRuleId

        const magicUrlObj = new URL(url, globalThis.location?.origin)
        magicUrlObj.searchParams.set('_shadow_req_id', ruleId.toString())
        magicUrl = magicUrlObj.toString()

        removeRule = () => {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId]
            }).catch(() => {
            })
        }
    }

    let response = null
    let fetchError = null

    try {
        if (useDnr) {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId],
                addRules: [{
                    id: ruleId,
                    priority: 100,
                    action: {
                        type: "modifyHeaders",
                        requestHeaders: dnrHeadersToSet
                    },
                    condition: {
                        urlFilter: `*_shadow_req_id=${ruleId}*`,
                        resourceTypes: ["xmlhttprequest"]
                    }
                }]
            })

            if (cleanOptions.signal) {
                cleanOptions.signal.addEventListener('abort', removeRule, {once: true})
            }
        }

        // 执行请求
        response = await fetch(magicUrl, cleanOptions)
        return response

    } catch (e) {
        fetchError = e
        throw e
    } finally {
        if (useDnr) removeRule()

        // 当日志开关开启时，将信息推入异步打印队列
        if (ENABLE_SHADOW_LOG) {
            printShadowLog(url, cleanOptions, dnrHeadersToSet, response, fetchError).catch(() => {
            })
        }
    }
}