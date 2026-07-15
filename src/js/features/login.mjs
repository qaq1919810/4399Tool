// noinspection SpellCheckingInspection

import {shadowFetch} from '#utils/shadowFetch.mjs'
import CryptoJS from 'crypto-js'
import {Gemini} from '#utils/ai.mjs'

const LOGIN_URL = 'https://ptlogin.4399.com/ptlogin/login.do?v=1'
const FRAME_URL = 'https://ptlogin.4399.com/ptlogin/phoneLoginFrame.do'
const CAPTCHA_URL = 'https://ptlogin.4399.com/ptlogin/captcha.do'

const AES_KEY = 'lzYW5qaXVqa'
const MAX_CAPTCHA_RETRIES = 10
const MIN_CAPTCHA_DELAY = 500

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
 * 检测响应是否需要验证码
 */
function needCaptcha(html) {
    return html.includes('验证码')
}

/**
 * 从HTML中提取sessionId
 */
function extractSessionId(html) {
    const match = html.match(/captchaId=([a-zA-Z0-9]+)/)
    return match ? match[1] : null
}

/**
 * 延迟指定毫秒
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 4399 影子登录（双重请求，不污染浏览器 Cookie）
 * @param {string} username - 用户名
 * @param {string} password - 明文密码
 * @param {Object} [options] - 选项
 * @param {string} [options.apiKey] - Gemini API Key（用于验证码识别）
 * @param {string} [options.captchaText] - 手动输入的验证码
 * @returns {Promise<{success: boolean, message?: string, cookies?: Array, username?: string, needCaptcha?: boolean, sessionId?: string}>}
 */
export async function login(username, password, options = {}) {
    if (!username || !password) {
        return {success: false, message: '用户名和密码不能为空'}
    }

    const {apiKey, captchaText: manualCaptcha} = options

    let gemini = null
    if (apiKey) {
        gemini = new Gemini(apiKey, 'gemini-3.1-flash-lite')
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

        // 构建基础表单
        const baseForm = {
            loginFrom: 'uframe',
            postLoginHandler: 'refreshParent',
            layoutSelfAdapting: 'true',
            externalLogin: 'qq',
            displayMode: 'embed',
            layout: 'vertical',
            bizId: '',
            appId: 'u4399',
            gameId: '',
            css: 'https://uc.img4399.com/root/css/ptlogin.css?8928ab0',
            redirectUrl: '',
            sessionId: '',
            mainDivId: 'popup_login_div',
            includeFcmInfo: 'false',
            level: '0',
            regLevel: '4',
            userNameLabel: '4399用户名',
            userNameTip: '请输入4399用户名',
            welcomeTip: '欢迎回到4399',
            sec: '1',
            password: encryptedPassword,
            iframeId: 'popup_login_frame',
            username: username
        }

        // 拼装风控 Cookie
        const cookieParts = [`USESSIONID=${usessionId}`, 'home4399=yes']
        if (phlogact) {
            cookieParts.push(`phlogact=${phlogact}`)
        }

        // 验证码重试循环
        let lastSessionId = ''
        let captchaText = ''

        for (let attempt = 0; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
            const postBody = new URLSearchParams(baseForm)

            // 如果有验证码，加上 inputCaptcha
            if (captchaText) {
                postBody.set('inputCaptcha', captchaText)
            }

            const loginRes = await shadowFetch(LOGIN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookieParts.join('; ')
                },
                body: postBody.toString()
            }, {setCookie: false})

            const setCookieHeaders = loginRes.headers.getSetCookie()
            console.log('[4399管家] 影子登录：响应 Set-Cookie:', setCookieHeaders)

            // 有 Set-Cookie 说明登录成功
            if (setCookieHeaders && setCookieHeaders.length > 0) {
                const allCookies = parseSetCookie(setCookieHeaders)
                console.log('[4399管家] 影子登录：解析后的 Cookie:', allCookies)
                return {
                    success: true,
                    message: '登录成功',
                    cookies: allCookies,
                    username: username
                }
            }

            // 没有 Set-Cookie，检查是否需要验证码
            const html = await loginRes.text()
            console.log('[4399管家] 影子登录：响应HTML前500字符:', html.substring(0, 500))
            if (!needCaptcha(html)) {
                console.warn('[4399管家] 影子登录：未知错误，无 Cookie 且无验证码提示')
                return {success: false, message: '登录失败：未知错误'}
            }

            // 提取 sessionId
            const sessionId = extractSessionId(html)
            if (!sessionId) {
                console.error('[4399管家] 影子登录：无法提取验证码 sessionId')
                return {success: false, message: '无法提取验证码 ID'}
            }

            // 手动验证码模式：返回需要验证码的状态，让 UI 处理
            if (manualCaptcha) {
                return {
                    success: false,
                    needCaptcha: true,
                    sessionId: sessionId,
                    message: '需要验证码'
                }
            }

            // 没有 API Key 无法识别验证码
            if (!gemini) {
                return {
                    success: false,
                    needCaptcha: true,
                    sessionId: sessionId,
                    message: '需要验证码但未提供 API Key'
                }
            }

            // 更新 baseForm 中的 sessionId
            baseForm.sessionId = sessionId
            lastSessionId = sessionId
            console.log(`[4399管家] 影子登录：需要验证码 (attempt ${attempt + 1}/${MAX_CAPTCHA_RETRIES}), sessionId=${sessionId}`)

            // 获取验证码图片
            const captchaRes = await shadowFetch(`${CAPTCHA_URL}?captchaId=${sessionId}`, {
                method: 'GET'
            }, {setCookie: false})

            const captchaBlob = await captchaRes.blob()
            console.log('[4399管家] 影子登录：验证码图片获取成功', captchaBlob.size, 'bytes')

            // AI 识别（记录开始时间，保证至少 500ms）
            const startTime = Date.now()
            const captchaResult = await gemini.chat('这是一个验证码图片，这个验证码一定是4个字符，一定只包含数字和字母（可能纯数字，可能纯字母），你的回答只能是干净的结果比如“xxxx”（不要给我回答带引号），回单不要包含md语法不要有空格，我只要四个字符', [captchaBlob])
            const elapsed = Date.now() - startTime

            captchaText = captchaResult.trim()
            console.log(`[4399管家] 影子登录：验证码识别结果="${captchaText}", 耗时=${elapsed}ms`)

            // 如果识别太快，补足 500ms
            if (elapsed < MIN_CAPTCHA_DELAY) {
                await sleep(MIN_CAPTCHA_DELAY - elapsed)
            }
        }

        return {success: false, message: `验证码错误重试 ${MAX_CAPTCHA_RETRIES} 次后失败`}
    } catch (error) {
        console.error('[4399管家] 影子登录异常:', error)
        return {success: false, message: error.message || '网络错误'}
    }
}

/**
 * 使用验证码重试登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} sessionId - 验证码 sessionId
 * @param {string} captchaText - 验证码文本
 * @returns {Promise<{success: boolean, message?: string, cookies?: Array, username?: string}>}
 */
export async function loginWithCaptcha(username, password, sessionId, captchaText) {
    if (!username || !password || !sessionId || !captchaText) {
        return {success: false, message: '参数不完整'}
    }

    try {
        // 获取风控 Cookie
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
            return {success: false, message: '风控指纹获取失败'}
        }

        // 构建表单
        const encryptedPassword = encryptPassword(password)
        const postBody = new URLSearchParams({
            loginFrom: 'uframe',
            postLoginHandler: 'refreshParent',
            layoutSelfAdapting: 'true',
            externalLogin: 'qq',
            displayMode: 'embed',
            layout: 'vertical',
            bizId: '',
            appId: 'u4399',
            gameId: '',
            css: 'https://uc.img4399.com/root/css/ptlogin.css?8928ab0',
            redirectUrl: '',
            sessionId: sessionId,
            mainDivId: 'popup_login_div',
            includeFcmInfo: 'false',
            level: '0',
            regLevel: '4',
            userNameLabel: '4399用户名',
            userNameTip: '请输入4399用户名',
            welcomeTip: '欢迎回到4399',
            sec: '1',
            password: encryptedPassword,
            iframeId: 'popup_login_frame',
            username: username,
            inputCaptcha: captchaText
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

        const setCookieHeaders = loginRes.headers.getSetCookie()

        if (setCookieHeaders && setCookieHeaders.length > 0) {
            const allCookies = parseSetCookie(setCookieHeaders)
            return {
                success: true,
                message: '登录成功',
                cookies: allCookies,
                username: username
            }
        }

        // 检查是否还是验证码错误
        const html = await loginRes.text()
        if (html.includes('验证码错误')) {
            return {success: false, message: '验证码错误'}
        }

        return {success: false, message: '登录失败'}
    } catch (error) {
        console.error('[4399管家] 影子登录异常:', error)
        return {success: false, message: error.message || '网络错误'}
    }
}
