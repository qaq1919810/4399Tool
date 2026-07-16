const PASSWORD_PREFIX = '4399-password-v1:'
const FIXED_KEY = '4399Plugin-local-password-key-v1'

function transform(bytes) {
    const key = new TextEncoder().encode(FIXED_KEY)
    return bytes.map((byte, index) => byte ^ key[index % key.length])
}

function bytesToBase64(bytes) {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

function base64ToBytes(value) {
    const binary = atob(value)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function isEncryptedPassword(value) {
    return typeof value === 'string' && value.startsWith(PASSWORD_PREFIX)
}

export function encryptPassword(password) {
    if (password === null || password === undefined || password === '') return null
    if (isEncryptedPassword(password)) return password
    const encrypted = transform(new TextEncoder().encode(String(password)))
    return PASSWORD_PREFIX + bytesToBase64(encrypted)
}

export function decryptPassword(encryptedPassword) {
    if (encryptedPassword === null || encryptedPassword === undefined || encryptedPassword === '') return null
    if (!isEncryptedPassword(encryptedPassword)) {
        throw new TypeError('密码数据格式与当前版本不一致')
    }
    try {
        const payload = encryptedPassword.slice(PASSWORD_PREFIX.length)
        return new TextDecoder('utf-8', {fatal: true}).decode(transform(base64ToBytes(payload)))
    } catch {
        throw new TypeError('密码数据损坏，无法解密')
    }
}

export {PASSWORD_PREFIX}
