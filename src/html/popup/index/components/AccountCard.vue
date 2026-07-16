<template>
  <div class="account-card" :class="{ selected: checked }">
    <el-checkbox :model-value="checked" @change="$emit('toggle')" class="card-checkbox"/>

    <img class="avatar" :src="avatarUrl" alt="头像"/>

    <div class="info">
      <h4>
        {{ user.nickname }}
        <el-tag :type="user.authStatus === '已身份认证' ? 'success' : 'danger'" size="small">
          {{ user.authStatus }}
        </el-tag>
      </h4>
      <p>账号: {{ user.username }}</p>
      <p>信息: {{ user.gender }} | 地区: {{ user.region }} | QQ: {{ user.qq }}</p>
    </div>

    <div class="btn-group">
      <el-button size="small" type="primary" @click.stop="handleSwitch" :loading="switching">
        切换
      </el-button>
      <el-button size="small" class="query-toggle" @click.stop="showGameQuery = !showGameQuery">
        {{ showGameQuery ? '收起查询' : '游戏查询' }}
      </el-button>
      <el-dropdown @command="handleCommand" trigger="click">
        <el-button size="default" text type="info" class="more-btn">⋮</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="edit">✏️ 修改</el-dropdown-item>
            <el-dropdown-item command="refresh">🔄 刷新</el-dropdown-item>
            <el-dropdown-item command="move" divided>📁 移动到</el-dropdown-item>
            <el-dropdown-item command="delete" divided>
              <span style="color: #f56c6c">🗑️ 删除</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 移动到文件夹 -->
    <el-popover v-model:visible="showMovePopover" placement="right" :width="200" trigger="click">
      <template #reference>
        <span ref="moveTrigger" style="display: none"></span>
      </template>
      <div class="move-popover">
        <div class="move-title">移动到文件夹</div>
        <div class="move-list">
          <div class="move-item" @click="handleMove(null)">
            📄 顶层
          </div>
          <div
              v-for="folder in folders"
              :key="folder.id"
              class="move-item"
              @click="handleMove(folder.id)"
          >
            📂 {{ folder.indent }}{{ folder.folderName }}
          </div>
        </div>
      </div>
    </el-popover>

    <section v-if="showGameQuery" class="game-query-panel">
      <div class="query-heading">
        <div>
          <strong>游戏区服查询</strong>
          <span>使用账号 {{ user.username }} 的登录信息</span>
        </div>
        <el-tag size="small" type="info">间隔查询</el-tag>
      </div>

      <el-alert
          class="query-timing-alert"
          title="理论上每 3 秒以上可查询一个区服，多选时需要较长时间；最长等待时间按所选区服数量动态计算。"
          type="warning"
          :closable="false"
          show-icon
      />

      <el-input
          v-model="gamePath"
          size="small"
          placeholder="输入游戏缩写，例如 ssjj"
          clearable
          @keyup.enter="loadGameServers"
      >
        <template #prepend>/zhuanti/</template>
        <template #append>
          <el-button :loading="loadingServers" @click="loadGameServers">加载区服</el-button>
        </template>
      </el-input>

      <div v-if="serverOptions.length" class="server-selection">
        <el-checkbox
            :model-value="allServersSelected"
            :indeterminate="someServersSelected"
            @change="toggleAllServers"
        >
          全选
        </el-checkbox>
        <el-checkbox-group v-model="selectedServerIds" class="server-grid">
          <el-checkbox v-for="server in serverOptions" :key="server.sid" :value="server.sid">
            {{ server.sid }} · {{ server.name }}
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <p v-else class="server-load-hint">输入游戏缩写并加载后，将显示该游戏实际提供的区服。</p>

      <el-button
          type="primary"
          size="small"
          class="query-button"
          :loading="queryingGames"
          :disabled="serverOptions.length === 0"
          @click="handleGameQuery"
      >
        查询所选 {{ selectedServerIds.length }} 个区服
      </el-button>
    </section>

    <!-- 编辑表单 -->
    <div v-if="showEditForm" class="edit-form">
      <div class="edit-row">
        <label>昵称</label>
        <el-input v-model="editForm.nick" :placeholder="user.nickname" size="small"/>
      </div>
      <div class="edit-row">
        <label>邮箱</label>
        <el-input v-model="editForm.email" :placeholder="user.email || '未填写'" size="small"/>
      </div>
      <div class="edit-row">
        <label>性别</label>
        <el-select v-model="editForm.sex" placeholder="不修改" size="small" clearable>
          <el-option value="1" label="男"/>
          <el-option value="2" label="女"/>
        </el-select>
      </div>
      <div class="edit-row">
        <label>生日</label>
        <el-date-picker
            v-model="editForm.birthday"
            type="date"
            placeholder="选择日期"
            size="small"
            value-format="YYYY-MM-DD"
            style="width: 100%"
        />
      </div>
      <div class="edit-row">
        <label>地区</label>
        <div class="region-selects">
          <el-select v-model="editForm.province" placeholder="省份" size="small" @change="editForm.city = ''"
                     style="width: 50%">
            <el-option v-for="p in provinces" :key="p" :value="p" :label="p"/>
          </el-select>
          <el-select v-model="editForm.city" placeholder="城市" size="small" :disabled="!editForm.province"
                     style="width: 50%">
            <el-option v-for="c in cityOptions" :key="c" :value="c" :label="c"/>
          </el-select>
        </div>
      </div>
      <div class="edit-row">
        <label>QQ</label>
        <el-input v-model="editForm.qq" :placeholder="user.qq || '未填写'" size="small"/>
      </div>
      <div class="edit-row">
        <label>头像</label>
        <div style="width: 100%">
          <div v-if="editForm.avatar" class="avatar-preview" @click="triggerAvatarUpload">
            <img :src="avatarPreviewUrl" alt="头像"/>
            <div class="avatar-overlay">点击更换</div>
          </div>
          <el-upload
              v-else
              ref="avatarUploadRef"
              drag
              action="#"
              :auto-upload="false"
              :show-file-list="false"
              accept=".png,.jpg,.jpeg"
              :on-change="handleAvatarSelect"
          >
            <div style="padding: 10px">
              <div style="font-size: 12px">点击或拖拽图片</div>
            </div>
          </el-upload>
        </div>
      </div>
      <el-button type="primary" size="small" @click="handleSaveEdit" :loading="saving" style="width: 100%">
        保存修改
      </el-button>
    </div>
  </div>

  <el-dialog
      v-model="showQueryResults"
      :title="`${user.username} 的游戏区服查询结果`"
      width="80%"
      append-to-body
      :modal="true"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
  >
    <div v-if="queryResult" class="query-results">
      <div class="query-summary">
        <span>已选 <b>{{ queryResult.selectedCount }}</b></span>
        <span class="summary-success">成功 <b>{{ queryResult.successCount }}</b></span>
        <span class="summary-failure">失败 <b>{{ queryResult.failureCount }}</b></span>
        <span>角色 <b>{{ queryResult.roles.length }}</b></span>
      </div>

      <div v-if="queryResult.roles.length" class="role-list">
        <article v-for="(role, index) in queryResult.roles" :key="`${role.sid}-${role.roleName}-${index}`" class="role-row">
          <span class="server-badge">{{ role.sid }}区</span>
          <div class="role-main">
            <strong>{{ role.servName || `${role.sid}区` }} · {{ role.roleName || '未知角色' }}</strong>
            <small>等级 {{ role.level ?? '未知' }} · {{ Number(role.isBan) === 0 ? '状态正常' : '已封禁' }}</small>
          </div>
          <el-button
              v-if="role.gameLink"
              type="primary"
              size="small"
              :loading="enteringGameLink === role.gameLink"
              :disabled="Boolean(enteringGameLink) && enteringGameLink !== role.gameLink"
              @click="enterGameAsAccount(role.gameLink)"
          >
            以账号身份进入
          </el-button>
        </article>
      </div>
      <p v-else class="result-empty">所选区服均未查询到角色信息</p>

      <p v-if="queryResult.emptyServerIds.length" class="result-note">
        {{ formatServerIds(queryResult.emptyServerIds) }}区没有账号信息
      </p>
      <div v-if="queryResult.failures.length" class="failure-list">
        <p v-for="failure in queryResult.failures" :key="failure.sid">
          {{ failure.sid }}区查询失败：{{ failure.message }}
        </p>
      </div>
    </div>
    <template #footer>
      <el-button @click="showQueryResults = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {shadowFetch} from '#utils/shadowFetch.mjs'
import {modifyProfileAndAvatar} from '#features/modifyUserInfo.mjs'
import {getGameServerOptions, queryGameServers} from '#features/queryGameServers.mjs'
import {getRegionData} from '#utils/regionData.mjs'
import {systemNotification} from '#utils/notify.mjs'

const props = defineProps({
  user: Object,
  checked: Boolean,
  folders: Array
})

const emit = defineEmits(['toggle', 'refresh', 'delete', 'move'])

const switching = ref(false)
const showEditForm = ref(false)
const showMovePopover = ref(false)
const moveTrigger = ref(null)
const saving = ref(false)
const avatarUploadRef = ref(null)
const showGameQuery = ref(false)
const gamePath = ref('')
const serverOptions = ref([])
const loadedGamePath = ref('')
const loadingServers = ref(false)
const selectedServerIds = ref([])
const queryingGames = ref(false)
const queryResult = ref(null)
const showQueryResults = ref(false)
const enteringGameLink = ref('')

const avatarUrl = ref('https://via.placeholder.com/48')
const avatarObjectUrl = ref('')
const avatarPreviewUrl = ref('')

const editForm = ref({
  nick: '',
  email: '',
  sex: '',
  birthday: '',
  province: '',
  city: '',
  qq: '',
  avatar: null
})

const provinces = ref([])
const cityMap = ref({})

const cityOptions = computed(() => {
  return editForm.value.province ? (cityMap.value[editForm.value.province] || []) : []
})
const allServersSelected = computed(() =>
    serverOptions.value.length > 0 && selectedServerIds.value.length === serverOptions.value.length
)
const someServersSelected = computed(() =>
    selectedServerIds.value.length > 0 && !allServersSelected.value
)

function toggleAllServers() {
  selectedServerIds.value = allServersSelected.value ? [] : serverOptions.value.map(server => server.sid)
}

watch(gamePath, value => {
  if (value.trim() === loadedGamePath.value) return
  serverOptions.value = []
  selectedServerIds.value = []
  loadedGamePath.value = ''
})

async function loadGameServers() {
  if (!props.user.cookies?.length) {
    ElMessage.error('该账号没有可用 Cookie')
    return
  }

  loadingServers.value = true
  try {
    const normalizedGamePath = gamePath.value.trim()
    const servers = await getGameServerOptions(normalizedGamePath, props.user.cookies)
    serverOptions.value = servers
    selectedServerIds.value = []
    loadedGamePath.value = normalizedGamePath
  } catch (error) {
    serverOptions.value = []
    selectedServerIds.value = []
    loadedGamePath.value = ''
    ElMessage.error(error.message || '加载区服失败')
  } finally {
    loadingServers.value = false
  }
}

function formatServerIds(ids) {
  return ids.join('、')
}

async function handleGameQuery() {
  if (!props.user.cookies?.length) {
    ElMessage.error('该账号没有可用 Cookie')
    return
  }
  if (!serverOptions.value.length || gamePath.value.trim() !== loadedGamePath.value) {
    ElMessage.warning('请先加载当前游戏的区服列表')
    return
  }

  queryingGames.value = true
  queryResult.value = null
  try {
    const result = await queryGameServers(gamePath.value, selectedServerIds.value, props.user.cookies)
    queryResult.value = result
    showQueryResults.value = true
    try {
      await systemNotification(
          `选择 ${result.selectedCount} 个区服，成功 ${result.successCount} 个，失败 ${result.failureCount} 个`,
          `${props.user.username} 区服查询完成`
      )
    } catch (notificationError) {
      console.error('[4399管家] 区服查询完成通知发送失败:', notificationError)
    }
  } catch (error) {
    ElMessage.error(error.message || '区服查询失败')
  } finally {
    queryingGames.value = false
  }
}

function replaceAvatarObjectUrl(blob) {
  if (avatarObjectUrl.value) {
    URL.revokeObjectURL(avatarObjectUrl.value)
  }
  avatarObjectUrl.value = URL.createObjectURL(blob)
  avatarUrl.value = avatarObjectUrl.value
}

watch(() => editForm.value.avatar, (avatar) => {
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
  }
  avatarPreviewUrl.value = avatar ? URL.createObjectURL(avatar) : ''
})

onBeforeUnmount(() => {
  if (avatarObjectUrl.value) {
    URL.revokeObjectURL(avatarObjectUrl.value)
  }
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
  }
})

onMounted(async () => {
  // 加载地区数据
  const regionData = await getRegionData()
  provinces.value = regionData.provinces
  cityMap.value = regionData.cities

  if (props.user.avatar) {
    try {
      const resp = await shadowFetch(props.user.avatar, {
        headers: {'Referer': 'https://u.4399.com/'}
      })
      if (resp.ok) {
        const blob = await resp.blob()
        replaceAvatarObjectUrl(blob)
      }
    } catch {
      avatarUrl.value = 'https://via.placeholder.com/48'
    }
  }
})

async function applyAccountCookies() {
  const {cookies} = props.user
  if (!cookies || cookies.length === 0) throw new Error('该账号没有可用 Cookie')

  for (const cookie of cookies) {
    const path = cookie.path || '/'
    const setDetails = {
      url: `https://u.4399.com${path}`,
      name: cookie.name,
      value: cookie.value,
      path,
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly)
    }
    if (!cookie.session && cookie.expirationDate !== undefined) {
      setDetails.expirationDate = cookie.expirationDate
    }
    if (!cookie.hostOnly && cookie.domain) setDetails.domain = cookie.domain
    await chrome.cookies.set(setDetails)
  }
}

async function handleSwitch() {
  switching.value = true
  try {
    await applyAccountCookies()

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const tab = tabs[0]
      if (tab?.url?.includes('4399.com')) {
        chrome.tabs.reload(tab.id)
      }
    })
    ElMessage.success(`已切换到账号：${props.user.nickname}`)
  } catch (e) {
    ElMessage.error('切换失败')
  }
  switching.value = false
}

async function enterGameAsAccount(gameLink) {
  let parsedUrl
  try {
    parsedUrl = new URL(gameLink)
    if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('4399.com')) {
      throw new Error('游戏链接无效')
    }
  } catch {
    ElMessage.error('游戏链接无效')
    return
  }

  enteringGameLink.value = gameLink
  try {
    await applyAccountCookies()
    await chrome.tabs.create({url: parsedUrl.toString()})
  } catch (error) {
    ElMessage.error(error.message || '切换账号并进入游戏失败')
  } finally {
    enteringGameLink.value = ''
  }
}

function handleCommand(cmd) {
  if (cmd === 'edit') {
    showEditForm.value = !showEditForm.value
  } else if (cmd === 'refresh') {
    emit('refresh', props.user.puser)
  } else if (cmd === 'delete') {
    emit('delete', props.user.puser)
  } else if (cmd === 'move') {
    showMovePopover.value = true
  }
}

function handleMove(folderId) {
  showMovePopover.value = false
  emit('move', props.user.puser, folderId)
}

function handleAvatarSelect(file) {
  const allowed = ['image/jpeg', 'image/png']
  if (!allowed.includes(file.raw.type)) {
    ElMessage.error('只支持 JPG/PNG 格式')
    return
  }
  editForm.value.avatar = file.raw
}

function triggerAvatarUpload() {
  editForm.value.avatar = null
  nextTick(() => {
    avatarUploadRef.value?.handleClick()
  })
}

async function handleSaveEdit() {
  const params = {}
  if (editForm.value.nick) params.nick = editForm.value.nick
  if (editForm.value.email) params.email = editForm.value.email
  if (editForm.value.sex) params.sex = editForm.value.sex
  if (editForm.value.birthday) params.birthday = editForm.value.birthday
  if (editForm.value.province) params.province = editForm.value.province
  if (editForm.value.city) params.city = editForm.value.city
  if (editForm.value.qq) params.qq = editForm.value.qq

  if (Object.keys(params).length === 0 && !editForm.value.avatar) {
    ElMessage.warning('未输入任何修改内容')
    return
  }

  saving.value = true
  const result = await modifyProfileAndAvatar(params, editForm.value.avatar, props.user.cookies)
  saving.value = false

  if (result.success) {
    ElMessage.success('修改成功！')
    showEditForm.value = false
    emit('refresh', props.user.puser)
  } else {
    ElMessage.error(`${result.message}\n${JSON.stringify(result.data || {}, null, 2)}`)
  }
}
</script>

<style scoped>
.account-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #eaeaea;
  transition: all 0.2s;
}

.account-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-checkbox {
  margin-top: 12px;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #eee;
  flex-shrink: 0;
}

.info {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.info h4 {
  font-size: 14px;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.info p {
  font-size: 12px;
  color: #666;
  margin: 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.more-btn {
  width: 100%;
  font-size: 16px;
  height: 32px;
  background-color: #f0f0f0;
}

.query-toggle {
  margin-left: 0;
}

.game-query-panel {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: linear-gradient(145deg, #f8fbff, #f3f8ff);
}

.query-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.query-heading strong {
  display: block;
  color: #303133;
  font-size: 13px;
}

.query-heading span {
  display: block;
  margin-top: 2px;
  color: #909399;
  font-size: 11px;
}

.server-selection {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
}

.server-load-hint {
  margin: 10px 0 0;
  padding: 9px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  color: #909399;
  font-size: 11px;
  text-align: center;
}

.query-timing-alert {
  margin-bottom: 10px;
}

.query-timing-alert :deep(.el-alert__title) {
  line-height: 1.45;
  font-size: 11px;
}

.server-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px 8px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #dcdfe6;
}

.server-grid :deep(.el-checkbox) {
  margin-right: 0;
}

.query-button {
  width: 100%;
  margin-top: 10px;
}

.query-results {
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 4px;
}

.query-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.query-summary span {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eef2f6;
  color: #606266;
  font-size: 11px;
}

.query-summary .summary-success { background: #e9f7ef; color: #529b2e; }
.query-summary .summary-failure { background: #fef0f0; color: #f56c6c; }

.role-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}

.server-badge {
  flex-shrink: 0;
  padding: 3px 6px;
  border-radius: 4px;
  background: #409eff;
  color: #fff;
  font-size: 11px;
}

.role-main { flex: 1; min-width: 0; }
.role-main strong, .role-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.role-main strong { color: #303133; font-size: 12px; }
.role-main small { margin-top: 2px; color: #909399; font-size: 11px; }

.result-empty, .result-note, .failure-list {
  margin: 7px 0 0;
  padding: 7px 9px;
  border-radius: 5px;
  font-size: 11px;
}

.result-empty, .result-note { background: #f4f4f5; color: #606266; }
.failure-list { background: #fef0f0; color: #f56c6c; }
.failure-list p { margin: 2px 0; }

.edit-form {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
}

.edit-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.edit-row label {
  width: 45px;
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
}

.region-selects {
  display: flex;
  gap: 4px;
  flex: 1;
}

.move-popover .move-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

.move-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.move-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.move-item:hover {
  background: #f0f0f0;
}

.avatar-preview {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  border: 2px dashed #dcdfe6;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-preview:hover .avatar-overlay {
  opacity: 1;
}
</style>
