<template>
  <div class="batch-import">
    <h3>批量导入</h3>

    <!-- API Key 配置 -->
    <div class="api-key-section">
      <el-input
        v-model="apiKey"
        type="password"
        placeholder="Gemini API Key"
        show-password
        style="flex: 1"
      />
      <el-button type="primary" @click="saveApiKey">保存</el-button>
    </div>

    <el-input
      v-model="rawData"
      type="textarea"
      :rows="8"
      placeholder="粘贴散数据（账号密码混杂文本）"
    />

    <div class="btn-group">
      <el-button type="primary" @click="convert">转换</el-button>
      <el-button type="success" :disabled="!outputData" :loading="importing" @click="acceptAndLogin">
        接受结果并登录
      </el-button>
    </div>

    <el-input
      v-model="outputData"
      type="textarea"
      :rows="10"
      placeholder="转换结果（可手动修改）"
    />
  </div>
</template>

<script setup>
import {onMounted, ref} from 'vue'
import {ElMessage} from 'element-plus'
import {login} from '#features/login.mjs'
import getUserInfo, {getModifyPageInfo} from '#features/getUserInfo.mjs'

const rawData = ref('')
const outputData = ref('')
const importing = ref(false)
const apiKey = ref('')

onMounted(async () => {
  const wrapper = await chrome.storage.local.get('aiApiKey')
  if (wrapper.aiApiKey) {
    apiKey.value = wrapper.aiApiKey
  }
})

async function saveApiKey() {
  if (!apiKey.value.trim()) {
    ElMessage.warning('请输入 API Key')
    return
  }
  await chrome.storage.local.set({aiApiKey: apiKey.value.trim()})
  ElMessage.success('API Key 已保存')
}

/**
 * 从杂乱的文本中提取账号和密码
 */
function extractCredentials(rawText) {
  if (typeof rawText !== 'string') {
    throw new TypeError('传入的参数必须是字符串')
  }
  if (!rawText.trim()) {
    return []
  }
  const regex = /^([a-zA-Z0-9]+)\D+.*?([a-zA-Z0-9]+)\D*$/gm
  return Array.from(rawText.matchAll(regex), match => ({
    username: match[1],
    password: match[2]
  }))
}

function convert() {
  try {
    const result = extractCredentials(rawData.value)
    if (result.length === 0) {
      ElMessage.warning('未提取到有效账号密码')
      return
    }
    outputData.value = JSON.stringify(result, null, 2)
    ElMessage.success(`提取到 ${result.length} 组账号`)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

/**
 * 从输出框的JSON中删除指定账号
 */
function removeAccountFromOutput(username) {
  try {
    const accounts = JSON.parse(outputData.value)
    const idx = accounts.findIndex(a => a.username === username)
    if (idx !== -1) {
      accounts.splice(idx, 1)
      outputData.value = accounts.length > 0 ? JSON.stringify(accounts, null, 2) : ''
    }
  } catch {
    // JSON 解析失败则忽略
  }
}

async function acceptAndLogin() {
  let accounts
  try {
    accounts = JSON.parse(outputData.value)
  } catch {
    ElMessage.error('JSON 格式错误，请检查')
    return
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    ElMessage.warning('没有可导入的账号')
    return
  }

  if (!apiKey.value.trim()) {
    ElMessage.warning('请先配置 API Key')
    return
  }

  importing.value = true
  let success = 0
  let fail = 0

  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}

  // 并发登录所有账号（验证码各自并行处理）
  const tasks = accounts.map(acc => login(acc.username, acc.password, {
    apiKey: apiKey.value.trim()
  }))
  const results = await Promise.allSettled(tasks)

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const acc = accounts[i]

    if (result.status === 'fulfilled' && result.value.success) {
      try {
        const necessaryCookies = ['Puser', 'Uauth', 'Pauth', 'Xauth', 'ptusertype']
        const savedCookies = result.value.cookies.filter(c => necessaryCookies.includes(c.name))

        const puserCookie = savedCookies.find(c => c.name === 'Puser')
        if (!puserCookie) {
          fail++
          continue
        }

        const puser = puserCookie.value
        const userInfo = await getUserInfo(puser, savedCookies)
        const modifyInfo = await getModifyPageInfo(savedCookies)

        // 保留原有的 parentFolderId
        const existingFolderId = info[puser]?.parentFolderId

        info[puser] = {
          ...(userInfo || {}),
          puser,
          cookies: savedCookies,
          email: modifyInfo?.email || '',
          qq: modifyInfo?.qq || ''
        }

        // 如果原来有文件夹位置，保留
        if (existingFolderId !== undefined) {
          info[puser].parentFolderId = existingFolderId
        }

        success++
        removeAccountFromOutput(acc.username)
      } catch {
        fail++
      }
    } else {
      fail++
    }
  }

  await chrome.storage.local.set({info})
  importing.value = false

  ElMessage.success(`完成：成功 ${success}，失败 ${fail}`)
}
</script>

<style scoped>
.batch-import {
  padding: 16px;
}

.batch-import h3 {
  margin: 0 0 16px 0;
}

.api-key-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.btn-group {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}
</style>
