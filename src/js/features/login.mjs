// noinspection SpellCheckingInspection

import { shadowFetch } from '#utils/shadowFetch.mjs'
import CryptoJS from 'crypto-js'

const LOGIN_URL = 'https://ptlogin.4399.com/ptlogin/login.do?v=1'

const AES_KEY = 'lzYW5qaXVqa'

function encryptPassword(password) {
    return CryptoJS.AES.encrypt(password, AES_KEY).toString()
}

function parseSetCookie(setCookieHeaders) {
    if (!setCookieHeaders) return []

    return setCookieHeaders.map(raw => {
        const parts = raw.split(';')
        const [nameValue, ...attrs] = parts
        const eqIndex = nameValue.indexOf('=')
        const name = nameValue.substring(0, eqIndex).trim()
        const value = nameValue.substring(eqIndex + 1).trim()

        const cookie = { name, value, path: '/', domain: '.4399.com' }

        for (const attr of attrs) {
            const trimmed = attr.trim().toLowerCase()
            if (trimmed.startsWith('path=')) {
                cookie.path = attr.trim().substring(5)
            } else if (trimmed.startsWith('domain=')) {
                cookie.domain = attr.trim().substring(7)
            } else if (trimmed.startsWith('expires=')) {
                const date = new Date(attr.trim().substring(8))
                if (!isNaN(date.getTime())) {
                    cookie.expirationDate = Math.floor(date.getTime() / 1000)
                }
            } else if (trimmed === 'httponly') {
                cookie.httpOnly = true
            } else if (trimmed === 'secure') {
                cookie.secure = true
            }
        }

        return cookie
    })
}

/**
 * 4399 登录（仅获取 Cookie，不写入浏览器）
 * @param {string} username - 用户名
 * @param {string} password - 明文密码
 * @returns {Promise<{success: boolean, message?: string, cookies?: Array}>}
 */
export async function login(username, password) {
    if (!username || !password) {
        return { success: false, message: '用户名和密码不能为空' }
    }

    const encryptedPassword = encryptPassword(password)

    const body = new URLSearchParams({
        loginFrom: 'uframe',
        postLoginHandler: 'refreshParent',
        layoutSelfAdapting: 'false',
        externalLogin: 'qq',
        displayMode: 'embed',
        layout: 'vertical',
        bizId: '',
        appId: 'u4399',
        gameId: '',
        css: 'https://uc.img4399.com/root/css/ptlogin.css?8928ab0',
        redirectUrl: '',
        sessionId: '',
        mainDivId: 'embed_login_div',
        includeFcmInfo: 'false',
        level: '0',
        regLevel: '4',
        userNameLabel: '4399用户名',
        userNameTip: '请输入4399用户名',
        welcomeTip: '欢迎回到4399',
        sec: '1',
        password: encryptedPassword,
        iframeId: 'embed_login_frame',
        username: username
    })

    try {
        const response = await shadowFetch(LOGIN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString(),
            credentials: 'include'
        })

        const setCookieHeaders = response.headers.getSetCookie()
        console.log('[4399管家] 登录响应 Set-Cookie:', setCookieHeaders)

        if (!setCookieHeaders || setCookieHeaders.length === 0) {
            console.warn('[4399管家] 登录失败：未获取到 Cookie')
            return { success: false, message: '登录失败：未获取到 Cookie' }
        }

        const allCookies = parseSetCookie(setCookieHeaders)
        console.log('[4399管家] 解析后的 Cookie:', allCookies)

        return {
            success: true,
            message: '登录成功',
            cookies: allCookies
        }
    } catch (error) {
        console.error('[4399管家] 登录请求失败:', error)
        return { success: false, message: error.message || '网络错误' }
    }
}
