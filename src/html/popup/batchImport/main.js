import {createApp} from 'vue'
import '#features/storageSchema.mjs'
import BatchImport from './BatchImport.vue'

const app = createApp(BatchImport)
app.mount('#app')
