// noinspection SpellCheckingInspection

/**
 * 获取当前登录用户的认证信息
 * @returns {Promise<Object|null>} { puser, cookies }，未登录返回 null
 */
export async function getCurrentUserAuth() {
    try {
        const allCookies = await chrome.cookies.getAll({ domain: ".4399.com" })
        const necessaryNames = ['Puser', 'Uauth', 'Pauth', 'Xauth', 'ptusertype', 'USESSIONID']
        const cookies = allCookies.filter(c => necessaryNames.includes(c.name))

        const puserCookie = cookies.find(c => c.name === 'Puser')
        if (!puserCookie) {
            console.warn("[4399管家] 未找到 Puser Cookie，用户未登录")
            return null
        }

        return {
            puser: puserCookie.value,
            cookies
        }
    } catch (error) {
        console.error("[4399管家] 获取认证信息失败:", error)
        return null
    }
}
