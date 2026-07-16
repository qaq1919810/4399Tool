<template>
  <main class="settings-page">
    <h2>设置</h2>

    <section class="setting-card">
      <div>
        <h3>Gemini API Key</h3>
        <p>{{ hasApiKey ? '当前已保存 API Key' : '当前未保存 API Key' }}</p>
      </div>
      <el-button type="danger" plain :disabled="!hasApiKey" @click="clearApiKey">清除</el-button>
    </section>

    <section class="setting-card">
      <div>
        <h3>备份 / 导入</h3>
        <p>选择性备份账号和 API Key，或从备份恢复数据。</p>
      </div>
      <el-button type="primary" @click="openBackupWindow">打开</el-button>
    </section>
  </main>
</template>

<script setup>
import {onMounted, ref} from 'vue'
import {ElMessageBox} from 'element-plus'
import 'element-plus/theme-chalk/el-message-box.css'
import windowManager from '#utils/windowManager.mjs'
import FolderManager from '#features/folderManager.mjs'

const hasApiKey = ref(false)

async function refreshApiKeyState() {
  const aiApiKey = await FolderManager.getApiKey()
  hasApiKey.value = typeof aiApiKey === 'string' && aiApiKey.length > 0
}

async function clearApiKey() {
  try {
    await ElMessageBox.confirm('确定清除已保存的 Gemini API Key？', '清除 API Key', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  await FolderManager.clearApiKey()
  hasApiKey.value = false
  await ElMessageBox.alert('API Key 已清除', '操作成功', {
    confirmButtonText: '确定',
    type: 'success'
  })
}

async function openBackupWindow() {
  await windowManager.create('src/html/popup/backup/index.html', {width: 640, height: 760})
}

onMounted(refreshApiKeyState)
</script>

<style scoped>
* { box-sizing: border-box; }
body { margin: 0; }
.settings-page { min-height: 100vh; padding: 20px; background: #f5f7fa; font-family: sans-serif; }
h2 { margin: 0 0 18px; color: #303133; }
.setting-card { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px; margin-bottom: 14px; background: #fff; border: 1px solid #ebeef5; border-radius: 10px; }
h3 { margin: 0 0 6px; font-size: 16px; color: #303133; }
p { margin: 0; color: #909399; font-size: 13px; line-height: 1.5; }
</style>
