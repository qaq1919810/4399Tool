const BACKUP_FORMAT = '4399-plugin-backup'
const BACKUP_VERSION = 1

import FolderManager from '#features/folderManager.mjs'

/**
 * 备份文件生成、验证与下载管理。
 */
export default class BackupManager {
    static #collectRequiredFolders(accounts, folders) {
        const folderMap = new Map(folders.map(folder => [folder.id, folder]))
        const requiredIds = new Set()

        for (const account of Object.values(accounts)) {
            let folderId = account?.parentFolderId
            const visited = new Set()
            while (folderId !== null && folderId !== undefined && !visited.has(folderId)) {
                visited.add(folderId)
                const folder = folderMap.get(folderId)
                if (!folder) break
                requiredIds.add(folder.id)
                folderId = folder.parentFolderId
            }
        }

        return folders.filter(folder => requiredIds.has(folder.id))
    }

    static #buildDocument(data, scope) {
        return {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            scope,
            data
        }
    }

    static async getStorageSummary() {
        const storage = await FolderManager.getStorageSnapshot()
        return {
            accountKeys: Object.keys(storage.info || {}),
            hasApiKey: typeof storage.aiApiKey === 'string' && storage.aiApiKey.length > 0
        }
    }

    static async createSelectedBackup({includeApiKey, includeInfo, accountKeys}) {
        const storage = await FolderManager.getStorageSnapshot()
        const data = {}

        if (includeApiKey && Object.hasOwn(storage, 'aiApiKey')) {
            data.aiApiKey = storage.aiApiKey
        }

        if (includeInfo) {
            const sourceInfo = storage.info || {}
            data.info = Object.fromEntries(
                accountKeys
                    .filter(key => Object.hasOwn(sourceInfo, key))
                    .map(key => [key, sourceInfo[key]])
            )
            data.userInfoFolder = this.#collectRequiredFolders(
                data.info,
                storage.userInfoFolder || []
            )
        }

        return this.#buildDocument(data, {
            type: 'selected',
            includeApiKey: !!includeApiKey,
            accountKeys: includeInfo ? Object.keys(data.info) : []
        })
    }

    static async createFullBackup() {
        const data = await FolderManager.getStorageSnapshot()
        return this.#buildDocument(data, {type: 'full-before-import'})
    }

    static validateBackup(document) {
        if (!document || typeof document !== 'object' || Array.isArray(document)) {
            throw new TypeError('备份文件内容无效')
        }
        if (document.format !== BACKUP_FORMAT || document.version !== BACKUP_VERSION) {
            throw new TypeError('不是受支持的 4399 插件备份文件')
        }
        if (!document.data || typeof document.data !== 'object' || Array.isArray(document.data)) {
            throw new TypeError('备份文件缺少 data')
        }
        if (document.data.info !== undefined && (
            !document.data.info ||
            typeof document.data.info !== 'object' ||
            Array.isArray(document.data.info)
        )) {
            throw new TypeError('备份文件中的 info 格式无效')
        }
        if (document.data.userInfoFolder !== undefined && !Array.isArray(document.data.userInfoFolder)) {
            throw new TypeError('备份文件中的 userInfoFolder 格式无效')
        }
        if (document.data.aiApiKey !== undefined && typeof document.data.aiApiKey !== 'string') {
            throw new TypeError('备份文件中的 API Key 格式无效')
        }

        const folders = document.data.userInfoFolder || []
        const folderIds = new Set()
        for (const folder of folders) {
            if (!folder || typeof folder !== 'object' || folder.id === undefined || typeof folder.folderName !== 'string') {
                throw new TypeError('备份文件中存在无效文件夹')
            }
            if (folderIds.has(folder.id)) throw new TypeError('备份文件中存在重复文件夹 ID')
            folderIds.add(folder.id)
        }

        return document
    }

    static async readBackupFile(file) {
        let parsed
        try {
            parsed = JSON.parse(await file.text())
        } catch {
            throw new TypeError('无法解析备份 JSON 文件')
        }
        return this.validateBackup(parsed)
    }

    static selectImportData(document, {includeApiKey, includeInfo, accountKeys}) {
        this.validateBackup(document)
        const data = {}

        if (includeApiKey && Object.hasOwn(document.data, 'aiApiKey')) {
            data.aiApiKey = document.data.aiApiKey
        }

        if (includeInfo) {
            const sourceInfo = document.data.info || {}
            data.info = Object.fromEntries(
                accountKeys
                    .filter(key => Object.hasOwn(sourceInfo, key))
                    .map(key => [key, sourceInfo[key]])
            )
            data.userInfoFolder = this.#collectRequiredFolders(
                data.info,
                document.data.userInfoFolder || []
            )
        }

        return data
    }

    static #waitForDownload(downloadId) {
        return new Promise((resolve, reject) => {
            let settled = false

            const cleanup = () => chrome.downloads.onChanged.removeListener(onChanged)
            const finish = (callback, value) => {
                if (settled) return
                settled = true
                cleanup()
                callback(value)
            }
            const handleState = item => {
                if (item.state === 'complete') {
                    finish(resolve, item)
                } else if (item.state === 'interrupted') {
                    finish(reject, new Error(item.error === 'USER_CANCELED' ? '已取消保存备份' : `备份下载失败：${item.error || '未知错误'}`))
                }
            }
            const onChanged = delta => {
                if (delta.id !== downloadId || !delta.state?.current) return
                handleState({state: delta.state.current, error: delta.error?.current})
            }

            chrome.downloads.onChanged.addListener(onChanged)
            chrome.downloads.search({id: downloadId})
                .then(items => {
                    if (items[0]) handleState(items[0])
                })
                .catch(error => finish(reject, error))
        })
    }

    static async downloadBackup(document, filenamePrefix = '4399Plugin-backup') {
        this.validateBackup(document)
        const blob = new Blob([JSON.stringify(document, null, 2)], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')

        try {
            const downloadId = await chrome.downloads.download({
                url,
                filename: `${filenamePrefix}-${timestamp}.json`,
                saveAs: true,
                conflictAction: 'uniquify'
            })
            return await this.#waitForDownload(downloadId)
        } catch (error) {
            if (error?.message?.includes('USER_CANCELED')) {
                throw new Error('已取消保存备份')
            }
            throw error
        } finally {
            URL.revokeObjectURL(url)
        }
    }
}
