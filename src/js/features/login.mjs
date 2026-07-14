// noinspection SpellCheckingInspection

import {shadowFetch} from '#utils/shadowFetch.mjs'
import CryptoJS from 'crypto-js'

const LOGIN_URL = 'https://ptlogin.4399.com/ptlogin/login.do?v=1'
const FRAME_URL = 'https://ptlogin.4399.com/ptlogin/phoneLoginFrame.do'

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

        const cookie = {name, value, path: '/', domain: '.4399.com'}

        for (const attr of attrs) {
            const trimmed = attr.trim().toLowerCase()
            const originalTrimmed = attr.trim()
            if (trimmed.startsWith('path=')) {
                cookie.path = originalTrimmed.substring(5)
                continue
            }
            if (trimmed.startsWith('domain=')) {
                cookie.domain = originalTrimmed.substring(7)
                continue
            }
            if (trimmed.startsWith('expires=')) {
                const date = new Date(originalTrimmed.substring(8))
                if (!isNaN(date.getTime())) {
                    cookie.expirationDate = Math.floor(date.getTime() / 1000)
                }
                continue
            }
            if (trimmed === 'httponly') {
                cookie.httpOnly = true
                continue
            }
            if (trimmed === 'secure') {
                cookie.secure = true
            }
        }
        return cookie
    })
}

function parseCookiesToMap(setCookieHeaders) {
    const map = new Map()
    if (!setCookieHeaders) return map

    for (const raw of setCookieHeaders) {
        const firstPart = raw.split(';')[0]
        const eqIndex = firstPart.indexOf('=')
        if (eqIndex > 0) {
            const key = firstPart.substring(0, eqIndex).trim()
            const value = firstPart.substring(eqIndex + 1).trim()
            map.set(key, value)
        }
    }
    return map
}

/**
 * 4399 影子登录（双重请求，不污染浏览器 Cookie）
 * @param {string} username - 用户名
 * @param {string} password - 明文密码
 * @returns {Promise<{success: boolean, message?: string, cookies?: Array}>}
 */
export async function login(username, password) {
    if (!username || !password) {
        return {success: false, message: '用户名和密码不能为空'}
    }

    try {
        // =========================================================
        // 第一步：请求登录 Frame，骗取风控 Cookie（USESSIONID + phlogact）
        // =========================================================
        console.log('[4399管家] 影子登录：第一步 - 获取风控指纹...')

        const frameParams = new URLSearchParams({
            loginMode: 'login_phone',
            crossDomainIFrame: '',
            postLoginHandler: 'refreshParent',
            redirectUrl: '',
            displayMode: 'embed',
            css: 'https://uc.img4399.com/root/css/ptlogin.css?8928ab0',
            appId: 'u4399',
            gameId: '',
            username: '',
            externalLogin: 'qq',
            password: '',
            mainDivId: 'embed_phonelogin_div',
            autoLogin: 'false',
            includeFcmInfo: 'false',
            qrLogin: 'false',
            userNameLabel: '4399用户名',
            userNameTip: '请输入4399用户名',
            welcomeTip: '欢迎回到4399',
            regLevel: '4',
            loginLevel: '0',
            bizId: '',
            iframeId: 'embed_phonelogin_frame',
            v: Date.now().toString()
        })

        const frameRes = await shadowFetch(`${FRAME_URL}?${frameParams.toString()}`, {
            method: 'GET'
        }, {setCookie: false})

        const frameCookies = parseCookiesToMap(frameRes.headers.getSetCookie())
        const usessionId = frameCookies.get('USESSIONID')
        const phlogact = frameCookies.get('phlogact')

        if (!usessionId) {
            console.error('[4399管家] 影子登录：第一步失败 - 未获取到 USESSIONID')
            return {success: false, message: '风控指纹获取失败'}
        }

        console.log(`[4399管家] 影子登录：USESSIONID=${usessionId}, phlogact=${phlogact || '(无)'}`)

        // =========================================================
        // 第二步：携带风控 Cookie 发起正式登录
        // =========================================================
        console.log('[4399管家] 影子登录：第二步 - 正式登录...')

        const encryptedPassword = encryptPassword(password)

        const postBody = new URLSearchParams({
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

        // 拼装风控 Cookie
        const cookieParts = [`USESSIONID=${usessionId}`, 'home4399=yes']
        if (phlogact) {
            cookieParts.push(`phlogact=${phlogact}`)
        }

        const loginRes = await shadowFetch(LOGIN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookieParts.join('; ')
            },
            body: postBody.toString()
        }, {setCookie: false})

        // =========================================================
        // 第三步：解析登录结果
        // =========================================================
        const setCookieHeaders = loginRes.headers.getSetCookie()
        console.log('[4399管家] 影子登录：响应 Set-Cookie:', setCookieHeaders)

        if (!setCookieHeaders || setCookieHeaders.length === 0) {
            console.warn('[4399管家] 影子登录：未获取到登录凭证')
            return {success: false, message: '登录失败：未获取到 Cookie'}
        }

        const allCookies = parseSetCookie(setCookieHeaders)
        console.log('[4399管家] 影子登录：解析后的 Cookie:', allCookies)

        return {
            success: true,
            message: '登录成功',
            cookies: allCookies
        }
    } catch (error) {
        console.error('[4399管家] 影子登录异常:', error)
        return {success: false, message: error.message || '网络错误'}
    }
}
