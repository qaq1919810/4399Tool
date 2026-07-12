// noinspection SpellCheckingInspection

import { shadowFetch } from '#utils/shadowFetch.mjs'

/**
 * 解析个人中心页面 HTML
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选，指定使用的 cookies
 * @returns {Promise<Object|null>} 解析后的页面数据
 */
async function fetchProfilePage(username, cookies = null) {
    if (!username) return null

    try {
        // 如果提供了 cookies，使用 shadowFetch 覆写，禁止浏览器自动附带 cookie
        if (cookies && cookies.length > 0) {
            const response = await shadowFetch('https://u.4399.com/profile/', {
                headers: { 'cookie': cookies }
            })
            if (!response.ok) throw new Error(`请求失败: ${response.status}`)
            return await parseProfileHtml(username, await response.text())
        }

        // 没有提供 cookies，使用普通 fetch（携带当前登录账号 cookie）
        const response = await fetch('https://u.4399.com/profile/', { credentials: 'include' })
        if (!response.ok) throw new Error(`请求失败: ${response.status}`)
        return await parseProfileHtml(username, await response.text())
    } catch (error) {
        console.error("[4399管家] 获取用户信息失败:", error)
        return null
    }
}

/**
 * 解析 HTML 并提取用户信息
 * @param {string} username - 用户名
 * @param {string} html - HTML 文本
 * @returns {Object} 用户信息
 */
function parseProfileHtml(username, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')

    // 解析头像
    const avatar = doc.querySelector('.u_avatar img')?.getAttribute('src') || ''
    const avatarUrl = avatar.startsWith('//') ? `https:${avatar}` : avatar

    // 解析认证状态
    const isAuth = !!doc.querySelector('.v-ok')

    // 解析表格信息
    const infoData = {}
    doc.querySelectorAll('.t_f tr').forEach(row => {
        const label = row.querySelector('.label')?.innerText.trim()
        const value = row.querySelector('.input')?.innerText.trim() || ''
        const clean = value.includes('<未填写>') ? '未填' : value

        if (label === '用户名 :') infoData.username = clean
        if (label === '昵称 :') infoData.nickname = clean
        if (label === '性别 :') infoData.gender = clean
        if (label === '生日 :') infoData.birthday = clean
        if (label === '地区 :') infoData.region = clean
        if (label === 'QQ :') infoData.qq = clean
    })

    return {
        puser: username,
        avatar: avatarUrl,
        username: infoData.username || username,
        nickname: infoData.nickname || '未知用户',
        gender: infoData.gender || '未填',
        birthday: infoData.birthday || '未填',
        region: infoData.region || '未填',
        qq: infoData.qq || '未填',
        authStatus: isAuth ? '已身份认证' : '未认证'
    }
}

/**
 * 获取用户头像
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} 头像 URL
 */
export async function getAvatar(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.avatar || 'https://via.placeholder.com/48'
}

/**
 * 获取用户昵称
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} 昵称
 */
export async function getNickname(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.nickname || '未知用户'
}

/**
 * 获取用户性别
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} 性别
 */
export async function getGender(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.gender || '未填'
}

/**
 * 获取用户地区
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} 地区
 */
export async function getRegion(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.region || '未填'
}

/**
 * 获取用户 QQ
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} QQ
 */
export async function getQQ(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.qq || '未填'
}

/**
 * 获取用户认证状态
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<string>} 认证状态
 */
export async function getAuthStatus(username, cookies = null) {
    const info = await fetchProfilePage(username, cookies)
    return info?.authStatus || '未认证'
}

/**
 * 获取完整用户信息
 * @param {string} username - 用户名
 * @param {Array} cookies - 可选
 * @returns {Promise<Object|null>} 完整用户信息
 */
export default async function getUserInfo(username, cookies = null) {
    return await fetchProfilePage(username, cookies)
}
