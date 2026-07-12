export default {
    manifest_version: 3,
    name: "4399",
    version: "0.0.3",
    description: "4399",

    icons: {
        "16": "src/assets/logo.png",
        "48": "src/assets/logo.png",
        "128": "src/assets/logo.png"
    },

    background: {
        service_worker: "src/background.mjs"
    },

    action:{},

    permissions: [
        "cookies",
        "storage",
        "unlimitedStorage",
        "declarativeNetRequest",
        "declarativeNetRequestWithHostAccess",
        "notifications"
    ],

    host_permissions: [
        "*://*.4399.com/*",
        "<all_urls>"
    ]
}
