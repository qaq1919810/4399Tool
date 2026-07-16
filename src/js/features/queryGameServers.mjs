import {shadowFetch} from '#utils/shadowFetch.mjs'

// 实测服务端允许约 3 秒查询一次；使用 3.1 秒间隔留出余量，避免触发“操作过于频繁”。
const REQUEST_INTERVAL_MS = 3100
const DEADLINE_MULTIPLIER = 1.5

function wait(delay) {
    return new Promise(resolve => setTimeout(resolve, delay))
}

function normalizeGamePath(gamePath) {
    const normalized = String(gamePath ?? '').trim()
    if (!normalized) throw new TypeError('请输入游戏缩写')
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
        throw new TypeError('游戏缩写只能包含字母、数字、短横线和下划线')
    }
    return normalized
}

function normalizeServerIds(serverIds) {
    if (!Array.isArray(serverIds) || serverIds.length === 0) {
        throw new TypeError('请至少选择一个区服')
    }

    const normalized = [...new Set(serverIds.map(Number))].sort((a, b) => a - b)
    if (normalized.some(serverId =>
        !Number.isInteger(serverId) || serverId <= 0
    )) {
        throw new TypeError('区服编号必须是正整数')
    }
    return normalized
}

/**
 * 从游戏角色查询页解析该游戏实际提供的区服列表。
 * 页面中可能重复输出同一套区服模板，因此按 sid 去重并按 sid 升序返回。
 * @param {string} gamePath URL 中 /zhuanti/ 后的游戏缩写
 * @param {Array|null} cookies 指定账号保存的 Cookie
 * @returns {Promise<Array<{sid: number, name: string}>>}
 */
export async function getGameServerOptions(gamePath, cookies = null) {
    const normalizedGamePath = normalizeGamePath(gamePath)
    const url = `https://my.4399.com/zhuanti/${normalizedGamePath}/jscx`
    const headers = {Referer: url}
    if (Array.isArray(cookies) && cookies.length > 0) headers.Cookie = cookies

    const response = await shadowFetch(url, {credentials: 'include', headers})
    if (!response.ok) throw new Error(`加载区服失败：HTTP ${response.status}`)

    const html = await response.text()
    const document = new DOMParser().parseFromString(html, 'text/html')
    const serverMap = new Map()
    for (const element of document.querySelectorAll('.select-search[data-sid]')) {
        const sid = Number(element.dataset.sid)
        const name = element.querySelector('a')?.textContent?.trim() || element.textContent?.trim() || ''
        if (Number.isInteger(sid) && sid > 0 && name && !serverMap.has(sid)) {
            serverMap.set(sid, name)
        }
    }

    const servers = [...serverMap].map(([sid, name]) => ({sid, name})).sort((a, b) => a.sid - b.sid)
    if (servers.length === 0) throw new Error('未能从该游戏页面解析出区服列表，请检查游戏缩写')
    return servers
}

async function queryServer(gamePath, serverId, cookies, signal) {
    const baseUrl = `https://my.4399.com/zhuanti/${gamePath}`
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://my.4399.com',
        'Referer': `${baseUrl}/jscx`
    }
    if (Array.isArray(cookies) && cookies.length > 0) headers.Cookie = cookies

    const response = await shadowFetch(`${baseUrl}/jscx-ajaxSearchInfo`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: new URLSearchParams({sid: String(serverId), _AJAX_: '1'}).toString(),
        signal
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    let result
    try {
        result = await response.json()
    } catch {
        throw new Error('响应不是有效的 JSON')
    }

    if (result?.status === -3) return {rateLimited: true, roles: []}

    if (result?.status !== 1 || !Array.isArray(result.data)) {
        throw new Error(result?.msg || '服务端返回的数据格式无效')
    }

    return {
        rateLimited: false,
        roles: result.data.map(role => ({...role, sid: Number(role.sid ?? serverId)}))
    }
}

/**
 * 以 3.1 秒间隔串行查询指定游戏的多个区服。触发频繁限制的区服会回到队尾，
 * 直到全部完成或达到“所选区服数 × 3.1 秒 × 1.5”的动态截止时间。
 * @param {string} gamePath URL 中 /zhuanti/ 后的游戏缩写
 * @param {number[]} serverIds 从游戏查询页解析并由用户选择的区服编号
 * @param {Array|null} cookies 指定账号保存的 Cookie
 * @returns {Promise<{
 *   gamePath: string,
 *   selectedCount: number,
 *   successCount: number,
 *   failureCount: number,
 *   roles: Array,
 *   emptyServerIds: number[],
 *   failures: Array<{sid: number, message: string}>
 * }>}
 */
export async function queryGameServers(gamePath, serverIds, cookies = null) {
    const normalizedGamePath = normalizeGamePath(gamePath)
    const normalizedServerIds = normalizeServerIds(serverIds)
    const queryDeadlineMs = normalizedServerIds.length * REQUEST_INTERVAL_MS * DEADLINE_MULTIPLIER
    const roles = []
    const emptyServerIds = []
    const failures = []
    const queue = [...normalizedServerIds]
    const startedAt = Date.now()
    let lastRequestStartedAt = null
    let timedOutServerId = null

    while (queue.length > 0) {
        const elapsed = Date.now() - startedAt
        if (elapsed >= queryDeadlineMs) break

        if (lastRequestStartedAt !== null) {
            const intervalRemaining = REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt)
            if (intervalRemaining > 0) {
                const deadlineRemaining = queryDeadlineMs - (Date.now() - startedAt)
                if (intervalRemaining >= deadlineRemaining) break
                await wait(intervalRemaining)
            }
        }

        if (Date.now() - startedAt >= queryDeadlineMs) break

        const serverId = queue.shift()
        const controller = new AbortController()
        const requestTimeRemaining = queryDeadlineMs - (Date.now() - startedAt)
        const timeoutId = setTimeout(() => controller.abort(), requestTimeRemaining)
        lastRequestStartedAt = Date.now()

        try {
            const result = await queryServer(normalizedGamePath, serverId, cookies, controller.signal)
            if (result.rateLimited) {
                queue.push(serverId)
            } else if (result.roles.length === 0) {
                emptyServerIds.push(serverId)
            } else {
                roles.push(...result.roles)
            }
        } catch (error) {
            if (controller.signal.aborted && Date.now() - startedAt >= queryDeadlineMs) {
                timedOutServerId = serverId
                break
            }
            failures.push({sid: serverId, message: error?.message || '查询失败'})
        } finally {
            clearTimeout(timeoutId)
        }
    }

    const unfinishedServerIds = [
        ...(timedOutServerId === null ? [] : [timedOutServerId]),
        ...queue
    ]
    for (const serverId of [...new Set(unfinishedServerIds)].sort((a, b) => a - b)) {
        failures.push({sid: serverId, message: `整组查询超过 ${Math.round(queryDeadlineMs / 1000)} 秒，未能完成`})
    }

    roles.sort((a, b) => Number(a.sid) - Number(b.sid))
    emptyServerIds.sort((a, b) => a - b)
    failures.sort((a, b) => a.sid - b.sid)
    return {
        gamePath: normalizedGamePath,
        selectedCount: normalizedServerIds.length,
        successCount: normalizedServerIds.length - new Set(failures.map(failure => failure.sid)).size,
        failureCount: failures.length,
        roles,
        emptyServerIds,
        failures
    }
}

export default queryGameServers
