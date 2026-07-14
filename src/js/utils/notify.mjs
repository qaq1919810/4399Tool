export async function systemNotification(message, title = '提示', iconUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') {
    await chrome.notifications.create({
        type: 'basic',
        // 这是一个 1x1 像素的透明图片，这样左侧就不会显示任何可见图标了
        iconUrl,
        title,
        message
    })
}