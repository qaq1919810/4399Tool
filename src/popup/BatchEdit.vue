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
                <div style="display: flex; gap: 8px; width: 100%">
                    <el-select v-model="form.province" placeholder="省份" @change="form.city = ''" style="width: 50%">
                        <el-option v-for="p in provinces" :key="p" :value="p" :label="p" />
                    </el-select>
                    <el-select v-model="form.city" placeholder="城市" :disabled="!form.province" style="width: 50%">
                        <el-option v-for="c in cityOptions" :key="c" :value="c" :label="c" />
                    </el-select>
                </div>
            </el-form-item>
            <el-form-item label="头像">
                <div style="width: 100%">
                    <div v-if="form.avatar" class="avatar-preview" @click="triggerAvatarUpload">
                        <img :src="avatarPreviewUrl"  alt="头像"/>
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
                        :on-change="handleAvatarChange"
                    >
                        <div style="padding: 20px">
                            <div>点击或拖拽图片到此处</div>
                            <div style="color: #999; font-size: 12px; margin-top: 5px">支持 JPG/PNG 格式</div>
                        </div>
                    </el-upload>
                </div>
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
import {ref, reactive, computed, onMounted, nextTick} from 'vue'
import {modifyUserInfo, modifyAvatar} from '#features/modifyUserInfo.mjs'
import {getRegionData} from '#utils/regionData.mjs'

const accounts = ref([])
const submitting = ref(false)
const results = ref([])
const avatarUploadRef = ref(null)

const form = reactive({
    sex: '',
    birthday: '',
    province: '',
    city: '',
    avatar: null
})

const provinces = ref([])
const cityMap = ref({})

const cityOptions = computed(() => {
    return form.province ? (cityMap.value[form.province] || []) : []
})

const avatarPreviewUrl = computed(() => {
    if (!form.avatar) return ''
    return URL.createObjectURL(form.avatar)
})

const hasChanges = computed(() => {
    return form.sex || form.birthday || form.province || form.city || form.avatar
})

onMounted(async () => {
    // 加载地区数据
    const regionData = await getRegionData()
    provinces.value = regionData.provinces
    cityMap.value = regionData.cities

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
    if (form.sex) params.sex = form.sex
    if (form.birthday) params.birthday = form.birthday
    if (form.province) params.province = form.province
    if (form.city) params.city = form.city

    submitting.value = true
    results.value = []

    for (const acc of accounts.value) {
        try {
            let result
            if (form.avatar) {
                result = await modifyAvatar(form.avatar, acc.cookies)
            } else {
                result = await modifyUserInfo(params, acc.cookies)
            }
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

function handleAvatarChange(file) {
    const allowed = ['image/jpeg', 'image/png']
    if (!allowed.includes(file.raw.type)) {
        ElMessage.error('只支持 JPG/PNG 格式')
        return
    }
    form.avatar = file.raw
}

function triggerAvatarUpload() {
    form.avatar = null
    nextTick(() => {
        avatarUploadRef.value?.handleClick()
    })
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

.avatar-preview {
    position: relative;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    border: 2px dashed #dcdfe6;
    margin: 0 auto;
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
