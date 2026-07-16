<template>
  <main class="backup-page">
    <h2>数据备份与导入</h2>

    <el-alert
        :title="backupCompletedThisSession ? '本次已成功保存备份，可以执行导入' : '导入前必须在本窗口成功保存一次备份'"
        :type="backupCompletedThisSession ? 'success' : 'warning'"
        :closable="false"
        show-icon
    />

    <el-tabs v-model="activeTab" class="tabs">
      <el-tab-pane label="备份" name="backup">
        <el-collapse v-model="backupSections">
          <el-collapse-item title="API Key" name="apiKey">
            <el-checkbox v-model="backupOptions.includeApiKey" :disabled="!storageSummary.hasApiKey">
              备份 Gemini API Key
            </el-checkbox>
            <p v-if="!storageSummary.hasApiKey" class="hint">当前没有已保存的 API Key</p>
          </el-collapse-item>

          <el-collapse-item title="账号信息" name="info">
            <el-checkbox v-model="backupOptions.includeInfo">备份账号信息</el-checkbox>
            <template v-if="backupOptions.includeInfo">
              <div class="selection-toolbar">
                <el-button size="small" @click="toggleAllBackupAccounts">
                  {{ allBackupAccountsSelected ? '取消全选' : '全选' }}
                </el-button>
                <span>已选择 {{ backupOptions.accountKeys.length }} / {{ storageSummary.accountKeys.length }}</span>
              </div>
              <el-checkbox-group v-model="backupOptions.accountKeys" class="account-list">
                <el-checkbox v-for="key in storageSummary.accountKeys" :key="key" :value="key">{{ key }}</el-checkbox>
              </el-checkbox-group>
            </template>
          </el-collapse-item>
        </el-collapse>

        <div class="action-row">
          <el-button type="primary" :loading="backingUp" @click="exportSelected">导出所选数据</el-button>
          <el-button type="success" :loading="backingUp" @click="exportFullBackup">完整备份并允许导入</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="导入" name="import">
        <div class="file-row">
          <input
              ref="fileInput"
              class="file-input"
              type="file"
              accept="application/json,.json"
              @change="handleFileSelected"
          />
          <el-button type="primary" @click="requestImportFile">选择备份文件</el-button>
          <span class="file-hint">
            {{ backupCompletedThisSession ? '请选择要导入的 JSON 备份文件' : '请先在本窗口成功保存一次备份' }}
          </span>
        </div>

        <template v-if="importDocument">
          <el-collapse v-model="importSections">
            <el-collapse-item v-if="importHasApiKey" title="API Key" name="apiKey">
              <el-checkbox v-model="importOptions.includeApiKey">导入 Gemini API Key</el-checkbox>
            </el-collapse-item>

            <el-collapse-item v-if="importAccountKeys.length" title="账号信息" name="info">
              <el-checkbox v-model="importOptions.includeInfo">导入账号信息</el-checkbox>
              <template v-if="importOptions.includeInfo">
                <div class="selection-toolbar">
                  <el-button size="small" @click="toggleAllImportAccounts">
                    {{ allImportAccountsSelected ? '取消全选' : '全选' }}
                  </el-button>
                  <span>已选择 {{ importOptions.accountKeys.length }} / {{ importAccountKeys.length }}</span>
                </div>
                <el-checkbox-group v-model="importOptions.accountKeys" class="account-list">
                  <el-checkbox v-for="key in importAccountKeys" :key="key" :value="key">{{ key }}</el-checkbox>
                </el-checkbox-group>
              </template>
            </el-collapse-item>
          </el-collapse>

          <div class="mode-card">
            <div class="mode-title">导入模式</div>
            <el-radio-group v-model="importMode" class="mode-list">
              <el-radio value="replace">全覆盖：清空本地数据后写入所选内容</el-radio>
              <el-radio value="append-overwrite">追加：冲突时使用备份数据覆盖</el-radio>
              <el-radio value="append-preserve">追加：冲突时保留当前数据</el-radio>
            </el-radio-group>
          </div>

          <el-button type="danger" class="import-button" :loading="importing" @click="performImport">
            执行导入
          </el-button>
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
        v-model="dialog.visible"
        :title="dialog.title"
        width="420px"
        append-to-body
        :modal="true"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="handleDialogBeforeClose"
    >
      <div class="dialog-content" :class="`dialog-${dialog.type}`">{{ dialog.message }}</div>
      <template #footer>
        <el-button v-if="dialog.showCancel" @click="closeDialog(false)">{{ dialog.cancelText }}</el-button>
        <el-button :type="dialog.type === 'error' ? 'danger' : 'primary'" @click="closeDialog(true)">
          {{ dialog.confirmText }}
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import {computed, onMounted, reactive, ref, toRaw} from 'vue'
import BackupManager from '#features/backupManager.mjs'
import FolderManager from '#features/folderManager.mjs'
import {systemNotification} from '#utils/notify.mjs'

const activeTab = ref('backup')
const backupSections = ref(['apiKey', 'info'])
const importSections = ref(['apiKey', 'info'])
const storageSummary = reactive({accountKeys: [], hasApiKey: false})
const backupCompletedThisSession = ref(false)
const backingUp = ref(false)
const importing = ref(false)
const fileInput = ref(/** @type {HTMLInputElement | null} */ (null))
const importDocument = ref(null)
const importMode = ref('append-preserve')

const backupOptions = reactive({includeApiKey: true, includeInfo: true, accountKeys: []})
const importOptions = reactive({includeApiKey: true, includeInfo: true, accountKeys: []})
const dialog = reactive({
  visible: false,
  title: '',
  message: '',
  type: 'info',
  showCancel: false,
  confirmText: '确定',
  cancelText: '取消'
})
let resolveDialog = null

function openDialog(message, title, type, options = {}) {
  if (resolveDialog) resolveDialog(false)
  Object.assign(dialog, {
    visible: true,
    title,
    message,
    type,
    showCancel: options.showCancel ?? false,
    confirmText: options.confirmText ?? '确定',
    cancelText: options.cancelText ?? '取消'
  })
  return new Promise(resolve => {
    resolveDialog = resolve
  })
}

function showDialog(message, title = '提示', type = 'info') {
  return openDialog(message, title, type)
}

function closeDialog(result) {
  const resolve = resolveDialog
  resolveDialog = null
  dialog.visible = false
  resolve?.(result)
}

function handleDialogBeforeClose(done) {
  const resolve = resolveDialog
  resolveDialog = null
  resolve?.(false)
  done()
}

const importAccountKeys = computed(() => Object.keys(importDocument.value?.data?.info || {}))
const importHasApiKey = computed(() => Object.hasOwn(importDocument.value?.data || {}, 'aiApiKey'))
const allBackupAccountsSelected = computed(() =>
    storageSummary.accountKeys.length > 0 && backupOptions.accountKeys.length === storageSummary.accountKeys.length
)
const allImportAccountsSelected = computed(() =>
    importAccountKeys.value.length > 0 && importOptions.accountKeys.length === importAccountKeys.value.length
)

async function loadSummary() {
  const summary = await BackupManager.getStorageSummary()
  storageSummary.accountKeys = summary.accountKeys
  storageSummary.hasApiKey = summary.hasApiKey
  backupOptions.includeApiKey = summary.hasApiKey
  backupOptions.accountKeys = [...summary.accountKeys]
}

function toggleAllBackupAccounts() {
  backupOptions.accountKeys = allBackupAccountsSelected.value ? [] : [...storageSummary.accountKeys]
}

function toggleAllImportAccounts() {
  importOptions.accountKeys = allImportAccountsSelected.value ? [] : [...importAccountKeys.value]
}

function validateSelection(options) {
  if (!options.includeApiKey && !options.includeInfo) throw new Error('请至少选择一种数据')
  if (options.includeInfo && options.accountKeys.length === 0) throw new Error('请至少选择一个账号')
}

async function download(document, prefix, unlockImport = false) {
  backingUp.value = true
  try {
    await BackupManager.downloadBackup(document, prefix)
    if (unlockImport) backupCompletedThisSession.value = true
    await systemNotification(
        unlockImport ? '完整备份已保存，现在可以选择文件导入' : '所选数据已成功保存到设备',
        '备份成功'
    )
  } catch (error) {
    await systemNotification(error.message || '备份失败', '备份未完成')
  } finally {
    backingUp.value = false
  }
}

async function exportSelected() {
  try {
    validateSelection(backupOptions)
    const document = await BackupManager.createSelectedBackup(backupOptions)
    await download(document, '4399Plugin-selected-backup')
  } catch (error) {
    await showDialog(error.message, '无法备份', 'warning')
  }
}

async function exportFullBackup() {
  const document = await BackupManager.createFullBackup()
  await download(document, '4399Plugin-before-import', true)
}

async function requestImportFile() {
  if (!backupCompletedThisSession.value) {
    await showDialog('本次进入页面后尚未成功保存备份，不允许选择导入文件，请先完成备份', '需要先备份', 'warning')
    activeTab.value = 'backup'
    return
  }

  fileInput.value?.click()
}

async function handleFileSelected(event) {
  if (!backupCompletedThisSession.value) {
    event.target.value = ''
    await showDialog('尚未成功保存本次备份，不能读取导入文件', '需要先备份', 'warning')
    activeTab.value = 'backup'
    return
  }

  const file = event.target.files?.[0]
  if (!file) return
  try {
    importDocument.value = await BackupManager.readBackupFile(file)
    importOptions.includeApiKey = importHasApiKey.value
    importOptions.includeInfo = importAccountKeys.value.length > 0
    importOptions.accountKeys = [...importAccountKeys.value]
    await showDialog('备份文件读取成功，请选择要导入的数据和导入模式', '读取成功', 'success')
  } catch (error) {
    importDocument.value = null
    await showDialog(error.message, '无法读取备份', 'error')
  } finally {
    event.target.value = ''
  }
}

async function performImport() {
  if (!backupCompletedThisSession.value) {
    await showDialog('本次进入页面后尚未成功保存备份，请先完成备份', '需要先备份', 'warning')
    activeTab.value = 'backup'
    return
  }

  try {
    validateSelection(importOptions)
    if (importMode.value === 'replace') {
      const confirmed = await openDialog(
          `全覆盖会清空当前 Local Storage，仅写入已选择的 ${importOptions.accountKeys.length} 个账号和所选设置。是否继续？`,
          '确认全覆盖',
          'error',
          {showCancel: true, confirmText: '继续覆盖', cancelText: '取消'}
      )
      if (!confirmed) return
    }
  } catch (error) {
    await showDialog(error.message, '无法导入', 'warning')
    return
  }

  importing.value = true
  try {
    const selectedData = BackupManager.selectImportData(toRaw(importDocument.value), {
      includeApiKey: importOptions.includeApiKey,
      includeInfo: importOptions.includeInfo,
      accountKeys: [...importOptions.accountKeys]
    })
    const result = await FolderManager.importStorage(selectedData, importMode.value)
    await systemNotification(
        `导入完成：新增 ${result.added}，覆盖 ${result.overwritten}，保留 ${result.preserved}`,
        '导入成功'
    )
    await loadSummary()
  } catch (error) {
    await showDialog(error.message || '导入失败', '导入失败', 'error')
  } finally {
    importing.value = false
  }
}

onMounted(loadSummary)
</script>

<style scoped>
* { box-sizing: border-box; }
.backup-page { min-height: 100vh; padding: 18px; background: #f5f7fa; font-family: sans-serif; color: #303133; }
h2 { margin: 0 0 14px; }
.tabs { margin-top: 14px; padding: 14px; background: #fff; border-radius: 10px; }
.hint { margin: 8px 0 0; color: #909399; font-size: 12px; }
.selection-toolbar { display: flex; align-items: center; gap: 12px; margin: 12px 0; color: #606266; font-size: 13px; }
.account-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 260px; overflow-y: auto; padding: 10px; border: 1px solid #ebeef5; border-radius: 8px; }
.action-row { display: flex; gap: 10px; margin-top: 16px; }
.file-row { display: flex; align-items: center; gap: 12px; padding: 14px; margin-bottom: 14px; background: #f8f9fb; border: 1px dashed #c0c4cc; border-radius: 8px; }
.file-input { display: none; }
.file-hint { color: #606266; font-size: 13px; }
.mode-card { margin-top: 16px; padding: 14px; background: #f8f9fb; border-radius: 8px; }
.mode-title { margin-bottom: 10px; font-weight: 600; }
.mode-list { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.import-button { width: 100%; margin-top: 16px; }
.dialog-content { line-height: 1.7; color: #606266; white-space: pre-wrap; }
.dialog-warning { color: #b88230; }
.dialog-error { color: #f56c6c; }
.dialog-success { color: #529b2e; }
</style>
