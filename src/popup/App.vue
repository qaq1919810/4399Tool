<template>
  <div class="app">
    <div class="header">
      <h2>🎮 4399 账号管家</h2>
      <div class="header-btns">
        <el-button size="small" type="primary" @click="showCreateFolder = true">+ 文件夹</el-button>
      </div>
    </div>

    <!-- 顶部操作栏 -->
    <div class="top-actions">
      <el-button type="primary" :disabled="!auth" @click="saveCurrentAccount" class="btn-save">
        {{ auth ? '💾 保存/更新当前账号' : '❌ 未登录' }}
      </el-button>
      <el-button type="warning" @click="refreshAll" :loading="refreshing" class="btn-refresh">
        全部刷新
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
              {{ '📂 ' + folder.indent + folder.folderName }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" type="danger" @click="batchDelete">批量删除</el-button>
    </div>

    <!-- 账号列表 -->
    <div class="account-list">
      <template v-for="folder in folderTree" :key="folder.id">
        <!-- 文件夹 -->
        <div class="folder-block">
          <div class="folder-header">
            <span class="folder-name">📂 {{ folder.folderName }}</span>
            <div class="folder-actions">
              <el-button size="small" text @click="openRenameFolder(folder)">✏️</el-button>
              <el-dropdown @command="(cmd) => moveFolderTo(folder, cmd)" trigger="click">
                <el-button size="small" text>📦</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item :command="null">📄 顶层</el-dropdown-item>
                    <!--suppress JSUnusedLocalSymbols -->
                    <el-dropdown-item
                        v-for="f in flatFolders.filter(f => f.id !== folder.id && !isChildOf(folder.id, f.id))"
                        :key="f.id"
                        :command="f.id"
                    >
                      {{ '📂 ' + f.folderName }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-popover
                  placement="top"
                  :width="280"
                  :visible="openDeletePopoverId === folder.id"
              >
                <template #reference>
                  <el-button size="small" text type="danger" @click="openDeletePopoverId = folder.id">🗑️</el-button>
                </template>
                <div class="delete-confirm">
                  <p>确定删除文件夹「{{ folder.folderName }}」？</p>
                  <p class="delete-warn">内部 {{ countUsersInFolder(folder.id) }} 个账号也会被删除</p>
                  <div class="delete-actions">
                    <el-button size="small" @click="closePopover">取消</el-button>
                    <CooldownButton
                        :seconds="3"
                        type="danger"
                        size="small"
                        @confirm="deleteFolder(folder.id)"
                    />
                  </div>
                </div>
              </el-popover>
            </div>
          </div>

          <!-- 文件夹内的用户 -->
          <div class="folder-users">
            <AccountCard
                v-for="user in getUsersInFolder(folder.id)"
                :key="user.puser"
                :user="user"
                :checked="selectedUsers.includes(user.puser)"
                @toggle="toggleSelect(user.puser)"
                @refresh="refreshUser"
                @delete="deleteUser"
                @move="moveUserToFolder"
                :folders="flatFolders"
            />
            <div v-if="getUsersInFolder(folder.id).length === 0" class="empty-hint">暂无账号</div>
          </div>

          <!-- 子文件夹 -->
          <template v-for="child in folder.children" :key="child.id">
            <div class="folder-block sub-folder">
              <div class="folder-header">
                <span class="folder-name">📂 {{ child.folderName }}</span>
                <div class="folder-actions">
                  <el-button size="small" text @click="openRenameFolder(child)">✏️</el-button>
                  <el-dropdown @command="(cmd) => moveFolderTo(child, cmd)" trigger="click">
                    <el-button size="small" text>📦</el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item :command="null">📄 顶层</el-dropdown-item>
                        <!--suppress JSUnusedLocalSymbols -->
                        <el-dropdown-item
                            v-for="f in flatFolders.filter(f => f.id !== child.id && !isChildOf(child.id, f.id))"
                            :key="f.id"
                            :command="f.id"
                        >
                          {{ '📂 ' + f.folderName }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-popover
                      placement="top"
                      :width="280"
                      :visible="openDeletePopoverId === child.id"
                  >
                    <template #reference>
                      <el-button size="small" text type="danger" @click="openDeletePopoverId = child.id">🗑️</el-button>
                    </template>
                    <div class="delete-confirm">
                      <p>确定删除文件夹「{{ child.folderName }}」？</p>
                      <p class="delete-warn">内部 {{ countUsersInFolder(child.id) }} 个账号也会被删除</p>
                      <div class="delete-actions">
                        <el-button size="small" @click="closePopover">取消</el-button>
                        <CooldownButton
                            :seconds="3"
                            type="danger"
                            size="small"
                            @confirm="deleteFolder(child.id)"
                        />
                      </div>
                    </div>
                  </el-popover>
                </div>
              </div>
              <div class="folder-users">
                <AccountCard
                    v-for="user in getUsersInFolder(child.id)"
                    :key="user.puser"
                    :user="user"
                    :checked="selectedUsers.includes(user.puser)"
                    @toggle="toggleSelect(user.puser)"
                    @refresh="refreshUser"
                    @delete="deleteUser"
                    @move="moveUserToFolder"
                    :folders="flatFolders"
                />
                <div v-if="getUsersInFolder(child.id).length === 0" class="empty-hint">暂无账号</div>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- 顶层用户 -->
      <div class="top-level">
        <div class="folder-header" v-if="folderTree.length > 0">
          <span class="folder-name">📄 顶层</span>
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
                :label="'📂 ' + f.indent + f.folderName"
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
  </div>
</template>

<script setup>
import {ref, computed, onMounted} from 'vue'
import {ArrowDown} from '@element-plus/icons-vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import AccountCard from './components/AccountCard.vue'
import CooldownButton from './components/CooldownButton.vue'
import {
  getFolderTree,
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  renameFolder as apiRenameFolder,
  moveFolder as apiMoveFolder,
  moveUserToFolder as apiMoveUserToFolder
} from '#features/folderManager.mjs'
import {getCurrentUserAuth} from '#features/getCurrentUserAuth.mjs'
import getUserInfo from '#features/getUserInfo.mjs'

// ====== 状态 ======
const loading = ref(true)
const auth = ref(null)
const accounts = ref({})
const folderTree = ref([])
const selectedUsers = ref([])
const refreshing = ref(false)

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

  function flatten(nodes, indent = '') {
    for (const node of nodes) {
      result.push({...node, indent})
      if (node.children?.length) {
        flatten(node.children, indent + '  ')
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

function countUsersInFolder(folderId) {
  let count = getUsersInFolder(folderId).length
  const children = folderTree.value.find(f => f.id === folderId)?.children || []
  for (const child of children) {
    count += countUsersInFolder(child.id)
  }
  return count
}

function isChildOf(parentId, childId) {
  const parent = folderTree.value.find(f => f.id === parentId)
  if (!parent?.children) return false
  for (const child of parent.children) {
    if (child.id === childId) return true
    if (isChildOf(child.id, childId)) return true
  }
  return false
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

async function refreshData() {
  folderTree.value = await getFolderTree()
  const wrapper = await chrome.storage.local.get('info')
  accounts.value = wrapper.info || {}
}

async function saveCurrentAccount() {
  // 重新检测当前登录账号，不依赖缓存的 auth.value
  const btnAuth = await getCurrentUserAuth()
  if (!btnAuth) return

  ElMessage.info('正在抓取账号数据...')

  const userData = await getUserInfo(btnAuth.puser, btnAuth.cookies)
  if (!userData) {
    ElMessage.error('获取用户信息失败！')
    return
  }

  userData.cookies = btnAuth.cookies

  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}
  info[userData.puser] = userData
  await chrome.storage.local.set({info})

  auth.value = btnAuth
  ElMessage.success('保存成功！')
  await refreshData()
}

async function refreshAll() {
  refreshing.value = true
  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}
  const pusers = Object.keys(info)

  let successCount = 0
  for (const puser of pusers) {
    const acc = info[puser]
    const cookies = acc?.cookies || null
    const userData = await getUserInfo(puser, cookies)
    if (userData) {
      info[puser] = {...info[puser], ...userData}
      successCount++
    }
  }

  await chrome.storage.local.set({info})
  ElMessage.success(`刷新完成，成功 ${successCount}/${pusers.length} 个账号`)
  await refreshData()
  refreshing.value = false
}

async function refreshUser(puser) {
  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}
  const acc = info[puser]
  const cookies = acc?.cookies || null
  const userData = await getUserInfo(puser, cookies)
  if (userData) {
    info[puser] = {...info[puser], ...userData}
    await chrome.storage.local.set({info})
    ElMessage.success(`账号 ${acc.nickname} 刷新成功！`)
    await refreshData()
  } else {
    ElMessage.error('刷新失败')
  }
}

async function deleteUser(puser) {
  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}
  const name = info[puser]?.nickname || puser
  delete info[puser]
  await chrome.storage.local.set({info})
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

  const wrapper = await chrome.storage.local.get('info')
  const info = wrapper.info || {}
  for (const puser of selectedUsers.value) {
    delete info[puser]
  }
  await chrome.storage.local.set({info})
  ElMessage.success(`已删除 ${selectedUsers.value.length} 个账号`)
  selectedUsers.value = []
  await refreshData()
}

// ====== 文件夹操作 ======
async function createFolder() {
  const result = await apiCreateFolder(newFolderName.value, newFolderParent.value)
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
  const result = await apiRenameFolder(renameFolderId.value, renameFolderName.value)
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
  const result = await apiDeleteFolder(id)
  if (result.success) {
    ElMessage.success(`已删除文件夹及 ${result.deletedUsers} 个账号`)
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function moveFolderTo(folder, newParentId) {
  const result = await apiMoveFolder(folder.id, newParentId)
  if (result.success) {
    ElMessage.success('移动成功')
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function moveUserToFolder(puser, folderId) {
  const result = await apiMoveUserToFolder(puser, folderId)
  if (result.success) {
    ElMessage.success('移动成功')
    await refreshData()
  } else {
    ElMessage.error(result.message)
  }
}

async function batchMoveToFolder(folderId) {
  for (const puser of selectedUsers.value) {
    await apiMoveUserToFolder(puser, folderId)
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

.folder-block {
  background: white;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
}

.folder-block.sub-folder {
  margin: 8px 12px;
  border: 1px dashed #ccc;
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
}

.folder-actions {
  display: flex;
  gap: 2px;
}

.folder-users {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-hint {
  text-align: center;
  color: #999;
  font-size: 12px;
  padding: 12px;
}

.top-level {
  margin-top: 4px;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}

.delete-confirm p {
  margin: 0 0 8px;
  font-size: 14px;
}

.delete-warn {
  color: #f56c6c;
  font-size: 12px !important;
}

.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
