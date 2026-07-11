// ====== 0. 导入获取用户信息的核心函数 ======
import { getCurrentUserAuth } from '../../js/feature/getCurrentUserAuth.mjs'
import getUserInfo from '../../js/feature/getUserInfo.mjs'
import { modifyUserInfo } from '../../js/feature/modifyUserInfo.mjs'
import { shadowFetch } from '../../js/utils/shadowFetch.mjs'

// ====== 1. 初始化，页面加载时执行 ======
document.addEventListener('DOMContentLoaded', async () => {
    await renderAccountList()
    await checkCurrentLoginStatus()
    setupRefreshAllButton()
})

// ====== 2. 检查当前登录状态 ======
async function checkCurrentLoginStatus() {
    const auth = await getCurrentUserAuth()
    const btn = document.getElementById('btn-save-current')

    if (auth) {
        btn.innerText = "💾 保存/更新当前账号"
        btn.disabled = false
        btn.style.background = "#ea4c89"
    } else {
        btn.innerText = "❌ 网页未登录，无法保存"
        btn.disabled = true
        btn.style.background = "#ccc"
    }
}

// ====== 3. 核心抓取与保存逻辑 ======
document.getElementById('btn-save-current').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-current')
    btn.innerText = "⏳ 正在抓取账号数据..."
    btn.disabled = true

    try {
        const auth = await getCurrentUserAuth()
        if (!auth) {
            alert("未检测到登录状态，请先在网页登录4399！")
            btn.innerText = "💾 保存/更新当前账号"
            btn.disabled = false
            return
        }

        const userData = await getUserInfo(auth.puser)
        if (!userData) {
            alert("获取用户信息失败！")
            btn.innerText = "💾 保存/更新当前账号"
            btn.disabled = false
            return
        }

        userData.cookies = auth.cookies

        const storageKey = 'info'

        // 读取旧数据
        const oldWrapper = await chrome.storage.local.get(storageKey)
        const oldInfo = oldWrapper[storageKey] || {}

        // 通过 Puser 判断是否存过，存过就覆盖，没存过就新写入
        oldInfo[userData.puser] = userData

        // 存入 Chrome 本地存储
        await chrome.storage.local.set({ [storageKey]: oldInfo })

        btn.innerText = "✅ 保存成功！"
        btn.style.background = "#4CAF50"

        // 刷新下方卡片列表
        await renderAccountList()

        setTimeout(() => {
            btn.innerText = "💾 保存/更新当前账号"
            btn.style.background = "#ea4c89"
            btn.disabled = false
        }, 2000)

    } catch (error) {
        console.error("保存账号时发生错误:", error)
        alert("抓取失败。")
        btn.innerText = "保存失败，重试"
        btn.disabled = false
    }
})

// ====== 3.5 全部刷新按钮 ======
function setupRefreshAllButton() {
    document.getElementById('btn-refresh-all').addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh-all')
        btn.disabled = true
        btn.innerText = '刷新中...'

        const storageWrapper = await chrome.storage.local.get('info')
        const storageInfo = storageWrapper.info || {}
        const pusers = Object.keys(storageInfo)

        if (pusers.length === 0) {
            alert('暂无保存的账号')
            btn.disabled = false
            btn.innerText = '全部刷新'
            return
        }

        let successCount = 0
        for (const puser of pusers) {
            const acc = storageInfo[puser]
            const cookies = acc?.cookies || null
            const userData = await getUserInfo(puser, cookies)
            if (userData) {
                storageInfo[puser] = { ...storageInfo[puser], ...userData }
                successCount++
            }
        }

        await chrome.storage.local.set({ info: storageInfo })
        alert(`✅ 刷新完成，成功 ${successCount}/${pusers.length} 个账号`)
        await renderAccountList()

        btn.disabled = false
        btn.innerText = '全部刷新'
    })
}

// ====== 4. 获取头像（通过 shadowFetch 修改 Referer） ======
async function fetchAvatar(url) {
    if (!url) return 'https://via.placeholder.com/48'
    try {
        const resp = await shadowFetch(url, {
            headers: { 'Referer': 'https://u.4399.com/' }
        })

        if (!resp.ok) return 'https://via.placeholder.com/48'
        const blob = await resp.blob()
        return URL.createObjectURL(blob)
    } catch {
        return 'https://via.placeholder.com/48'
    }
}

// ====== 5. 渲染下方的账号列表 ======
async function renderAccountList() {
    const container = document.getElementById('account-list')
    container.innerHTML = ''

    const allData = await chrome.storage.local.get('info')
    const info = allData.info || {}
    const accounts = Object.values(info)

    if (accounts.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; font-size:14px;">暂无保存的账号</p>'
        return
    }

    for (const acc of accounts) {
        const card = document.createElement('div')
        card.className = 'account-card'

        const authClass = acc.authStatus === '已身份认证' ? 'badge-auth' : 'badge-unauth'
        const avatarUrl = await fetchAvatar(acc.avatar)

        card.innerHTML = `
      <img class="avatar" src="${avatarUrl}" alt="头像">
      <div class="info">
        <h4>
          ${acc.nickname} 
          <span class="${authClass}">${acc.authStatus}</span>
        </h4>
        <p>账号: ${acc.username}</p>
        <p>信息: ${acc.gender} | 地区: ${acc.region} | QQ: ${acc.qq}</p>
      </div>
      <div class="btn-group">
        <button class="btn-switch" data-puser="${acc.puser}">切换</button>
        <button class="btn-edit" data-puser="${acc.puser}">修改</button>
        <button class="btn-refresh" data-puser="${acc.puser}">刷新</button>
      </div>
    `

        // 点击切换按钮
        card.querySelector('.btn-switch').addEventListener('click', async (e) => {
            e.stopPropagation()
            const btn = e.target
            btn.disabled = true
            btn.innerText = '切换中...'

            const success = await switch4399Account(acc.cookies)

            if (success) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const currentTab = tabs[0]
                    if (currentTab && currentTab.url.includes('4399.com')) {
                        chrome.tabs.reload(currentTab.id)
                    }
                })
                alert(`🎉 成功切换到账号：${acc.nickname}！`)
            } else {
                alert('❌ 切号失败。')
            }

            btn.disabled = false
            btn.innerText = '切换'
        })

        // 点击刷新按钮
        card.querySelector('.btn-refresh').addEventListener('click', async (e) => {
            e.stopPropagation()
            const btn = e.target
            btn.disabled = true
            btn.innerText = '刷新中...'

            const userData = await getUserInfo(acc.puser)
            if (userData) {
                const storageWrapper = await chrome.storage.local.get('info')
                const storageInfo = storageWrapper.info || {}
                storageInfo[acc.puser] = { ...storageInfo[acc.puser], ...userData }
                await chrome.storage.local.set({ info: storageInfo })
                alert(`✅ 账号 ${acc.nickname} 刷新成功！`)
                await renderAccountList()
            } else {
                alert('❌ 刷新失败')
                btn.disabled = false
                btn.innerText = '刷新'
            }
        })

        // 点击修改按钮
        card.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation()
            const existingForm = card.querySelector('.edit-form')
            if (existingForm) {
                existingForm.remove()
                return
            }

            const form = document.createElement('div')
            form.className = 'edit-form'
            form.innerHTML = `
        <div class="edit-row">
          <label>昵称</label>
          <input type="text" name="nick" placeholder="${acc.nickname}">
        </div>
        <div class="edit-row">
          <label>邮箱</label>
          <input type="text" name="email" placeholder="${acc.email || '未填写'}">
        </div>
        <div class="edit-row">
          <label>性别</label>
          <select name="sex">
            <option value="">不修改</option>
            <option value="1">男</option>
            <option value="2">女</option>
          </select>
        </div>
        <div class="edit-row">
          <label>生日</label>
          <input type="date" name="birthday" placeholder="${acc.birthday || '未填写'}">
        </div>
        <div class="edit-row">
          <label>地区</label>
          <input type="text" name="region" placeholder="${acc.region || '未填写'}">
        </div>
        <div class="edit-row">
          <label>QQ</label>
          <input type="text" name="qq" placeholder="${acc.qq || '未填写'}">
        </div>
        <button class="btn-save-edit">保存修改</button>
      `
            card.appendChild(form)

            form.querySelector('.btn-save-edit').addEventListener('click', async () => {
                const inputs = form.querySelectorAll('input, select')
                const params = {}

                inputs.forEach(input => {
                    const val = input.value.trim()
                    if (val !== '') {
                        params[input.name] = val
                    }
                })

                if (Object.keys(params).length === 0) {
                    alert('未输入任何修改内容')
                    return
                }

                const btn = form.querySelector('.btn-save-edit')
                btn.disabled = true
                btn.innerText = '保存中...'

                const result = await modifyUserInfo(params, acc.cookies)

                if (result.success) {
                    alert('✅ 修改成功！')
                    // 更新本地存储
                    const storageWrapper = await chrome.storage.local.get('info')
                    const storageInfo = storageWrapper.info || {}
                    if (storageInfo[acc.puser]) {
                        Object.assign(storageInfo[acc.puser], params)
                        await chrome.storage.local.set({ info: storageInfo })
                    }
                    await renderAccountList()
                } else {
                    alert(`❌ ${result.message}\n\n${JSON.stringify(result.data, null, 2)}`)
                    btn.disabled = false
                    btn.innerText = '保存修改'
                }
            })
        })

        container.appendChild(card)
    }
}

// ====== 5. Cookie 暴力注入函数 ======
async function switch4399Account(savedCookies) {
    try {
        if (!savedCookies || savedCookies.length === 0) return false

        for (const ck of savedCookies) {
            const setDetails = {
                url: "https://u.4399.com" + ck.path,
                name: ck.name,
                value: ck.value,
                path: ck.path,
                secure: ck.secure,
                httpOnly: ck.httpOnly,
                expirationDate: ck.session ? undefined : ck.expirationDate
            }

            if (!ck.hostOnly) {
                setDetails.domain = ck.domain
            }

            await chrome.cookies.set(setDetails)
        }
        return true
    } catch (error) {
        console.error('Cookie注入失败:', error)
        return false
    }
}