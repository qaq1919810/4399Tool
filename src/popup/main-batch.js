import {createApp} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import BatchEdit from './BatchEdit.vue'

const app = createApp(BatchEdit)
app.use(ElementPlus)
app.mount('#app')
