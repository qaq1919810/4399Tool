<template>
  <div class="app">
    <div class="header">
      <h2>4399 账号管家</h2>
      <div class="header-btns">
        <el-button size="small" @click="openSettings">⚙ 设置</el-button>
        <el-button size="small" type="success" @click="showLoginDialog = true">🔑 登录</el-button>
        <el-button size="small" type="primary" @click="showCreateFolder = true">+ 文件夹</el-button>
      </div>
    </div>
    <el-divider style="margin: 8px 0"/>

    <!-- 顶部操作栏 -->
    <div class="top-actions">
      <el-button type="primary" :disabled="!auth" @click="saveCurrentAccount" class="btn-save">
        {{ auth ? '保存/更新当前账号' : '❌ 未登录' }}
      </el-button>
      <el-button type="warning" @click="refreshAll" :loading="refreshing" class="btn-refresh">
        全部刷新
      </el-button>
      <el-button type="success" @click="batchImport">批量导入</el-button>
    </div>

    <div class="sort-bar">
      <span class="sort-label">文件夹排序</span>
      <el-select v-model="folderSortBy" size="small" class="sort-select" @change="changeFolderSortBy">
        <el-option value="createdAt" label="创建时间"/>
        <el-option value="updatedAt" label="最后修改时间"/>
        <el-option value="name" label="首字母"/>
        <el-option value="accountCount" label="账号数量"/>
      </el-select>
      <el-button size="small" @click="toggleFolderSortDirection">
        {{ folderSortDirection === 'asc' ? '↑ 升序' : '↓ 降序' }}
      </el-button>
    </div>

    <!-- 多选操作栏 -->
    <div v-if="selectedUsers.length > 0" class="batch-bar">
      <el-checkbox v-model="selectAll" @change="toggleSelectAll">全选</el-checkbox>
      <span class="selected-count">已选 {{ selectedUsers.length }} 项</span>
      <el-dropdown @command="batchMoveToFolder" trigger="click">
        <el-button size="small" type="primary">
          移到文件夹
          <el-icon>
            <ArrowDown/>
          </el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :command="null">📄 顶层</el-dropdown-item>
            <el-dropdown-item
                v-for="folder in flatFolders"
                :key="folder.id"
                :command="folder.id"
            >
              <span class="folder-path-option" :title="folder.path">📂 {{ folder.path }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" type="warning" @click="batchEdit">批量修改</el-button>
      <el-button size="small" type="danger" @click="batchDelete">批量删除</el-button>
    </div>

    <!-- 账号列表 -->
    <div class="account-list">
      <FolderNode
          v-for="folder in folderTree"
          :key="folder.id"
          :folder="folder"
          :accounts="allUsers"
          :selected-users="selectedUsers"
          :flat-folders="flatFolders"
          :open-delete-popover-id="openDeletePopoverId"
          @toggle-user="toggleSelect"
          @toggle-folder-select="toggleFolderSelect"
          @refresh-user="refreshUser"
          @delete-user="deleteUser"
          @move-user="moveUserToFolder"
          @save-remark="saveRemark"
          @record-password="recordPassword"
          @copy-password="copyPassword"
          @delete-password="deletePassword"
          @rename-folder="openRenameFolder"
          @move-folder="moveFolderTo"
          @open-delete="folderId => openDeletePopoverId = folderId"
          @close-delete="closePopover"
          @delete-folder="deleteFolder"
      />

      <!-- 顶层用户 -->
      <div class="top-level">
        <div class="folder-header" v-if="folderTree.length > 0">
          <el-checkbox
              :model-value="isFolderSelected(null)"
              @change="toggleFolderSelect(null)"
          />
          <span class="folder-name">顶层</span>
        </div>
        <AccountCard
            v-for="user in getUsersInFolder(null)"
            :key="user.puser"
            :user="user"
            :checked="selectedUsers.includes(user.puser)"
            @toggle="toggleSelect(user.puser)"
            @refresh="refreshUser"
            @delete="deleteUser"
            @move="moveUserToFolder"
            @save-remark="saveRemark"
            @record-password="recordPassword"
            @copy-password="copyPassword"
            @delete-password="deletePassword"
            :folders="flatFolders"
        />
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="accounts.length === 0 && !loading" class="empty-state">
      暂无保存的账号
    </div>

    <!-- 创建文件夹对话框 -->
    <el-dialog v-model="showCreateFolder" title="新建文件夹" width="320px">
      <el-form label-width="60px">
        <el-form-item label="名称">
          <el-input v-model="newFolderName" placeholder="输入文件夹名称"/>
        </el-form-item>
        <el-form-item label="位置">
          <el-select v-model="newFolderParent" style="width: 100%">
            <el-option :value="null" label="📄 顶层"/>
            <el-option
                v-for="f in flatFolders"
                :key="f.id"
                :value="f.id"
                :label="'📂 ' + f.path"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateFolder = false">取消</el-button>
        <el-button type="primary" @click="createFolder">确定</el-button>
      </template>
    </el-dialog>

    <!-- 重命名文件夹对话框 -->
    <el-dialog v-model="showRenameFolder" title="重命名文件夹" width="320px">
      <el-input v-model="renameFolderName" placeholder="输入新名称"/>
      <template #footer>
        <el-button @click="showRenameFolder = false">取消</el-button>
        <el-button type="primary" @click="renameFolder">确定</el-button>
      </template>
    </el-dialog>

    <!-- 登录对话框 -->
    <el-dialog v-model="showLoginDialog" title="4399 登录" width="80%">
      <el-form class="login-form" label-width="100px">
        <el-form-item label="账号">
          <el-input v-model="loginForm.username" placeholder="用户名或手机号" @keyup.enter="handleLogin"/>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" placeholder="密码" show-password
                    @keyup.enter="handleLogin"/>
        </el-form-item>
        <el-form-item label="保存密码">
          <el-checkbox v-model="saveLoginPassword">保存到插件本地</el-checkbox>
        </el-form-item>
        <el-form-item label="API Key">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="loginApiKey" type="password" placeholder="Gemini API Key（可选）" show-password
                      style="flex: 1"/>
            <el-button @click="saveLoginApiKey">保存</el-button>
          </div>
        </el-form-item>
        <el-form-item label="验证码">
          <el-checkbox v-model="manualCaptcha">手动输入验证码</el-checkbox>
        </el-form-item>
        <el-form-item v-if="showCaptchaInput" label="验证码">
          <div class="captcha-section">
            <img :src="captchaImageUrl" class="captcha-img" @click="refreshCaptcha" alt="验证码"/>
            <el-input v-model="loginCaptcha" placeholder="输入验证码" @keyup.enter="handleCaptchaLogin"/>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLoginDialog = false">取消</el-button>
        <el-button v-if="showCaptchaInput" type="primary" @click="handleCaptchaLogin" :loading="loginLoading">
          验证码登录
        </el-button>
        <el-button v-else type="primary" @click="handleLogin" :loading="loginLoading">登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, onMounted, ref} from 'vue'
import {ArrowDown} from '@element-plus/icons-vue'
import AccountCard from './components/AccountCard.vue'
import FolderNode from './components/FolderNode.vue'
import FolderManager from '#features/folderManager.mjs'
import {getCurrentUserAuth} from '#features/getCurrentUserAuth.mjs'
import getUserInfo, {getModifyPageInfo} from '#features/getUserInfo.mjs'
import {login, loginWithCaptcha} from '#features/login.mjs'
import windowManager from '#utils/windowManager.mjs'
import {encryptPassword} from '#utils/passwordCrypto.mjs'

// ====== 状态 ======
const loading = ref(true)
const auth = ref(null)
const accounts = ref({})
const folderTree = ref([])
const FOLDER_SORT_BY_KEY = '4399-folder-sort-by'
const FOLDER_SORT_DIRECTION_KEY = '4399-folder-sort-direction'
const FOLDER_SORT_BY_VALUES = new Set(['createdAt', 'updatedAt', 'name', 'accountCount'])
const FOLDER_SORT_DIRECTION_VALUES = new Set(['asc', 'desc'])
const savedFolderSortBy = localStorage.getItem(FOLDER_SORT_BY_KEY)
const savedFolderSortDirection = localStorage.getItem(FOLDER_SORT_DIRECTION_KEY)
const folderSortBy = ref(FOLDER_SORT_BY_VALUES.has(savedFolderSortBy) ? savedFolderSortBy : 'updatedAt')
const folderSortDirection = ref(
    FOLDER_SORT_DIRECTION_VALUES.has(savedFolderSortDirection) ? savedFolderSortDirection : 'desc'
)
const selectedUsers = ref([])
const refreshing = ref(false)

// 登录相关状态
const showLoginDialog = ref(false)
const loginLoading = ref(false)
const loginForm = ref({username: '', password: ''})
const saveLoginPassword = ref(false)
const loginApiKey = ref('')
const manualCaptcha = ref(false)
const showCaptchaInput = ref(false)
const loginCaptcha = ref('')
const loginSessionId = ref('')
const captchaImageUrl = ref('')

// 创建文件夹
const showCreateFolder = ref(false)
const newFolderName = ref('')
const newFolderParent = ref(null)

// 重命名文件夹
const showRenameFolder = ref(false)
const renameFolderId = ref(null)
const renameFolderName = ref('')

// ====== 计算属性 ======
const allUsers = computed(() => Object.values(accounts.value))

const flatFolders = computed(() => {
  const result = []

  function flatten(nodes, parentPath = '', depth = 0) {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath} / ${node.folderName}` : node.folderName
      result.push({...node, path, depth})
      if (node.children?.length) {
        flatten(node.children, path, depth + 1)
      }
    }
  }

  flatten(folderTree.value)
  return result
})

const selectAll = computed({
  get: () => selectedUsers.value.length === allUsers.value.length && allUsers.value.length > 0,
  set: () => {
  }
})

// ====== 删除弹窗控制 ======
const openDeletePopoverId = ref(null)

function getUsersInFolder(folderId) {
  return allUsers.value.filter(u => (u.parentFolderId ?? null) === folderId)
}

function toggleSelect(puser) {
  const idx = selectedUsers.value.indexOf(puser)
  if (idx >= 0) {
    selectedUsers.value.splice(idx, 1)
  } else {
    selectedUsers.value.push(puser)
  }
}

function toggleSelectAll(val) {
  if (val) {
    selectedUsers.value = allUsers.value.map(u => u.puser)
  } else {
    selectedUsers.value = []
  }
}

function getDescendantFolderIds(folderId) {
  if (folderId === null) return new Set([null])
  const root = flatFolders.value.find(folder => folder.id === folderId)
  if (!root) return new Set()

  const ids = new Set([root.id])
  const visit = children => {
    for (const child of children || []) {
      ids.add(child.id)
      visit(child.children)
    }
  }
  visit(root.children)
  return ids
}

function isFolderSelected(folderId) {
  const folderIds = getDescendantFolderIds(folderId)
  const users = allUsers.value.filter(user => folderIds.has(user.parentFolderId ?? null))
  return users.length > 0 && users.every(user => selectedUsers.value.includes(user.puser))
}

function toggleFolderSelect(folderId) {
  const folderIds = getDescendantFolderIds(folderId)
  const users = allUsers.value.filter(user => folderIds.has(user.parentFolderId ?? null))
  const pusers = users.map(u => u.puser)
  const allSelected = pusers.length > 0 && pusers.every(p => selectedUsers.value.includes(p))

  if (allSelected) {
    selectedUsers.value = selectedUsers.value.filter(p => !pusers.includes(p))
  } else {
    const newSelected = new Set(selectedUsers.value)
    pusers.forEach(p => newSelected.add(p))
    selectedUsers.value = [...newSelected]
  }
}

async function saveLoginApiKey() {
  if (!loginApiKey.value.trim()) {
    ElMessage.warning('请输入 API Key')
    return
  }
  await FolderManager.saveApiKey(loginApiKey.value.trim())
  ElMessage.success('API Key 已保存')
}

async function handleLogin() {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }

  loginLoading.value = true
  showCaptchaInput.value = false

  // 第一次尝试登录
  const result = await login(loginForm.value.username, loginForm.value.password, {
    apiKey: manualCaptcha.value ? '' : loginApiKey.value.trim(),
    captchaText: manualCaptcha.value ? '' : ''
  })

  // 需要验证码
  if (result.needCaptcha) {
    if (manualCaptcha.value) {
      // 手动模式：显示验证码输入框和图片
      loginSessionId.value = result.sessionId
      captchaImageUrl.value = `https://ptlogin.4399.com/ptlogin/captcha.do?captchaId=${result.sessionId}`
      showCaptchaInput.value = true
      loginLoading.value = false
      ElMessage.info('请输入验证码后再次点击登录')
      return
    } else {
      // AI 模式但没有 apiKey
      loginLoading.value = false
      ElMessage.error('需要验证码但未配置 API Key')
      return
    }
  }

  // 登录成功
  if (result.success) {
    await saveLoginResult(result)
  } else {
    loginLoading.value = false
    ElMessage.error(result.message || '登录失败')
  }
}

// 验证码登录（手动输入后调用）
async function handleCaptchaLogin() {
  if (!loginCaptcha.value.trim()) {
    ElMessage.warning('请输入验证码')
    return
  }

  loginLoading.value = true
  const result = await loginWithCaptcha(
    loginForm.value.username,
    loginForm.value.password,
    loginSessionId.value,
    loginCaptcha.value.trim()
  )
  loginLoading.value = false

  if (result.success) {
    await saveLoginResult(result)
  } else {
    ElMessage.error(result.message || '验证码登录失败')
    // 清空验证码输入，让用户重试
    loginCaptcha.value = ''
    showCaptchaInput.value = false
  }
}

function refreshCaptcha() {
  // 点击刷新验证码图片（URL不变，图片会变）
  captchaImageUrl.value = `https://ptlogin.4399.com/ptlogin/captcha.do?captchaId=${loginSessionId.value}&t=${Date.now()}`
}

// 保存登录结果
async function saveLoginResult(result) {
  // 过滤必要 cookie
  const necessaryCookies = ['Puser', 'Uauth', 'Pauth', 'Xauth', 'ptusertype']
  const savedCookies = result.cookies.filter(c => necessaryCookies.includes(c.name))

  // 获取 Puser 作为账号 ID
  const puserCookie = savedCookies.find(c => c.name === 'Puser')
  if (!puserCookie) {
    ElMessage.error('登录失败：未获取到用户 ID')
    loginLoading.value = false
    return
  }

  const puser = puserCookie.value

  // 用这些 cookie 获取用户信息
  ElMessage.info('正在获取用户信息...')
  const userInfo = await getUserInfo(puser, savedCookies)
  const modifyInfo = await getModifyPageInfo(savedCookies)

  await FolderManager.saveAccount({
    ...(userInfo || {}),
    puser,
    cookies: savedCookies,
    email: modifyInfo?.email || '',
    qq: modifyInfo?.qq || '',
    ...(saveLoginPassword.value ? {password: encryptPassword(loginForm.value.password)} : {})
  })

  loginLoading.value = false
  ElMessage.success('登录成功！账号已保存')
  showLoginDialog.value = false
  loginForm.value = {username: '', password: ''}
  saveLoginPassword.value = false
  loginCaptcha.value = ''
  showCaptchaInput.value = false
  captchaImageUrl.value = ''

  // 刷新列表
  await refreshData()
}

async function refreshData() {
  folderTree.value = await FolderManager.getFolderTree({
    sortBy: folderSortBy.value,
    sortDirection: folderSortDirection.value
  })
  accounts.value = await FolderManager.getAccounts()
}

async function changeFolderSortBy() {
  localStorage.setItem(FOLDER_SORT_BY_KEY, folderSortBy.value)
  await refreshData()
}

async function toggleFolderSortDirection() {
  folderSortDirection.value = folderSortDirection.value === 'asc' ? 'desc' : 'asc'
  localStorage.setItem(FOLDER_SORT_DIRECTION_KEY, folderSortDirection.value)
  await refreshData()
}

async function saveCurrentAccount() {
  // 重新检测当前登录账号，不依赖缓存的 auth.value
  const btnAuth = await getCurrentUserAuth()
  if (!btnAuth) {
    auth.value = null
    ElMessage.warning('当前没有登录账号')
    return
  }

  ElMessage.info('正在抓取账号数据...')

  const modifyInfo = await getModifyPageInfo(btnAuth.cookies)
  if (modifyInfo.isLoggedIn === false) {
    auth.value = null
    ElMessage.warning('当前没有登录账号')
    return
  }
  if (modifyInfo.isLoggedIn === null) {
    ElMessage.error('无法确认当前登录状态，请稍后重试')
    return
  }

  const userData = await getUserInfo(btnAuth.puser, btnAuth.cookies)
  if (!userData) {
    ElMessage.error('获取用户信息失败！')
    return
  }

  userData.email = modifyInfo.email
  userData.qq = modifyInfo.qq

  userData.cookies = btnAuth.cookies

  await FolderManager.saveAccount(userData)

  auth.value = btnAuth
  ElMessage.success('保存成功！')
  await refreshData()
}

async function refreshAll() {
  refreshing.value = true
  const info = await FolderManager.getAccounts()
  const pusers = Object.keys(info)

  const patches = {}
  for (const puser of pusers) {
    const acc = info[puser]
    const cookies = acc?.cookies || null
    const userData = await getUserInfo(puser, cookies)
    if (userData) {
      // 获取修改页面的邮箱和QQ
      const modifyInfo = await getModifyPageInfo(cookies)
      userData.email = modifyInfo.email
      userData.qq = modifyInfo.qq

      patches[puser] = userData
    }
  }

  const successCount = await FolderManager.patchAccounts(patches)
  ElMessage.success(`刷新完成，成功 ${successCount}/${pusers.length} 个账号`)
  await refreshData()
  refreshing.value = false
}

async function refreshUser(puser) {
  const info = await FolderManager.getAccounts()
  const acc = info[puser]
  const cookies = acc?.cookies || null
  const userData = await getUserInfo(puser, cookies)
  if (userData) {
    // 获取修改页面的邮箱和QQ
    const modifyInfo = await getModifyPageInfo(cookies)
    userData.email = modifyInfo.email
    userData.qq = modifyInfo.qq

    if (await FolderManager.patchAccount(puser, userData)) {
      ElMessage.success(`账号 ${acc.nickname} 刷新成功！`)
      await refreshData()
    } else {
      ElMessage.warning('账号已被删除，未写入刷新结果')
    }
  } else {
    ElMessage.error('刷新失败')
  }
}

async function deleteUser(puser) {
  const account = await FolderManager.deleteAccount(puser)
  const name = account?.nickname || puser
  ElMessage.success(`已删除账号「${name}」`)
  selectedUsers.value = selectedUsers.value.filter(p => p !== puser)
  await refreshData()
}

async function batchDelete() {
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedUsers.value.length} 个账号？`, '批量删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  const deletedCount = await FolderManager.deleteAccounts(selectedUsers.value)
  ElMessage.success(`已删除 ${deletedCount} 个账号`)
  selectedUsers.value = []
  await refreshData()
}

async function batchEdit() {
  const info = await FolderManager.getAccounts()
  const selectedAccounts = selectedUsers.value.map(puser => info[puser]).filter(Boolean)

  if (selectedAccounts.length === 0) {
    ElMessage.warning('未找到选中的账号数据')
    return
  }

  const handle = await windowManager.create('src/html/popup/batchEdit/batch-edit.html', {width: 500, height: 600})
  if (handle) {
    await handle.exec((win) => {
      win.__BATCH_DATA__ = selectedAccounts
    })
  }
}

async function batchImport() {
  await windowManager.create('src/html/popup/batchImport/index.html', {width: 600, height: 500})
}

async function openSettings() {
  await windowManager.create('src/html/popup/settings/index.html', {width: 500, height: 600})
}

// ====== 文件夹操作 ======
async function createFolder() {
  const result = await FolderManager.createFolder(newFolderName.value, newFolderParent.value)
  if (result.success) {
    ElMessage.success('文件夹创建成功')
    showCreateFolder.value = false
    newFolderName.value = ''
    newFolderParent.value = null
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

function openRenameFolder(folder) {
  renameFolderId.value = folder.id
  renameFolderName.value = folder.folderName
  showRenameFolder.value = true
}

async function renameFolder() {
  const result = await FolderManager.renameFolder(renameFolderId.value, renameFolderName.value)
  if (result.success) {
    ElMessage.success('重命名成功')
    showRenameFolder.value = false
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function deleteFolder(id) {
  openDeletePopoverId.value = null
  const result = await FolderManager.deleteFolder(id)
  if (result.success) {
    ElMessage.success(`已删除文件夹及 ${result.deletedUsers} 个账号`)
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function moveFolderTo(folder, newParentId) {
  const result = await FolderManager.moveFolder(folder.id, newParentId)
  if (result.success) {
    ElMessage.success('移动成功')
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function moveUserToFolder(puser, folderId) {
  const result = await FolderManager.moveUserToFolder(puser, folderId)
  if (result.success) {
    ElMessage.success('移动成功')
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function saveRemark(puser, remark) {
  if (await FolderManager.setAccountRemark(puser, remark)) {
    ElMessage.success('备注已保存')
    await refreshData()
  } else {
    ElMessage.error('账号不存在，备注保存失败')
  }
}

async function copyPassword(puser) {
  try {
    const password = await FolderManager.getAccountPassword(puser)
    if (!password) {
      ElMessage.warning('该账号没有保存密码')
      return
    }
    await navigator.clipboard.writeText(password)
    ElMessage.success('密码已复制')
  } catch (error) {
    ElMessage.error(error.message || '复制密码失败')
  }
}

async function recordPassword(puser, password, done = () => {}) {
  const account = accounts.value[puser]
  if (!account || account.password) {
    ElMessage.error(account ? '该账号已经保存密码' : '账号不存在')
    done(false)
    return
  }

  try {
    const result = await login(account.username, password, {apiKey: loginApiKey.value.trim()})
    if (!result.success) {
      ElMessage.error(result.needCaptcha ? '登录验证需要验证码，密码未保存' : result.message || '登录验证失败')
      done(false)
      return
    }

    const loginPuser = result.cookies?.find(cookie => cookie.name === 'Puser')?.value
    if (!loginPuser || loginPuser !== puser) {
      ElMessage.error('登录成功的账号与当前账号不一致，密码未保存')
      done(false)
      return
    }

    if (!await FolderManager.setAccountPassword(puser, password)) {
      ElMessage.error('账号不存在，密码保存失败')
      done(false)
      return
    }

    ElMessage.success('密码验证成功并已保存')
    await refreshData()
    done(true)
  } catch (error) {
    ElMessage.error(error.message || '密码验证失败')
    done(false)
  }
}

async function deletePassword(puser) {
  if (await FolderManager.deleteAccountPassword(puser)) {
    ElMessage.success('密码已删除')
    await refreshData()
  } else {
    ElMessage.error('账号不存在，密码删除失败')
  }
}

async function batchMoveToFolder(folderId) {
  for (const puser of selectedUsers.value) {
    await FolderManager.moveUserToFolder(puser, folderId)
  }
  ElMessage.success(`已移动 ${selectedUsers.value.length} 个账号`)
  selectedUsers.value = []
  await refreshData()
}

function closePopover() {
  openDeletePopoverId.value = null
}

// ====== 初始化 ======
onMounted(async () => {
  // 点击外部关闭删除弹窗
  document.addEventListener('click', (e) => {
    if (openDeletePopoverId.value !== null) {
      const popover = e.target.closest('.el-popover')
      const triggerBtn = e.target.closest('.folder-actions')
      if (!popover && !triggerBtn) {
        openDeletePopoverId.value = null
      }
    }
  })

  // 加载 API Key
  const aiApiKey = await FolderManager.getApiKey()
  if (aiApiKey) {
    loginApiKey.value = aiApiKey
  }

  auth.value = await getCurrentUserAuth()
  await refreshData()
  loading.value = false
})
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f7f9;
}

.app {
  padding: 12px;
  max-width: 600px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header h2 {
  font-size: 18px;
  color: #333;
}

.header-btns {
  display: flex;
  gap: 6px;
}

.top-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.sort-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
}

.sort-label {
  color: #606266;
  font-size: 13px;
  white-space: nowrap;
}

.sort-select {
  flex: 1;
}

.folder-path-option {
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-form .el-form-item__label,
.login-form .el-checkbox__label {
  white-space: nowrap;
}

.btn-save {
  flex: 1;
}

.btn-refresh {
  flex: 1;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #e3f2fd;
  border-radius: 8px;
  margin-bottom: 12px;
}

.selected-count {
  font-size: 13px;
  color: #1976d2;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.folder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
}

.folder-name {
  font-weight: 500;
  color: #333;
  margin-left: 8px;
  flex: 1;
}

.top-level {
  margin-top: 4px;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}

.captcha-section {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.captcha-img {
  height: 32px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}
</style>
