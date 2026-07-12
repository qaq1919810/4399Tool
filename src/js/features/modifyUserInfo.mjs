// noinspection SpellCheckingInspection

import { shadowFetch } from '#utils/shadowFetch.mjs'

/**
 * 获取修改页面的 __HASH__
 * @param {Array} cookies - 可选，指定使用的 cookies
 * @returns {Promise<string|null>} __HASH__ 值
 */
async function getHash(cookies = null) {
    try {
        const fetchOptions = { credentials: 'include' }
        if (cookies && cookies.length > 0) {
            fetchOptions.headers = { 'cookie': cookies }
        }

        const response = cookies
            ? await shadowFetch('https://u.4399.com/profile/modify.html', fetchOptions)
            : await fetch('https://u.4399.com/profile/modify.html', fetchOptions)

        if (!response.ok) throw new Error(`请求失败: ${response.status}`)

        const html = await response.text()
        const match = html.match(/name="__HASH__"\s+value="([^"]+)"/)
        return match ? match[1] : null
    } catch (error) {
        console.error("[4399管家] 获取 __HASH__ 失败:", error)
        return null
    }
}

/**
 * 获取当前用户信息（用于填充表单）
 * @param {Array} cookies - 可选，指定使用的 cookies
 * @returns {Promise<Object|null>} 当前用户信息
 */
async function getCurrentProfile(cookies = null) {
    try {
        const fetchOptions = { credentials: 'include' }
        if (cookies && cookies.length > 0) {
            fetchOptions.headers = { 'cookie': cookies }
        }

        const response = cookies
            ? await shadowFetch('https://u.4399.com/profile/modify.html', fetchOptions)
            : await fetch('https://u.4399.com/profile/modify.html', fetchOptions)
        if (!response.ok) throw new Error(`请求失败: ${response.status}`)

        const html = await response.text()
        const doc = new DOMParser().parseFromString(html, 'text/html')

        return {
            nick: doc.querySelector('#ipt_nick')?.value || '',
            email: doc.querySelector('#ipt_email')?.value || '',
            sex: doc.querySelector('input[name="sex"]:checked')?.value || '1',
            birthday: doc.querySelector('#ipt_birthday')?.value || '',
            province: doc.querySelector('#local_province')?.value || '',
            city: doc.querySelector('#local_city')?.value || '',
            qq: doc.querySelector('#ipt_qq')?.value || ''
        }
    } catch (error) {
        console.error("[4399管家] 获取当前信息失败:", error)
        return null
    }
}

/**
 * 发送修改请求
 * @param {Object} params - 修改参数
 * @param {Array} cookies - 可选，指定使用的 cookies
 * @returns {Promise<boolean>} 是否成功
 */
async function sendModifyRequest(params, cookies = null) {
    const hash = await getHash(cookies)
    if (!hash) {
        console.error("[4399管家] 无法获取 __HASH__")
        return false
    }

    const current = await getCurrentProfile(cookies)
    if (!current) {
        console.error("[4399管家] 无法获取当前信息")
        return false
    }

    // 合并参数，未提供的字段使用当前值
    const birthday = params.birthday || current.birthday
    const birthdayParts = birthday.split('-')

    const body = new URLSearchParams({
        '__HASH__': hash,
        'birthday': birthday,
        'nick': params.nick ?? current.nick,
        'sex': params.sex ?? current.sex,
        'bir_year': birthdayParts[0] || '',
        'bir_month': birthdayParts[1] || '',
        'bir_day': birthdayParts[2] || '',
        'local_province': params.province ?? current.province,
        'local_city': params.city ?? current.city
    })

    // email 和 qq 只在用户明确提供时才添加
    if (params.email !== undefined) {
        body.set('email', params.email)
    }
    if (params.qq !== undefined) {
        body.set('qq', params.qq)
    }

    try {
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: body.toString(),
            credentials: 'include',
            referrer: 'https://u.4399.com/profile/modify.html'
        }

        let response
        if (cookies && cookies.length > 0) {
            fetchOptions.headers['cookie'] = cookies
            response = await shadowFetch('https://u.4399.com/profile/modify-save.html', fetchOptions)
        } else {
            response = await fetch('https://u.4399.com/profile/modify-save.html', fetchOptions)
        }

        if (!response.ok) throw new Error(`请求失败: ${response.status}`)

        const result = await response.json()

        // 成功
        if (result.state === true || result.ret === 'succ') {
            return { success: true }
        }

        // 错误：直接返回 d 对象
        return {
            success: false,
            message: result.e || '修改失败',
            data: result.d || {}
        }
    } catch (error) {
        console.error("[4399管家] 修改失败:", error)
        return { success: false, message: error.message || '网络错误' }
    }
}

/**
 * 修改邮箱
 * @param {string} email - 新邮箱
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyEmail(email, cookies = null) {
    return await sendModifyRequest({ email }, cookies)
}

/**
 * 修改昵称
 * @param {string} nick - 新昵称
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyNickname(nick, cookies = null) {
    return await sendModifyRequest({ nick }, cookies)
}

/**
 * 修改性别
 * @param {string} sex - '1'=男，'2'=女
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyGender(sex, cookies = null) {
    return await sendModifyRequest({ sex }, cookies)
}

/**
 * 修改生日
 * @param {string} birthday - 格式：'YYYY-MM-DD'
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyBirthday(birthday, cookies = null) {
    return await sendModifyRequest({ birthday }, cookies)
}

/**
 * 修改地区
 * @param {string} province - 省份
 * @param {string} city - 城市
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyRegion(province, city, cookies = null) {
    return await sendModifyRequest({ province, city }, cookies)
}

/**
 * 修改 QQ
 * @param {string} qq - QQ 号
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyQQ(qq, cookies = null) {
    return await sendModifyRequest({ qq }, cookies)
}

/**
 * 批量修改用户信息
 * @param {Object} params - { nick, email, sex, birthday, province, city, qq }
 * @param {Array} cookies - 可选
 * @returns {Promise<boolean>}
 */
export async function modifyUserInfo(params, cookies = null) {
    return await sendModifyRequest(params, cookies)
}
