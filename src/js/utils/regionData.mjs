// noinspection RegExpRedundantEscape

import {shadowFetch} from '#utils/shadowFetch.mjs'

/**
 * 获取地区数据（每次调用重新获取，不缓存）
 * @returns {Promise<Object>} { provinces: string[], cities: { [province]: string[] } }
 */
export async function getRegionData() {
    try {
        const response = await shadowFetch('https://uc.img4399.com//root/js/data.js')
        if (!response.ok) throw new Error(`请求失败: ${response.status}`)

        const text = await response.text()

        // 提取 cities 对象内容
        const citiesMatch = text.match(/cities\s*:\s*\{([\s\S]*)\}\s*\}/)
        if (!citiesMatch) throw new Error('无法解析地区数据格式')

        const citiesBlock = citiesMatch[1]
        const cities = {}

        // 匹配每个省份: '省份名': ['城市1', '城市2', ...]
        const provinceRegex = /['"]([^'"]+)['"]\s*:\s*\[([^\]]*)\]/g
        let pm
        while ((pm = provinceRegex.exec(citiesBlock)) !== null) {
            const province = pm[1]
            const citiesStr = pm[2]
            // 提取城市名
            const cityList = []
            const cityRegex = /['"]([^'"]+)['"]/g
            let cm
            while ((cm = cityRegex.exec(citiesStr)) !== null) {
                cityList.push(cm[1])
            }
            cities[province] = cityList
        }

        if (Object.keys(cities).length === 0) throw new Error('地区数据解析为空')

        return {provinces: Object.keys(cities), cities}
    } catch (error) {
        console.error('[4399管家] 获取地区数据失败:', error)
        return {provinces: [], cities: {}}
    }
}
