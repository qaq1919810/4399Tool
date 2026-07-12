<template>
    <div class="batch-edit">
        <h3>批量修改 ({{ accounts.length }} 个账号)</h3>

        <div class="account-list">
            <div v-for="acc in accounts" :key="acc.puser" class="account-tag">
                {{ acc.nickname || acc.username }} ({{ acc.puser }})
            </div>
        </div>

        <el-divider />

        <el-form label-width="60px">
            <el-form-item label="昵称">
                <el-input v-model="form.nick" placeholder="不修改则留空" />
            </el-form-item>
            <el-form-item label="邮箱">
                <el-input v-model="form.email" placeholder="不修改则留空" />
            </el-form-item>
            <el-form-item label="性别">
                <el-select v-model="form.sex" placeholder="不修改" clearable style="width: 100%">
                    <el-option value="1" label="男" />
                    <el-option value="2" label="女" />
                </el-select>
            </el-form-item>
            <el-form-item label="生日">
                <el-date-picker
                    v-model="form.birthday"
                    type="date"
                    placeholder="选择日期"
                    value-format="YYYY-MM-DD"
                    style="width: 100%"
                />
            </el-form-item>
            <el-form-item label="地区">
                <el-input v-model="form.region" placeholder="不修改则留空" />
            </el-form-item>
            <el-form-item label="QQ">
                <el-input v-model="form.qq" placeholder="不修改则留空" />
            </el-form-item>
        </el-form>

        <el-button type="primary" @click="handleSubmit" :loading="submitting" :disabled="!hasChanges" style="width: 100%">
            确认修改
        </el-button>

        <div v-if="results.length > 0" class="results">
            <el-divider />
            <div v-for="r in results" :key="r.puser" class="result-item" :class="r.success ? 'success' : 'fail'">
                {{ r.nickname }}: {{ r.success ? '✓ 成功' : '✗ ' + r.message }}
            </div>
        </div>
    </div>
</template>

<script setup>
import {ref, reactive, computed, onMounted} from 'vue'
import {ElMessage} from 'element-plus'
import {modifyUserInfo} from '#features/modifyUserInfo.mjs'

const accounts = ref([])
const submitting = ref(false)
const results = ref([])

const form = reactive({
    nick: '',
    email: '',
    sex: '',
    birthday: '',
    region: '',
    qq: ''
})

const hasChanges = computed(() => {
    return form.nick || form.email || form.sex || form.birthday || form.region || form.qq
})

onMounted(() => {
    const checkData = () => {
        if (window.__BATCH_DATA__?.length > 0) {
            console.log('[4399管家] 批量修改接收到的数据:', window.__BATCH_DATA__)
            accounts.value = window.__BATCH_DATA__
        } else {
            setTimeout(checkData, 50)
        }
    }
    checkData()
})

async function handleSubmit() {
    if (!hasChanges.value) {
        ElMessage.warning('请至少填写一项修改内容')
        return
    }

    const params = {}
    if (form.nick) params.nick = form.nick
    if (form.email) params.email = form.email
    if (form.sex) params.sex = form.sex
    if (form.birthday) params.birthday = form.birthday
    if (form.region) params.region = form.region
    if (form.qq) params.qq = form.qq

    submitting.value = true
    results.value = []

    for (const acc of accounts.value) {
        try {
            const result = await modifyUserInfo(params, acc.cookies)
            results.value.push({
                puser: acc.puser,
                nickname: acc.nickname || acc.username,
                success: result.success,
                message: result.message || ''
            })
        } catch (e) {
            results.value.push({
                puser: acc.puser,
                nickname: acc.nickname || acc.username,
                success: false,
                message: e.message
            })
        }
    }

    submitting.value = false
    const successCount = results.value.filter(r => r.success).length
    ElMessage.success(`修改完成：${successCount}/${accounts.value.length} 成功`)
}
</script>

<style scoped>
.batch-edit {
    padding: 20px;
    max-width: 500px;
    margin: 0 auto;
}

h3 {
    margin: 0 0 12px;
    color: #333;
}

.account-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.account-tag {
    background: #f0f0f0;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 13px;
    color: #555;
}

.results {
    margin-top: 12px;
}

.result-item {
    padding: 6px 0;
    font-size: 13px;
    border-bottom: 1px solid #f0f0f0;
}

.result-item.success {
    color: #67c23a;
}

.result-item.fail {
    color: #f56c6c;
}
</style>
