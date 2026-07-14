// noinspection SpellCheckingInspection

/**
 * 文件夹管理模块
 */

const STORAGE_KEY = 'userInfoFolder'

/**
 * 生成唯一 ID
 * @returns {number}
 */
function generateId() {
    return Date.now()
}

/**
 * 获取所有文件夹
 * @returns {Promise<Array>}
 */
export async function getAllFolders() {
    const wrapper = await chrome.storage.local.get(STORAGE_KEY)
    return wrapper[STORAGE_KEY] || []
}

/**
 * 保存所有文件夹
 * @param {Array} folders
 */
async function saveAllFolders(folders) {
    await chrome.storage.local.set({[STORAGE_KEY]: folders})
}

/**
 * 创建文件夹
 * @param {string} folderName - 文件夹名称
 * @param {number|null} parentFolderId - 父文件夹 ID，null 表示顶层
 * @returns {Promise<{success: boolean, message?: string, folder?: Object}>}
 */
export async function createFolder(folderName, parentFolderId = null) {
    if (!folderName || !folderName.trim()) {
        return {success: false, message: '文件夹名称不能为空'}
    }

    const folders = await getAllFolders()

    // 检查同级下是否有同名文件夹
    const exists = folders.some(f =>
        f.folderName === folderName.trim() && f.parentFolderId === parentFolderId
    )
    if (exists) {
        return {success: false, message: '同级目录下已存在同名文件夹'}
    }

    const newFolder = {
        id: generateId(),
        folderName: folderName.trim(),
        parentFolderId
    }

    folders.push(newFolder)
    await saveAllFolders(folders)

    return {success: true, folder: newFolder}
}

/**
 * 删除文件夹（递归删除子文件夹和内部用户）
 * @param {number} folderId - 文件夹 ID
 * @returns {Promise<{success: boolean, message?: string, deletedUsers?: number}>}
 */
export async function deleteFolder(folderId) {
    const folders = await getAllFolders()

    // 找到要删除的文件夹
    const folder = folders.find(f => f.id === folderId)
    if (!folder) {
        return {success: false, message: '文件夹不存在'}
    }

    // 递归收集所有要删除的文件夹 ID
    function collectChildFolderIds(parentId) {
        const childIds = folders
            .filter(f => f.parentFolderId === parentId)
            .map(f => f.id)
        return childIds.reduce((acc, id) => {
            acc.push(id)
            acc.push(...collectChildFolderIds(id))
            return acc
        }, [])
    }

    const deleteFolderIds = [folderId, ...collectChildFolderIds(folderId)]

    // 删除文件夹
    const newFolders = folders.filter(f => !deleteFolderIds.includes(f.id))
    await saveAllFolders(newFolders)

    // 删除这些文件夹内的所有用户
    const infoWrapper = await chrome.storage.local.get('info')
    const info = infoWrapper.info || {}
    let deletedUsers = 0

    for (const puser of Object.keys(info)) {
        if (deleteFolderIds.includes(info[puser].parentFolderId)) {
            delete info[puser]
            deletedUsers++
        }
    }

    await chrome.storage.local.set({info})

    return {success: true, deletedUsers}
}

/**
 * 重命名文件夹
 * @param {number} folderId - 文件夹 ID
 * @param {string} newName - 新名称
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function renameFolder(folderId, newName) {
    if (!newName || !newName.trim()) {
        return {success: false, message: '文件夹名称不能为空'}
    }

    const folders = await getAllFolders()
    const folder = folders.find(f => f.id === folderId)
    if (!folder) {
        return {success: false, message: '文件夹不存在'}
    }

    // 检查同级下是否有同名文件夹
    const exists = folders.some(f =>
        f.id !== folderId &&
        f.folderName === newName.trim() &&
        f.parentFolderId === folder.parentFolderId
    )
    if (exists) {
        return {success: false, message: '同级目录下已存在同名文件夹'}
    }

    folder.folderName = newName.trim()
    await saveAllFolders(folders)

    return {success: true}
}

/**
 * 移动文件夹到新的父文件夹
 * @param {number} folderId - 要移动的文件夹 ID
 * @param {number|null} newParentFolderId - 新的父文件夹 ID，null 表示顶层
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function moveFolder(folderId, newParentFolderId) {
    const folders = await getAllFolders()
    const folder = folders.find(f => f.id === folderId)
    if (!folder) {
        return {success: false, message: '文件夹不存在'}
    }

    // 不能移动到自己内部
    if (folderId === newParentFolderId) {
        return {success: false, message: '不能将文件夹移动到自身内部'}
    }

    // 检查是否会导致循环引用
    function isDescendant(parentId, childId) {
        const children = folders.filter(f => f.parentFolderId === parentId)
        for (const child of children) {
            if (child.id === childId) return true
            if (isDescendant(child.id, childId)) return true
        }
        return false
    }

    if (newParentFolderId !== null && isDescendant(folderId, newParentFolderId)) {
        return {success: false, message: '不能将文件夹移动到其子文件夹内'}
    }

    // 检查同级下是否有同名文件夹
    const exists = folders.some(f =>
        f.id !== folderId &&
        f.folderName === folder.folderName &&
        f.parentFolderId === newParentFolderId
    )
    if (exists) {
        return {success: false, message: '目标位置已存在同名文件夹'}
    }

    folder.parentFolderId = newParentFolderId
    await saveAllFolders(folders)

    return {success: true}
}

/**
 * 移动用户到指定文件夹
 * @param {string} puser - 用户标识
 * @param {number|null} folderId - 目标文件夹 ID，null 表示顶层
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function moveUserToFolder(puser, folderId) {
    const infoWrapper = await chrome.storage.local.get('info')
    const info = infoWrapper.info || {}

    if (!info[puser]) {
        return {success: false, message: '用户不存在'}
    }

    // 如果目标不是顶层，检查文件夹是否存在
    if (folderId !== null) {
        const folders = await getAllFolders()
        const folder = folders.find(f => f.id === folderId)
        if (!folder) {
            return {success: false, message: '目标文件夹不存在'}
        }
    }

    info[puser].parentFolderId = folderId
    await chrome.storage.local.set({info})

    return {success: true}
}

/**
 * 获取文件夹树结构
 * @returns {Promise<Array>} 树形结构
 */
export async function getFolderTree() {
    const folders = await getAllFolders()

    function buildTree(parentId) {
        return folders
            .filter(f => f.parentFolderId === parentId)
            .map(f => ({
                ...f,
                children: buildTree(f.id)
            }))
    }

    return buildTree(null)
}
