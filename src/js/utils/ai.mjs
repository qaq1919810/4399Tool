import { GoogleGenAI } from "@google/genai"

export class Gemini {
    /**
     * 初始化 Gemini 客户端
     * @param {string} apiKey - 你的 Gemini API Key
     * @param {string} modelName - 默认使用的模型名称
     */
    constructor(apiKey, modelName) {
        this.ai = new GoogleGenAI({ apiKey })
        this.modelName = modelName
    }

    // 私有辅助方法：将单个 Blob/File 转换为 Base64
    async #toGenerativePart(blobOrFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1]

                // 修复点：如果类型为空，默认为 image/jpeg，或者根据实际情况判断
                const mimeType = blobOrFile.type || 'image/jpeg';

                resolve({
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                })
            }
            reader.onerror = reject
            reader.readAsDataURL(blobOrFile)
        })
    }

    /**
     * 发起单次无状态对话
     * @param {string} prompt - 你的文字提示词
     * @param {Array<Blob|File>} mediaArray - 包含图片或视频 Blob/File 对象的数组
     * @returns {Promise<string>} AI 的文本回答
     */
    async chat(prompt, mediaArray = []) {
        const contents = [prompt]

        // 如果传入了媒体文件，并发将其转换为 Base64 格式
        if (mediaArray && mediaArray.length > 0) {
            const mediaParts = await Promise.all(
                mediaArray.map(file => this.#toGenerativePart(file))
            )
            contents.push(...mediaParts)
        }

        // 调用最纯粹的单次 generateContent 接口
        const response = await this.ai.models.generateContent({
            model: this.modelName,
            contents: contents,
            generationConfig: {
                thinkingConfig: {
                    thinkingLevel: "minimal"
                }
            }
        })

        const resultText = response.text
        console.log('ai',resultText)
        return resultText
    }
}