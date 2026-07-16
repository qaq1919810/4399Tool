import {createApp} from 'vue'
import '#features/storageSchema.mjs'
import BatchEdit from './BatchEdit.vue'

const app = createApp(BatchEdit)
app.mount('#app')
