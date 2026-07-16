// noinspection SpellCheckingInspection

/**
 * 文件夹和账号存储管理器。
 *
 * 所有对 userInfoFolder / info 的“读取 → 修改 → 写回”都通过同一把 Web Lock
 * 串行执行，避免多个扩展窗口同时保存时用旧快照覆盖彼此的修改。
 */
export default class FolderManager {
    static #FOLDER_KEY = 'userInfoFolder'
    static #INFO_KEY = 'info'
    static #LOCK_NAME = '4399-storage:data'

    /**
     * 在跨窗口锁内读取并更新指定存储项。
     * updater 必须同步完成，避免网络请求长期占用数据锁。
     * @param {Array<string>} keys
     * @param {(data: {folders: Array, info: Object}) => any} updater
     * @returns {Promise<any>}
     */
    static async #updateStorage(keys, updater) {
        return navigator.locks.request(this.#LOCK_NAME, async () => {
            const wrapper = await chrome.storage.local.get(keys)
            const data = {
                folders: wrapper[this.#FOLDER_KEY] || [],
                info: wrapper[this.#INFO_KEY] || {}
            }
            const result = updater(data)

            if (result instanceof Promise) {
                throw new TypeError('存储更新函数不能执行异步操作')
            }

            const changes = {}
            if (keys.includes(this.#FOLDER_KEY)) changes[this.#FOLDER_KEY] = data.folders
            if (keys.includes(this.#INFO_KEY)) changes[this.#INFO_KEY] = data.info
            await chrome.storage.local.set(changes)
            return result
        })
    }

    /**
     * 生成唯一 ID。
     * @returns {number}
     */
    static #generateId() {
        return Date.now()
    }

    static #collectRequiredFolderIds(info, folders) {
        const folderMap = new Map(folders.map(folder => [folder.id, folder]))
        const requiredIds = new Set()
        for (const account of Object.values(info)) {
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
        return requiredIds
    }

    static #mergeImportedFolders(currentFolders, importedFolders, importedInfo) {
        const requiredIds = this.#collectRequiredFolderIds(importedInfo, importedFolders)
        const importedMap = new Map(importedFolders.map(folder => [folder.id, folder]))
        const idMap = new Map()
        const resolving = new Set()
        const occupiedIds = new Set(currentFolders.map(folder => folder.id))
        let nextId = Date.now()

        const generateId = () => {
            while (occupiedIds.has(nextId)) nextId++
            occupiedIds.add(nextId)
            return nextId++
        }
        const resolveFolder = importedId => {
            if (idMap.has(importedId)) return idMap.get(importedId)
            const imported = importedMap.get(importedId)
            if (!imported || !requiredIds.has(importedId)) return null
            if (resolving.has(importedId)) throw new Error('导入文件夹存在循环引用')

            resolving.add(importedId)
            const parentId = imported.parentFolderId === null || imported.parentFolderId === undefined
                ? null
                : resolveFolder(imported.parentFolderId)
            const existing = currentFolders.find(folder =>
                folder.folderName === imported.folderName && folder.parentFolderId === parentId
            )
            const targetId = existing?.id ?? generateId()
            if (!existing) {
                currentFolders.push({...imported, id: targetId, parentFolderId: parentId})
            }
            idMap.set(importedId, targetId)
            resolving.delete(importedId)
            return targetId
        }

        for (const folderId of requiredIds) resolveFolder(folderId)
        return idMap
    }

    /**
     * 获取所有文件夹。
     * @returns {Promise<Array>}
     */
    static async getAllFolders() {
        const wrapper = await chrome.storage.local.get(this.#FOLDER_KEY)
        return wrapper[this.#FOLDER_KEY] || []
    }

    /**
     * 获取所有账号。
     * @returns {Promise<Object>}
     */
    static async getAccounts() {
        const wrapper = await chrome.storage.local.get(this.#INFO_KEY)
        return wrapper[this.#INFO_KEY] || {}
    }

    /**
     * 获取 API Key。
     * @returns {Promise<string>}
     */
    static async getApiKey() {
        const {aiApiKey = ''} = await chrome.storage.local.get('aiApiKey')
        return aiApiKey
    }

    /**
     * 保存 API Key，和全量导入共用一把锁。
     */
    static async saveApiKey(apiKey) {
        return navigator.locks.request(this.#LOCK_NAME, () =>
            chrome.storage.local.set({aiApiKey: apiKey})
        )
    }

    /**
     * 清除 API Key，和全量导入共用一把锁。
     */
    static async clearApiKey() {
        return navigator.locks.request(this.#LOCK_NAME, () =>
            chrome.storage.local.remove('aiApiKey')
        )
    }

    /**
     * 获取当前 Local Storage 的一致性快照。
     */
    static async getStorageSnapshot() {
        return navigator.locks.request(this.#LOCK_NAME, () =>
            chrome.storage.local.get(null)
        )
    }

    /**
     * 将扁平文件夹数组构建成树，不修改传入对象。
     * @param {Array<{id: number, parentFolderId: number|null}>} folders
     * @returns {Array}
     */
    static buildFolderTree(folders) {
        const folderMap = new Map(folders.map(folder => [folder.id, {...folder, children: []}]))
        const roots = []

        for (const folder of folderMap.values()) {
            const parent = folder.parentFolderId === null ? null : folderMap.get(folder.parentFolderId)
            if (parent) {
                parent.children.push(folder)
            } else {
                roots.push(folder)
            }
        }

        return roots
    }

    /**
     * 获取文件夹树。
     * @returns {Promise<Array>}
     */
    static async getFolderTree() {
        return this.buildFolderTree(await this.getAllFolders())
    }

    /**
     * 保存或覆盖一个账号，默认保留其原文件夹位置。
     * @param {Object} account
     * @param {boolean} preserveFolder
     */
    static async saveAccount(account, preserveFolder = true) {
        return this.saveAccounts([account], preserveFolder)
    }

    /**
     * 批量保存账号，并在一次锁定写入中合并最新数据。
     * @param {Array<Object>} accounts
     * @param {boolean} preserveFolder
     */
    static async saveAccounts(accounts, preserveFolder = true) {
        return this.#updateStorage([this.#INFO_KEY], ({info}) => {
            for (const account of accounts) {
                if (!account?.puser) continue
                const existingFolderId = info[account.puser]?.parentFolderId
                info[account.puser] = {...account}
                if (preserveFolder && existingFolderId !== undefined) {
                    info[account.puser].parentFolderId = existingFolderId
                }
            }
        })
    }

    /**
     * 合并更新一个仍然存在的账号。
     * @param {string} puser
     * @param {Object} patch
     * @returns {Promise<boolean>} 账号在写入时是否仍存在
     */
    static async patchAccount(puser, patch) {
        return this.#updateStorage([this.#INFO_KEY], ({info}) => {
            if (!info[puser]) return false
            info[puser] = {...info[puser], ...patch}
            return true
        })
    }

    /**
     * 批量合并更新仍然存在的账号。
     * @param {Object<string, Object>} patches
     * @returns {Promise<number>} 实际更新数量
     */
    static async patchAccounts(patches) {
        return this.#updateStorage([this.#INFO_KEY], ({info}) => {
            let updated = 0
            for (const [puser, patch] of Object.entries(patches)) {
                if (!info[puser]) continue
                info[puser] = {...info[puser], ...patch}
                updated++
            }
            return updated
        })
    }

    /**
     * 删除一个账号。
     * @param {string} puser
     * @returns {Promise<Object|null>} 被删除的账号
     */
    static async deleteAccount(puser) {
        return this.#updateStorage([this.#INFO_KEY], ({info}) => {
            const account = info[puser] || null
            delete info[puser]
            return account
        })
    }

    /**
     * 批量删除账号。
     * @param {Array<string>} pusers
     * @returns {Promise<number>} 实际删除数量
     */
    static async deleteAccounts(pusers) {
        return this.#updateStorage([this.#INFO_KEY], ({info}) => {
            let deleted = 0
            for (const puser of pusers) {
                if (!info[puser]) continue
                delete info[puser]
                deleted++
            }
            return deleted
        })
    }

    /**
     * 创建文件夹。
     */
    static async createFolder(folderName, parentFolderId = null) {
        if (!folderName || !folderName.trim()) {
            return {success: false, message: '文件夹名称不能为空'}
        }

        return this.#updateStorage([this.#FOLDER_KEY], ({folders}) => {
            const normalizedName = folderName.trim()
            const exists = folders.some(folder =>
                folder.folderName === normalizedName && folder.parentFolderId === parentFolderId
            )
            if (exists) return {success: false, message: '同级目录下已存在同名文件夹'}

            const folder = {id: this.#generateId(), folderName: normalizedName, parentFolderId}
            folders.push(folder)
            return {success: true, folder}
        })
    }

    /**
     * 删除文件夹、所有后代文件夹及其中账号。
     */
    static async deleteFolder(folderId) {
        return this.#updateStorage([this.#FOLDER_KEY, this.#INFO_KEY], data => {
            const folder = data.folders.find(item => item.id === folderId)
            if (!folder) return {success: false, message: '文件夹不存在'}

            const collectChildFolderIds = parentId => {
                const childIds = data.folders
                    .filter(item => item.parentFolderId === parentId)
                    .map(item => item.id)
                return childIds.flatMap(id => [id, ...collectChildFolderIds(id)])
            }
            const deletedFolderIds = [folderId, ...collectChildFolderIds(folderId)]
            data.folders = data.folders.filter(item => !deletedFolderIds.includes(item.id))

            let deletedUsers = 0
            for (const puser of Object.keys(data.info)) {
                if (!deletedFolderIds.includes(data.info[puser].parentFolderId)) continue
                delete data.info[puser]
                deletedUsers++
            }
            return {success: true, deletedUsers}
        })
    }

    /**
     * 重命名文件夹。
     */
    static async renameFolder(folderId, newName) {
        if (!newName || !newName.trim()) {
            return {success: false, message: '文件夹名称不能为空'}
        }

        return this.#updateStorage([this.#FOLDER_KEY], ({folders}) => {
            const folder = folders.find(item => item.id === folderId)
            if (!folder) return {success: false, message: '文件夹不存在'}

            const normalizedName = newName.trim()
            const exists = folders.some(item =>
                item.id !== folderId &&
                item.folderName === normalizedName &&
                item.parentFolderId === folder.parentFolderId
            )
            if (exists) return {success: false, message: '同级目录下已存在同名文件夹'}

            folder.folderName = normalizedName
            return {success: true}
        })
    }

    /**
     * 移动文件夹。
     */
    static async moveFolder(folderId, newParentFolderId) {
        return this.#updateStorage([this.#FOLDER_KEY], ({folders}) => {
            const folder = folders.find(item => item.id === folderId)
            if (!folder) return {success: false, message: '文件夹不存在'}
            if (folderId === newParentFolderId) {
                return {success: false, message: '不能将文件夹移动到自身内部'}
            }

            const isDescendant = (parentId, childId) => folders
                .filter(item => item.parentFolderId === parentId)
                .some(child => child.id === childId || isDescendant(child.id, childId))

            if (newParentFolderId !== null && isDescendant(folderId, newParentFolderId)) {
                return {success: false, message: '不能将文件夹移动到其子文件夹内'}
            }

            const exists = folders.some(item =>
                item.id !== folderId &&
                item.folderName === folder.folderName &&
                item.parentFolderId === newParentFolderId
            )
            if (exists) return {success: false, message: '目标位置已存在同名文件夹'}

            folder.parentFolderId = newParentFolderId
            return {success: true}
        })
    }

    /**
     * 移动账号到指定文件夹。
     */
    static async moveUserToFolder(puser, folderId) {
        return this.#updateStorage([this.#FOLDER_KEY, this.#INFO_KEY], ({folders, info}) => {
            if (!info[puser]) return {success: false, message: '用户不存在'}
            if (folderId !== null && !folders.some(folder => folder.id === folderId)) {
                return {success: false, message: '目标文件夹不存在'}
            }

            info[puser].parentFolderId = folderId
            return {success: true}
        })
    }

    /**
     * 导入筛选后的备份数据。
     * mode: replace | append-overwrite | append-preserve
     */
    static async importStorage(importedData, mode) {
        if (!['replace', 'append-overwrite', 'append-preserve'].includes(mode)) {
            throw new TypeError('未知导入模式')
        }

        return navigator.locks.request(this.#LOCK_NAME, async () => {
            const importedInfo = structuredClone(importedData.info || {})
            const importedFolders = structuredClone(importedData.userInfoFolder || [])

            if (mode === 'replace') {
                await chrome.storage.local.clear()
                await chrome.storage.local.set(structuredClone(importedData))
                return {
                    added: Object.keys(importedInfo).length,
                    overwritten: 0,
                    preserved: 0
                }
            }

            const current = await chrome.storage.local.get(null)
            const currentInfo = current.info || {}
            const currentFolders = current.userInfoFolder || []
            const effectiveInfo = {}
            let added = 0
            let overwritten = 0
            let preserved = 0

            for (const [puser, account] of Object.entries(importedInfo)) {
                if (Object.hasOwn(currentInfo, puser)) {
                    if (mode === 'append-preserve') {
                        preserved++
                        continue
                    }
                    overwritten++
                } else {
                    added++
                }
                effectiveInfo[puser] = account
            }

            const folderIdMap = this.#mergeImportedFolders(currentFolders, importedFolders, effectiveInfo)
            for (const [puser, account] of Object.entries(effectiveInfo)) {
                const importedFolderId = account.parentFolderId
                currentInfo[puser] = {
                    ...account,
                    puser,
                    parentFolderId: importedFolderId === null || importedFolderId === undefined
                        ? null
                        : folderIdMap.get(importedFolderId) ?? null
                }
            }

            const changes = {
                info: currentInfo,
                userInfoFolder: currentFolders
            }
            if (Object.hasOwn(importedData, 'aiApiKey')) {
                if (mode === 'append-overwrite' || !Object.hasOwn(current, 'aiApiKey')) {
                    changes.aiApiKey = importedData.aiApiKey
                }
            }
            await chrome.storage.local.set(changes)
            return {added, overwritten, preserved}
        })
    }
}
