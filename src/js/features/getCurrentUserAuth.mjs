// noinspection SpellCheckingInspection

/**
 * 获取当前登录用户的认证信息
 * @returns {Promise<Object|null>} { puser, cookies }，未登录返回 null
 */
export async function getCurrentUserAuth() {
    try {
        const allCookies = await chrome.cookies.getAll({domain: ".4399.com"})
        const necessaryNames = ['Puser', 'Uauth', 'Pauth', 'Xauth', 'ptusertype', 'USESSIONID']
        const cookies = allCookies.filter(c => necessaryNames.includes(c.name))

        const cookieMap = new Map(cookies.map(cookie => [cookie.name, cookie]))
        const requiredNames = ['Puser', 'Uauth', 'Pauth', 'Xauth']
        if (!requiredNames.every(name => cookieMap.get(name)?.value)) {
            console.warn("[4399管家] 登录 Cookie 不完整，用户未登录或登录状态已失效")
            return null
        }

        return {
            puser: cookieMap.get('Puser').value,
            cookies
        }
    } catch (error) {
        console.error("[4399管家] 获取认证信息失败:", error)
        return null
    }
}
