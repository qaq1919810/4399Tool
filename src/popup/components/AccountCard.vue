<template>
    <div class="account-card" :class="{ selected: checked }">
        <el-checkbox :model-value="checked" @change="$emit('toggle')" class="card-checkbox" />

        <img class="avatar" :src="avatarUrl" alt="头像" />

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
            <el-dropdown @command="handleCommand" trigger="click">
                <el-button size="small" text type="info">⋮</el-button>
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

        <!-- 编辑表单 -->
        <div v-if="showEditForm" class="edit-form">
            <div class="edit-row">
                <label>昵称</label>
                <el-input v-model="editForm.nick" :placeholder="user.nickname" size="small" />
            </div>
            <div class="edit-row">
                <label>邮箱</label>
                <el-input v-model="editForm.email" :placeholder="user.email || '未填写'" size="small" />
            </div>
            <div class="edit-row">
                <label>性别</label>
                <el-select v-model="editForm.sex" placeholder="不修改" size="small" clearable>
                    <el-option value="1" label="男" />
                    <el-option value="2" label="女" />
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
                <el-input v-model="editForm.region" :placeholder="user.region || '未填写'" size="small" />
            </div>
            <div class="edit-row">
                <label>QQ</label>
                <el-input v-model="editForm.qq" :placeholder="user.qq || '未填写'" size="small" />
            </div>
            <el-button type="primary" size="small" @click="handleSaveEdit" :loading="saving" style="width: 100%">
                保存修改
            </el-button>
        </div>
    </div>
</template>

<script setup>
import {ref, onMounted} from 'vue'
import {ElMessage} from 'element-plus'
import {shadowFetch} from '#utils/shadowFetch.mjs'
import {modifyUserInfo} from '#features/modifyUserInfo.mjs'

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

const avatarUrl = ref('https://via.placeholder.com/48')

const editForm = ref({
    nick: '',
    email: '',
    sex: '',
    birthday: '',
    region: '',
    qq: ''
})

onMounted(async () => {
    if (props.user.avatar) {
        try {
            const resp = await shadowFetch(props.user.avatar, {
                headers: {'Referer': 'https://u.4399.com/'}
            })
            if (resp.ok) {
                const blob = await resp.blob()
                avatarUrl.value = URL.createObjectURL(blob)
            }
        } catch {
            avatarUrl.value = 'https://via.placeholder.com/48'
        }
    }
})

async function handleSwitch() {
    switching.value = true
    try {
        const {cookies} = props.user
        if (!cookies || cookies.length === 0) {
            ElMessage.error('无可用 Cookie')
            switching.value = false
            return
        }

        for (const ck of cookies) {
            const setDetails = {
                url: 'https://u.4399.com' + ck.path,
                name: ck.name,
                value: ck.value,
                path: ck.path,
                secure: ck.secure,
                httpOnly: ck.httpOnly,
                expirationDate: ck.session ? undefined : ck.expirationDate
            }
            if (!ck.hostOnly) setDetails.domain = ck.domain
            await chrome.cookies.set(setDetails)
        }

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

async function handleSaveEdit() {
    const params = {}
    if (editForm.value.nick) params.nick = editForm.value.nick
    if (editForm.value.email) params.email = editForm.value.email
    if (editForm.value.sex) params.sex = editForm.value.sex
    if (editForm.value.birthday) params.birthday = editForm.value.birthday
    if (editForm.value.region) params.region = editForm.value.region
    if (editForm.value.qq) params.qq = editForm.value.qq

    if (Object.keys(params).length === 0) {
        ElMessage.warning('未输入任何修改内容')
        return
    }

    saving.value = true
    const result = await modifyUserInfo(params, props.user.cookies)
    saving.value = false

    if (result.success) {
        ElMessage.success('修改成功！')
        showEditForm.value = false
        emit('refresh', props.user.puser)
    } else {
        ElMessage.error(`${result.message}\n${JSON.stringify(result.data, null, 2)}`)
    }
}
</script>

<style scoped>
.account-card {
    display: flex;
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
</style>
