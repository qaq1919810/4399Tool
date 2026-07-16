import {createApp} from 'vue'
import '#features/storageSchema.mjs'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')
