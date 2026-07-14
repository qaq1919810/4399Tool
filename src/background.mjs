chrome.action.onClicked.addListener(async () => {
    await chrome.windows.create({
        url: chrome.runtime.getURL('src/html/popup/index/index.html'),
        type: 'popup',
        width: 500,
        height: 700
    })
})