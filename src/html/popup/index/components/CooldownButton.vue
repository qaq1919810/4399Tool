<template>
  <el-button
      :type="type"
      :size="size"
      :disabled="cooldown > 0"
      @click="handleClick"
  >
    {{ cooldown > 0 ? `${cooldown}s 后可确认` : '确认删除' }}
  </el-button>
</template>

<script setup>
import {onUnmounted, ref} from 'vue'

const props = defineProps({
  seconds: {
    type: Number,
    default: 3
  },
  type: {
    type: String,
    default: 'danger'
  },
  size: {
    type: String,
    default: 'default'
  }
})

const emit = defineEmits(['confirm'])

const cooldown = ref(props.seconds)
let timer = null

function startCooldown() {
  cooldown.value = props.seconds
  timer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

function handleClick() {
  if (cooldown.value > 0) return
  emit('confirm')
  startCooldown()
}

// 组件挂载时就开始倒计时
startCooldown()

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
