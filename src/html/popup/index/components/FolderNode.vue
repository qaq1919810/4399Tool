<template>
  <section class="folder-node" :class="{ nested: depth > 0 }">
    <div class="folder-header" @click="expanded = !expanded">
      <button class="folder-toggle" type="button" :aria-expanded="expanded" @click.stop="expanded = !expanded">
        {{ expanded ? '▾' : '▸' }}
      </button>
      <el-checkbox
          :model-value="folderSelected"
          :indeterminate="folderPartiallySelected"
          @click.stop
          @change="emit('toggle-folder-select', folder.id)"
      />
      <span class="folder-name">{{ folder.folderName }}</span>
      <span class="folder-count">{{ descendantUsers.length }}</span>

      <div class="folder-actions" @click.stop>
        <el-button size="small" text @click="emit('rename-folder', folder)">✏️</el-button>
        <el-dropdown @command="targetId => emit('move-folder', folder, targetId)" trigger="click">
          <el-button size="small" text>📦</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="null">📄 顶层</el-dropdown-item>
              <el-dropdown-item
                  v-for="target in moveTargets"
               :key="target.id"
               :command="target.id"
              >
                <span class="folder-path-option" :title="target.path">📂 {{ target.path }}</span>
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
            <el-button size="small" text type="danger" @click="emit('open-delete', folder.id)">🗑️</el-button>
          </template>
          <div class="delete-confirm">
            <p>确定删除文件夹「{{ folder.folderName }}」？</p>
            <p class="delete-warn">内部 {{ descendantUsers.length }} 个账号也会被删除</p>
            <div class="delete-actions">
              <el-button size="small" @click="emit('close-delete')">取消</el-button>
              <CooldownButton
                  :seconds="3"
                  type="danger"
                  size="small"
                  @confirm="emit('delete-folder', folder.id)"
              />
            </div>
          </div>
        </el-popover>
      </div>
    </div>

    <div v-show="expanded" class="folder-content">
      <div v-if="directUsers.length" class="folder-users">
        <AccountCard
            v-for="user in directUsers"
            :key="user.puser"
            :user="user"
            :checked="selectedUsers.includes(user.puser)"
            :folders="flatFolders"
            :ai-api-key="aiApiKey"
            @toggle="emit('toggle-user', user.puser)"
            @refresh="puser => emit('refresh-user', puser)"
            @delete="puser => emit('delete-user', puser)"
            @move="(puser, folderId) => emit('move-user', puser, folderId)"
            @save-remark="(puser, remark) => emit('save-remark', puser, remark)"
            @record-password="(puser, options, done) => emit('record-password', puser, options, done)"
            @save-api-key="(apiKey, done) => emit('save-api-key', apiKey, done)"
            @copy-password="puser => emit('copy-password', puser)"
            @delete-password="puser => emit('delete-password', puser)"
        />
      </div>

      <div v-if="folder.children?.length" class="child-folders">
        <FolderNode
            v-for="child in folder.children"
            :key="child.id"
            :folder="child"
            :accounts="accounts"
            :selected-users="selectedUsers"
            :flat-folders="flatFolders"
            :ai-api-key="aiApiKey"
            :open-delete-popover-id="openDeletePopoverId"
            :depth="depth + 1"
            @toggle-user="puser => emit('toggle-user', puser)"
            @toggle-folder-select="folderId => emit('toggle-folder-select', folderId)"
            @refresh-user="puser => emit('refresh-user', puser)"
            @delete-user="puser => emit('delete-user', puser)"
            @move-user="(puser, folderId) => emit('move-user', puser, folderId)"
            @save-remark="(puser, remark) => emit('save-remark', puser, remark)"
            @record-password="(puser, options, done) => emit('record-password', puser, options, done)"
            @save-api-key="(apiKey, done) => emit('save-api-key', apiKey, done)"
            @copy-password="puser => emit('copy-password', puser)"
            @delete-password="puser => emit('delete-password', puser)"
            @rename-folder="target => emit('rename-folder', target)"
            @move-folder="(target, parentId) => emit('move-folder', target, parentId)"
            @open-delete="folderId => emit('open-delete', folderId)"
            @close-delete="emit('close-delete')"
            @delete-folder="folderId => emit('delete-folder', folderId)"
        />
      </div>

      <div v-if="directUsers.length === 0 && !folder.children?.length" class="empty-hint">暂无账号或子文件夹</div>
    </div>
  </section>
</template>

<script setup>
import {computed, ref} from 'vue'
import AccountCard from './AccountCard.vue'
import CooldownButton from './CooldownButton.vue'

defineOptions({name: 'FolderNode'})

const props = defineProps({
  folder: {type: Object, required: true},
  accounts: {type: Array, required: true},
  selectedUsers: {type: Array, required: true},
  flatFolders: {type: Array, required: true},
  aiApiKey: {type: String, default: ''},
  openDeletePopoverId: {default: null},
  depth: {type: Number, default: 0}
})

const emit = defineEmits([
  'toggle-user',
  'toggle-folder-select',
  'refresh-user',
  'delete-user',
  'move-user',
  'save-remark',
  'record-password',
  'save-api-key',
  'copy-password',
  'delete-password',
  'rename-folder',
  'move-folder',
  'open-delete',
  'close-delete',
  'delete-folder'
])

const expanded = ref(false)

const directUsers = computed(() => props.accounts.filter(user =>
    (user.parentFolderId ?? null) === props.folder.id
))

const descendantFolderIds = computed(() => {
  const ids = new Set([props.folder.id])
  const visit = children => {
    for (const child of children || []) {
      ids.add(child.id)
      visit(child.children)
    }
  }
  visit(props.folder.children)
  return ids
})

const descendantUsers = computed(() => props.accounts.filter(user =>
    descendantFolderIds.value.has(user.parentFolderId)
))

const selectedDescendantCount = computed(() => descendantUsers.value.filter(user =>
    props.selectedUsers.includes(user.puser)
).length)

const folderSelected = computed(() =>
    descendantUsers.value.length > 0 && selectedDescendantCount.value === descendantUsers.value.length
)

const folderPartiallySelected = computed(() =>
    selectedDescendantCount.value > 0 && selectedDescendantCount.value < descendantUsers.value.length
)

const moveTargets = computed(() => props.flatFolders.filter(target =>
    target.id !== props.folder.id && !descendantFolderIds.value.has(target.id)
))
</script>

<style scoped>
.folder-node {
  overflow: hidden;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
}

.folder-node.nested {
  margin: 8px 0 0 14px;
  border-style: dashed;
  border-color: #cfd8e3;
}

.folder-header {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 6px 10px;
  border-bottom: 1px solid transparent;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
}

.folder-header:hover { background: #f4f8fc; }

.folder-toggle {
  width: 22px;
  margin-right: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #607d9b;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.folder-name {
  flex: 1;
  min-width: 0;
  margin-left: 8px;
  overflow: hidden;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  min-width: 24px;
  margin-right: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 11px;
  text-align: center;
}

.folder-actions { display: flex; gap: 2px; }
.folder-path-option { display: block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-content { padding: 8px; border-top: 1px solid #eee; }
.folder-users { display: flex; flex-direction: column; gap: 8px; }
.child-folders { margin-top: 8px; }
.folder-users + .child-folders { margin-top: 10px; }
.empty-hint { padding: 12px; color: #999; font-size: 12px; text-align: center; }
.delete-confirm p { margin: 0 0 8px; font-size: 14px; }
.delete-warn { color: #f56c6c; font-size: 12px !important; }
.delete-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
