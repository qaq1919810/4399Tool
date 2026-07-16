// noinspection SpellCheckingInspection

import {z} from 'zod'
import {systemNotification} from '#utils/notify.mjs'
import {PASSWORD_PREFIX} from '#utils/passwordCrypto.mjs'

export const EMPTY_STORAGE = Object.freeze({
    info: Object.freeze({}),
    userInfoFolder: Object.freeze([]),
    aiApiKey: null
})

export const cookieSchema = z.strictObject({
    name: z.string(),
    value: z.string(),
    domain: z.string().nullable(),
    path: z.string(),
    expirationDate: z.number().nullable(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    session: z.boolean(),
    hostOnly: z.boolean()
})

export const accountSchema = z.strictObject({
    puser: z.string(),
    avatar: z.string().nullable(),
    username: z.string(),
    nickname: z.string(),
    gender: z.string(),
    birthday: z.string(),
    region: z.string(),
    qq: z.string(),
    authStatus: z.string(),
    email: z.string().nullable(),
    cookies: z.array(cookieSchema),
    parentFolderId: z.number().nullable(),
    remark: z.string().refine(value => value.trim().length > 0).nullable(),
    password: z.string().startsWith(PASSWORD_PREFIX).nullable()
})

const backupAccountSchema = accountSchema.extend({
    password: z.string().nullable()
})

export const folderSchema = z.strictObject({
    id: z.number(),
    folderName: z.string(),
    parentFolderId: z.number().nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative()
}).refine(folder => folder.updatedAt >= folder.createdAt)

export const storageSchema = z.strictObject({
    info: z.record(z.string(), accountSchema),
    userInfoFolder: z.array(folderSchema),
    aiApiKey: z.string().nullable()
})

export const backupDocumentSchema = z.strictObject({
    format: z.literal('4399-plugin-backup'),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    scope: z.strictObject({
        type: z.literal('full-before-import')
    }),
    data: z.strictObject({
        info: z.record(z.string(), backupAccountSchema),
        userInfoFolder: z.array(folderSchema),
        aiApiKey: z.string().nullable()
    })
})

export function normalizeCookie(cookie) {
    return {
        name: String(cookie?.name ?? ''),
        value: String(cookie?.value ?? ''),
        domain: typeof cookie?.domain === 'string' ? cookie.domain : null,
        path: typeof cookie?.path === 'string' ? cookie.path : '/',
        expirationDate: typeof cookie?.expirationDate === 'number' ? cookie.expirationDate : null,
        httpOnly: Boolean(cookie?.httpOnly),
        secure: Boolean(cookie?.secure),
        session: typeof cookie?.session === 'boolean' ? cookie.session : cookie?.expirationDate === undefined,
        hostOnly: typeof cookie?.hostOnly === 'boolean' ? cookie.hostOnly : false
    }
}

export function normalizeAccount(account, existing = null) {
    return {
        puser: String(account?.puser ?? ''),
        avatar: typeof account?.avatar === 'string' && account.avatar ? account.avatar : null,
        username: String(account?.username ?? account?.puser ?? ''),
        nickname: String(account?.nickname ?? '未知用户'),
        gender: String(account?.gender ?? '未填'),
        birthday: String(account?.birthday ?? '未填'),
        region: String(account?.region ?? '未填'),
        qq: String(account?.qq ?? '未填'),
        authStatus: String(account?.authStatus ?? '未认证'),
        email: typeof account?.email === 'string' && account.email ? account.email : null,
        cookies: Array.isArray(account?.cookies) ? account.cookies.map(normalizeCookie) : [],
        parentFolderId: typeof account?.parentFolderId === 'number'
            ? account.parentFolderId
            : existing?.parentFolderId ?? null,
        remark: typeof account?.remark === 'string'
            ? account.remark.trim() || null
            : existing?.remark ?? null,
        password: typeof account?.password === 'string'
            ? account.password
            : existing?.password ?? null
    }
}

export function parseStorage(data) {
    const result = storageSchema.safeParse(data)
    if (!result.success) {
        throw new TypeError('备份版本不匹配：存储字段结构与当前版本不一致')
    }
    for (const [key, account] of Object.entries(result.data.info)) {
        if (account.puser !== key) {
            throw new TypeError('备份版本不匹配：账号索引与 puser 不一致')
        }
    }
    return result.data
}

export function parseFullBackupDocument(document) {
    const result = backupDocumentSchema.safeParse(document)
    if (!result.success) {
        throw new TypeError('备份版本不匹配：文件字段结构与当前版本不一致')
    }
    for (const [key, account] of Object.entries(result.data.data.info)) {
        if (account.puser !== key) {
            throw new TypeError('备份版本不匹配：账号索引与 puser 不一致')
        }
    }
    return result.data
}

export async function initializeStorage() {
    return navigator.locks.request('4399-storage:data', async () => {
        const current = await chrome.storage.local.get(null)
        if (Object.keys(current).length !== 0) return false
        await chrome.storage.local.set({info: {}, userInfoFolder: [], aiApiKey: null})
        return true
    })
}

initializeStorage().catch(async error => {
    console.error('[4399管家] 初始化本地存储失败:', error)
    try {
        await systemNotification(
            error?.message || '无法初始化本地存储，请检查扩展权限或重新加载扩展',
            '4399 管家存储初始化失败'
        )
    } catch (notificationError) {
        console.error('[4399管家] 存储初始化失败通知发送失败:', notificationError)
    }
})
