// noinspection SpellCheckingInspection

/**
 * 拥有覆写头能力的fetch
 * @type {typeof fetch}
 */
export async function shadowFetch(url, options = {}) {
    const PREFIX = 20000

    const FORBIDDEN_HEADERS = new Set([
        'cookie', 'cookie2', 'referer', 'origin', 'dnt',
        'te', 'upgrade', 'connection', 'date', 'expect',
        'keep-alive', 'transfer-encoding', 'via'
    ])

    const cleanOptions = { ...options }
    const dnrHeadersToSet = []

    if (cleanOptions.headers) {
        const extractedForbiddenHeaders = new Map()

        const isForbidden = (key) => {
            const lowerKey = key.toLowerCase()
            return FORBIDDEN_HEADERS.has(lowerKey) ||
                lowerKey.startsWith('sec-') ||
                lowerKey.startsWith('proxy-')
        }

        if (cleanOptions.headers instanceof Headers) {
            const newHeaders = new Headers()
            for (const [key, value] of cleanOptions.headers.entries()) {
                if (isForbidden(key)) extractedForbiddenHeaders.set(key, value)
                else newHeaders.append(key, value)
            }
            cleanOptions.headers = newHeaders
        } else {
            const newHeaders = {}
            for (const [key, value] of Object.entries(cleanOptions.headers)) {
                if (isForbidden(key)) extractedForbiddenHeaders.set(key, value)
                else newHeaders[key] = value
            }
            cleanOptions.headers = newHeaders
        }

        for (const [key, value] of extractedForbiddenHeaders.entries()) {
            let finalValue = value

            // 极致兼容：支持传入普通字符串，或 Chrome 原始的 Cookie 对象数组
            if (key.toLowerCase() === 'cookie' && Array.isArray(value)) {
                finalValue = value.map(c => `${c.name}=${c.value}`).join('; ')
            }

            dnrHeadersToSet.push({
                header: key,
                operation: "set",
                value: String(finalValue)
            })
        }
    }

    if (dnrHeadersToSet.length === 0) {
        return await fetch(url, cleanOptions)
    }

    const ruleId = PREFIX + Math.floor(Math.random() * 100000)
    const separator = url.includes('?') ? '&' : '?'
    const magicUrl = `${url}${separator}_shadow_req_id=${ruleId}`

    try {
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId],
            addRules: [{
                id: ruleId,
                priority: 2,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: dnrHeadersToSet
                },
                condition: {
                    urlFilter: `*_shadow_req_id=${ruleId}`,
                    resourceTypes: ["xmlhttprequest"]
                }
            }]
        })

        return await fetch(magicUrl, cleanOptions)

    } finally {
        await new Promise(r => setTimeout(r, 30))
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId]
        })
    }
}
