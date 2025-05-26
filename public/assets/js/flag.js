/**
 * 国旗显示模块 - 完整修复版本
 * 版本: 2.0.0
 * 作者: VPS Monitor Team
 * 
 * 主要功能:
 * 1. 动态国旗系统 (DynamicFlagSystem)
 * 2. 国旗管理器 (FlagManager) 
 * 3. 智能国旗创建和错误处理
 * 4. 多重备用方案和缓存机制
 */

console.log('🏁 开始加载国旗模块...');

// =============================================================================
// 基础国旗创建函数
// =============================================================================

/**
 * 创建国旗图片HTML - 使用图片而不是emoji
 */
function createFlagImage(countryCode, countryName, options = {}) {
    const opts = {
        size: '20',
        className: 'country-flag',
        ...options
    };
    
    if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
        return `<span class="${opts.className} flag-default" title="未知国家">🌐</span>`;
    }
    
    const lowerCode = countryCode.toLowerCase();
    const title = (countryName || countryCode.toUpperCase()).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    
    // 使用多个国旗CDN作为备用
    const flagUrl = `https://flagcdn.com/w${opts.size}/${lowerCode}.png`;
    const fallbackUrl = `https://flagpedia.net/data/flags/w${opts.size}/${lowerCode}.png`;
    
    // 生成唯一ID避免冲突
    const uniqueId = `flag_${lowerCode}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    return `<img 
        id="${uniqueId}" 
        src="${flagUrl}" 
        alt="${title}" 
        title="${title}"
        class="${opts.className}"
        style="width: ${opts.size}px; height: ${Math.round(opts.size * 0.75)}px; margin-right: 6px; border-radius: 2px; vertical-align: middle; object-fit: cover;"
        onerror="handleFlagError('${uniqueId}', '${fallbackUrl}', '${title}', '${countryCode.toUpperCase()}')"
        loading="lazy"
    />`;
}

/**
 * 获取国旗HTML - 兼容函数
 */
function getCountryFlagHtml(countryCode, countryName, options = {}) {
    console.log(`🏁 生成国旗: ${countryCode} - ${countryName}`);
    return createFlagImage(countryCode, countryName, {
        size: options.size || '20',
        className: options.className || 'country-flag'
    });
}

/**
 * 全局国旗错误处理函数
 */
window.handleFlagError = function(flagId, fallbackUrl, title, countryCode) {
    const flagElement = document.getElementById(flagId);
    if (!flagElement) return;
    
    // 检查是否已经尝试过fallback
    if (flagElement.dataset.fallbackTried) {
        // 替换为默认图标
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'country-flag flag-default';
        defaultSpan.title = title;
        defaultSpan.textContent = '🌐';
        defaultSpan.style.cssText = 'margin-right: 6px; vertical-align: middle;';
        
        flagElement.parentNode.replaceChild(defaultSpan, flagElement);
        console.log(`❌ 国旗加载完全失败，使用默认图标: ${countryCode}`);
    } else {
        // 尝试fallback URL
        flagElement.dataset.fallbackTried = 'true';
        flagElement.src = fallbackUrl;
        console.log(`🔄 国旗加载失败，尝试备用CDN: ${countryCode}`);
    }
};

// =============================================================================
// 动态国旗系统类 - 核心功能
// =============================================================================

/**
 * 动态国旗系统 - 为管理后台设计的智能国旗处理系统
 */
class DynamicFlagSystem {
    constructor() {
        this.cache = new Map();
        this.countryMap = this.initCountryMap();
        this.cacheTimeout = 30 * 60 * 1000; // 30分钟缓存
        
        console.log('🎯 DynamicFlagSystem 初始化完成');
        console.log(`📊 支持 ${Object.keys(this.countryMap).length} 个国家/地区`);
    }

    /**
     * 初始化国家映射表
     */
    initCountryMap() {
        return {
            // === 主要国家和地区 ===
            'China': 'CN', '中国': 'CN', 'CHN': 'CN',
            'United States': 'US', '美国': 'US', 'USA': 'US', 'America': 'US', 'US': 'US',
            'United Kingdom': 'GB', '英国': 'GB', 'UK': 'GB', 'Britain': 'GB', 'Great Britain': 'GB',
            'Japan': 'JP', '日本': 'JP', 'JPN': 'JP',
            'South Korea': 'KR', 'Korea': 'KR', '韩国': 'KR', 'Republic of Korea': 'KR',
            'Singapore': 'SG', '新加坡': 'SG', 'SGP': 'SG',
            'Hong Kong': 'HK', '香港': 'HK', 'HKG': 'HK',
            'Taiwan': 'TW', '台湾': 'TW', 'Chinese Taipei': 'TW',
            
            // === 欧洲国家 ===
            'Germany': 'DE', '德国': 'DE', 'Deutschland': 'DE',
            'France': 'FR', '法国': 'FR', 'République française': 'FR',
            'Italy': 'IT', '意大利': 'IT', 'Italia': 'IT',
            'Spain': 'ES', '西班牙': 'ES', 'España': 'ES',
            'Portugal': 'PT', '葡萄牙': 'PT',
            'Netherlands': 'NL', '荷兰': 'NL', 'Holland': 'NL',
            'Belgium': 'BE', '比利时': 'BE', 'België': 'BE',
            'Switzerland': 'CH', '瑞士': 'CH', 'Schweiz': 'CH',
            'Austria': 'AT', '奥地利': 'AT', 'Österreich': 'AT',
            'Sweden': 'SE', '瑞典': 'SE', 'Sverige': 'SE',
            'Norway': 'NO', '挪威': 'NO', 'Norge': 'NO',
            'Denmark': 'DK', '丹麦': 'DK', 'Danmark': 'DK',
            'Finland': 'FI', '芬兰': 'FI', 'Suomi': 'FI',
            'Iceland': 'IS', '冰岛': 'IS', 'Ísland': 'IS',
            'Ireland': 'IE', '爱尔兰': 'IE', 'Éire': 'IE',
            'Luxembourg': 'LU', '卢森堡': 'LU',
            'Monaco': 'MC', '摩纳哥': 'MC',
            'Malta': 'MT', '马耳他': 'MT',
            'Cyprus': 'CY', '塞浦路斯': 'CY',
            
            // === 东欧国家 ===
            'Russia': 'RU', '俄罗斯': 'RU', 'Russian Federation': 'RU',
            'Poland': 'PL', '波兰': 'PL', 'Polska': 'PL',
            'Czech Republic': 'CZ', '捷克': 'CZ', 'Czechia': 'CZ',
            'Slovakia': 'SK', '斯洛伐克': 'SK',
            'Hungary': 'HU', '匈牙利': 'HU', 'Magyarország': 'HU',
            'Romania': 'RO', '罗马尼亚': 'RO', 'România': 'RO',
            'Bulgaria': 'BG', '保加利亚': 'BG', 'България': 'BG',
            'Croatia': 'HR', '克罗地亚': 'HR', 'Hrvatska': 'HR',
            'Slovenia': 'SI', '斯洛文尼亚': 'SI', 'Slovenija': 'SI',
            'Serbia': 'RS', '塞尔维亚': 'RS', 'Србија': 'RS',
            'Montenegro': 'ME', '黑山': 'ME', 'Crna Gora': 'ME',
            'Bosnia and Herzegovina': 'BA', '波黑': 'BA', 'Bosna i Hercegovina': 'BA',
            'North Macedonia': 'MK', '北马其顿': 'MK', 'Macedonia': 'MK',
            'Albania': 'AL', '阿尔巴尼亚': 'AL', 'Shqipëria': 'AL',
            'Estonia': 'EE', '爱沙尼亚': 'EE', 'Eesti': 'EE',
            'Latvia': 'LV', '拉脱维亚': 'LV', 'Latvija': 'LV',
            'Lithuania': 'LT', '立陶宛': 'LT', 'Lietuva': 'LT',
            'Ukraine': 'UA', '乌克兰': 'UA', 'Україна': 'UA',
            'Belarus': 'BY', '白俄罗斯': 'BY', 'Беларусь': 'BY',
            'Moldova': 'MD', '摩尔多瓦': 'MD',
            'Georgia': 'GE', '格鲁吉亚': 'GE', 'საქართველო': 'GE',
            'Armenia': 'AM', '亚美尼亚': 'AM', 'Հայաստան': 'AM',
            'Azerbaijan': 'AZ', '阿塞拜疆': 'AZ', 'Azərbaycan': 'AZ',
            
            // === 美洲国家 ===
            'Canada': 'CA', '加拿大': 'CA',
            'Mexico': 'MX', '墨西哥': 'MX', 'México': 'MX',
            'Brazil': 'BR', '巴西': 'BR', 'Brasil': 'BR',
            'Argentina': 'AR', '阿根廷': 'AR',
            'Chile': 'CL', '智利': 'CL',
            'Colombia': 'CO', '哥伦比亚': 'CO',
            'Peru': 'PE', '秘鲁': 'PE', 'Perú': 'PE',
            'Venezuela': 'VE', '委内瑞拉': 'VE',
            'Ecuador': 'EC', '厄瓜多尔': 'EC',
            'Uruguay': 'UY', '乌拉圭': 'UY',
            'Paraguay': 'PY', '巴拉圭': 'PY',
            'Bolivia': 'BO', '玻利维亚': 'BO',
            
            // === 大洋洲 ===
            'Australia': 'AU', '澳大利亚': 'AU', 'AU': 'AU',
            'New Zealand': 'NZ', '新西兰': 'NZ', 'Aotearoa': 'NZ',
            'Fiji': 'FJ', '斐济': 'FJ',
            
            // === 亚洲国家 ===
            'India': 'IN', '印度': 'IN', 'भारत': 'IN',
            'Thailand': 'TH', '泰国': 'TH', 'ประเทศไทย': 'TH',
            'Vietnam': 'VN', '越南': 'VN', 'Viet Nam': 'VN', 'Việt Nam': 'VN',
            'Malaysia': 'MY', '马来西亚': 'MY',
            'Indonesia': 'ID', '印度尼西亚': 'ID', 'Indonesia': 'ID',
            'Philippines': 'PH', '菲律宾': 'PH', 'Pilipinas': 'PH',
            'Myanmar': 'MM', '缅甸': 'MM', 'Burma': 'MM',
            'Cambodia': 'KH', '柬埔寨': 'KH', 'កម្ពុជា': 'KH',
            'Laos': 'LA', '老挝': 'LA', 'ລາວ': 'LA',
            'Brunei': 'BN', '文莱': 'BN',
            'Bangladesh': 'BD', '孟加拉国': 'BD', 'বাংলাদেশ': 'BD',
            'Pakistan': 'PK', '巴基斯坦': 'PK', 'پاکستان': 'PK',
            'Sri Lanka': 'LK', '斯里兰卡': 'LK', 'ශ්‍රී ලංකා': 'LK',
            'Nepal': 'NP', '尼泊尔': 'NP', 'नेपाल': 'NP',
            'Bhutan': 'BT', '不丹': 'BT', 'འབྲུག': 'BT',
            'Maldives': 'MV', '马尔代夫': 'MV', 'ދިވެހިރާއްޖެ': 'MV',
            'Afghanistan': 'AF', '阿富汗': 'AF', 'افغانستان': 'AF',
            'Mongolia': 'MN', '蒙古': 'MN', 'Монгол': 'MN',
            
            // === 中亚国家 ===
            'Kazakhstan': 'KZ', '哈萨克斯坦': 'KZ', 'Қазақстан': 'KZ',
            'Uzbekistan': 'UZ', '乌兹别克斯坦': 'UZ', 'Oʻzbekiston': 'UZ',
            'Turkmenistan': 'TM', '土库曼斯坦': 'TM', 'Türkmenistan': 'TM',
            'Kyrgyzstan': 'KG', '吉尔吉斯斯坦': 'KG', 'Кыргызстан': 'KG',
            'Tajikistan': 'TJ', '塔吉克斯坦': 'TJ', 'Тоҷикистон': 'TJ',
            
            // === 中东国家 ===
            'Turkey': 'TR', '土耳其': 'TR', 'Türkiye': 'TR',
            'Iran': 'IR', '伊朗': 'IR', 'ایران': 'IR',
            'Iraq': 'IQ', '伊拉克': 'IQ', 'العراق': 'IQ',
            'Israel': 'IL', '以色列': 'IL', 'ישראל': 'IL',
            'Palestine': 'PS', '巴勒斯坦': 'PS', 'فلسطين': 'PS',
            'Jordan': 'JO', '约旦': 'JO', 'الأردن': 'JO',
            'Lebanon': 'LB', '黎巴嫩': 'LB', 'لبنان': 'LB',
            'Syria': 'SY', '叙利亚': 'SY', 'سوريا': 'SY',
            'Saudi Arabia': 'SA', '沙特阿拉伯': 'SA', 'السعودية': 'SA',
            'UAE': 'AE', '阿联酋': 'AE', 'United Arab Emirates': 'AE', 'الإمارات': 'AE',
            'Qatar': 'QA', '卡塔尔': 'QA', 'قطر': 'QA',
            'Kuwait': 'KW', '科威特': 'KW', 'الكويت': 'KW',
            'Bahrain': 'BH', '巴林': 'BH', 'البحرين': 'BH',
            'Oman': 'OM', '阿曼': 'OM', 'عُمان': 'OM',
            'Yemen': 'YE', '也门': 'YE', 'اليمن': 'YE',
            
            // === 非洲国家 ===
            'Egypt': 'EG', '埃及': 'EG', 'مصر': 'EG',
            'South Africa': 'ZA', '南非': 'ZA',
            'Nigeria': 'NG', '尼日利亚': 'NG',
            'Kenya': 'KE', '肯尼亚': 'KE',
            'Ethiopia': 'ET', '埃塞俄比亚': 'ET',
            'Ghana': 'GH', '加纳': 'GH',
            'Morocco': 'MA', '摩洛哥': 'MA', 'المغرب': 'MA',
            'Algeria': 'DZ', '阿尔及利亚': 'DZ', 'الجزائر': 'DZ',
            'Tunisia': 'TN', '突尼斯': 'TN', 'تونس': 'TN',
            'Libya': 'LY', '利比亚': 'LY', 'ليبيا': 'LY'
        };
    }

    /**
     * 异步获取国家代码
     */
    async getCountryCode(countryName) {
        if (!countryName) {
            console.warn('🏁 getCountryCode: 输入为空');
            return null;
        }

        const cacheKey = `code_${countryName}`;
        
        // 检查缓存
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`🎯 从缓存获取: ${countryName} -> ${cached.value}`);
                return cached.value;
            } else {
                this.cache.delete(cacheKey);
            }
        }

        console.log(`🔍 解析国家名称: "${countryName}"`);

        let result = null;

        // 1. 直接精确匹配
        if (this.countryMap[countryName]) {
            result = this.countryMap[countryName];
            console.log(`✅ 精确匹配: ${countryName} -> ${result}`);
        }
        // 2. 忽略大小写匹配
        else {
            const lowerName = countryName.toLowerCase();
            for (const [name, code] of Object.entries(this.countryMap)) {
                if (name.toLowerCase() === lowerName) {
                    result = code;
                    console.log(`✅ 大小写匹配: ${countryName} -> ${result}`);
                    break;
                }
            }
        }
        // 3. 部分匹配
        if (!result) {
            const lowerName = countryName.toLowerCase();
            for (const [name, code] of Object.entries(this.countryMap)) {
                const lowerMapName = name.toLowerCase();
                if (lowerName.includes(lowerMapName) || lowerMapName.includes(lowerName)) {
                    result = code;
                    console.log(`✅ 部分匹配: ${countryName} -> ${result} (通过 ${name})`);
                    break;
                }
            }
        }

        // 缓存结果
        this.cache.set(cacheKey, {
            value: result,
            timestamp: Date.now()
        });

        if (!result) {
            console.warn(`❌ 未找到国家代码: ${countryName}`);
        }

        return result;
    }

    /**
     * 从位置字符串中提取国家信息
     */
    async extractCountryFromLocation(locationString) {
        if (!locationString) {
            console.warn('🏁 extractCountryFromLocation: 位置字符串为空');
            return null;
        }

        const cacheKey = `location_${locationString}`;
        
        // 检查缓存
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`🎯 从缓存获取位置: ${locationString} -> ${JSON.stringify(cached.value)}`);
                return cached.value;
            } else {
                this.cache.delete(cacheKey);
            }
        }

        console.log(`🗺️ 解析位置字符串: "${locationString}"`);

        let result = null;

        // 解析位置字符串，如 "City, Country"
        if (locationString.includes(',')) {
            const parts = locationString.split(',').map(part => part.trim());
            console.log(`🔍 位置部分:`, parts);
            
            // 从后往前查找，因为国家通常在最后
            for (let i = parts.length - 1; i >= 0; i--) {
                const part = parts[i];
                const countryCode = await this.getCountryCode(part);
                
                if (countryCode) {
                    result = {
                        country_code: countryCode,
                        country_name: part,
                        location_string: locationString,
                        city: parts.length > 1 ? parts[0] : null
                    };
                    console.log(`✅ 位置解析成功: ${locationString} -> ${JSON.stringify(result)}`);
                    break;
                }
            }
        } else {
            // 单个词，直接查找
            const countryCode = await this.getCountryCode(locationString);
            if (countryCode) {
                result = {
                    country_code: countryCode,
                    country_name: locationString,
                    location_string: locationString,
                    city: null
                };
                console.log(`✅ 单词解析成功: ${locationString} -> ${JSON.stringify(result)}`);
            }
        }

        // 缓存结果
        this.cache.set(cacheKey, {
            value: result,
            timestamp: Date.now()
        });

        if (!result) {
            console.warn(`❌ 位置解析失败: ${locationString}`);
        }

        return result;
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            countries: Object.keys(this.countryMap).length
        };
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ 动态国旗系统缓存已清除');
    }

    /**
     * 批量预加载常用国家
     */
    async preloadCommonCountries() {
        const commonCountries = [
            'United States', 'China', 'Singapore', 'Japan', 'United Kingdom',
            'Germany', 'France', 'Canada', 'Australia', 'South Korea',
            'India', 'Brazil', 'Russia', 'Netherlands', 'Switzerland'
        ];

        console.log('🚀 预加载常用国家...');
        
        for (const country of commonCountries) {
            await this.getCountryCode(country);
        }
        
        console.log('✅ 常用国家预加载完成');
    }
}

// =============================================================================
// 国旗管理器类 - 完整功能
// =============================================================================

/**
 * 国旗管理器 - 处理国旗图片加载、缓存和错误处理
 */
class FlagManager {
    constructor(options = {}) {
        this.config = {
            cdnUrl: 'https://flagcdn.com',
            defaultSize: 'w20',
            fallbackCdns: [
                'https://flagcdn.com',
                'https://flagpedia.net/data/flags'
            ],
            enableCache: true,
            enablePreload: true,
            timeout: 10000,
            debug: false,
            ...options
        };

        this.cache = new Map();
        this.failedCodes = new Set();
        this.loadingCodes = new Set();

        console.log('🎨 FlagManager 初始化完成');
        this.init();
    }

    init() {
        if (this.config.enablePreload) {
            this.preloadCommonFlags();
        }
        this.setupGlobalHandlers();
    }

    log(...args) {
        if (this.config.debug) {
            console.log('[FlagManager]', ...args);
        }
    }

    setupGlobalHandlers() {
        window.flagManagerHandleFlagLoad = this.handleFlagLoad.bind(this);
        window.flagManagerHandleFlagError = this.handleFlagError.bind(this);
    }

    getFlagHtml(countryCode, countryName = '', options = {}) {
        const opts = {
            size: this.config.defaultSize,
            className: 'country-flag',
            enableHover: false,
            enableClick: false,
            showTooltip: true,
            ...options
        };

        if (!this.isValidCountryCode(countryCode)) {
            return this.getDefaultFlagHtml(opts);
        }

        const lowerCode = countryCode.toLowerCase();
        const flagUrl = this.getFlagUrl(lowerCode, opts.size);
        const flagId = this.generateFlagId(lowerCode);

        if (this.failedCodes.has(lowerCode)) {
            return this.getDefaultFlagHtml(opts);
        }

        const classNames = [opts.className];
        if (opts.enableHover) classNames.push('flag-hover');
        if (opts.enableClick) classNames.push('flag-clickable');

        const attributes = [
            `id="${flagId}"`,
            `class="${classNames.join(' ')}"`,
            `src="${flagUrl}"`,
            `alt="${countryName || countryCode}"`,
            `data-country-code="${countryCode.toUpperCase()}"`,
            `data-country-name="${countryName}"`,
            `loading="lazy"`,
            `onerror="flagManagerHandleFlagError('${lowerCode}', '${flagId}')"`,
            `onload="flagManagerHandleFlagLoad('${lowerCode}', '${flagId}')"`
        ];

        if (opts.showTooltip && countryName) {
            attributes.push(`title="${countryName}"`);
        }

        return `<img ${attributes.join(' ')} />`;
    }

    getFlagUrl(countryCode, size = 'w20') {
        return `${this.config.cdnUrl}/${size}/${countryCode}.png`;
    }

    generateFlagId(countryCode) {
        return `flag-mgr-${countryCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    isValidCountryCode(countryCode) {
        return countryCode && 
               typeof countryCode === 'string' && 
               countryCode.length === 2 &&
               /^[A-Za-z]{2}$/.test(countryCode);
    }

    getDefaultFlagHtml(options = {}) {
        const classNames = [options.className || 'country-flag', 'flag-default'];
        return `<span class="${classNames.join(' ')}" title="未知国家">🌐</span>`;
    }

    handleFlagLoad(countryCode, flagId) {
        this.log(`国旗加载成功: ${countryCode.toUpperCase()}`);
        this.cache.set(countryCode, true);
        this.loadingCodes.delete(countryCode);
    }

    handleFlagError(countryCode, flagId) {
        this.log(`国旗加载失败: ${countryCode.toUpperCase()}`);
        this.loadingCodes.delete(countryCode);
        
        const flagElement = document.getElementById(flagId);
        if (!flagElement) return;

        // 尝试备用CDN
        if (this.config.fallbackCdns.length > 1) {
            const currentSrc = flagElement.src;
            const currentCdn = this.config.fallbackCdns.find(cdn => currentSrc.includes(cdn));
            const currentIndex = this.config.fallbackCdns.indexOf(currentCdn);
            
            if (currentIndex < this.config.fallbackCdns.length - 1) {
                const nextCdn = this.config.fallbackCdns[currentIndex + 1];
                const newUrl = currentSrc.replace(currentCdn, nextCdn);
                this.log(`尝试备用CDN: ${newUrl}`);
                flagElement.src = newUrl;
                return;
            }
        }

        // 所有CDN都失败，标记为失败并显示默认图标
        this.failedCodes.add(countryCode);
        flagElement.style.display = 'none';
        
        const defaultFlag = document.createElement('span');
        defaultFlag.className = 'country-flag flag-default';
        defaultFlag.title = '国旗加载失败';
        defaultFlag.textContent = '🌐';
        flagElement.parentNode.insertBefore(defaultFlag, flagElement);
    }

    async preloadCommonFlags() {
        const commonCodes = [
            'sg', 'us', 'cn', 'jp', 'kr', 'hk', 'tw', 
            'de', 'gb', 'fr', 'ca', 'au', 'in', 'ru',
            'br', 'nl', 'se', 'no', 'dk', 'fi', 'ch'
        ];

        this.log('开始预加载常用国旗:', commonCodes);

        const preloadPromises = commonCodes.map(code => this.preloadFlag(code));
        
        try {
            await Promise.all(preloadPromises);
            this.log('常用国旗预加载完成');
        } catch (error) {
            this.log('国旗预加载出错:', error);
        }
    }

    preloadFlag(countryCode) {
        return new Promise((resolve) => {
            const img = new Image();
            const flagUrl = this.getFlagUrl(countryCode);
            
            img.onload = () => {
                this.cache.set(countryCode, true);
                this.log(`预加载成功: ${countryCode}`);
                resolve(true);
            };
            
            img.onerror = () => {
                this.failedCodes.add(countryCode);
                this.log(`预加载失败: ${countryCode}`);
                resolve(false);
            };
            
            img.src = flagUrl;
        });
    }

    clearCache() {
        this.log('清除国旗缓存');
        this.cache.clear();
        this.failedCodes.clear();
    }

    getCacheStats() {
        return {
            cached: this.cache.size,
            failed: this.failedCodes.size,
            loading: this.loadingCodes.size
        };
    }
}

// =============================================================================
// 国旗工具函数集合
// =============================================================================

const FlagUtils = {
    /**
     * 创建国旗选择器组件
     */
    createFlagSelector(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const config = {
            countries: ['US', 'CN', 'SG', 'JP', 'KR', 'GB', 'DE', 'FR'],
            onSelect: null,
            showNames: true,
            size: 'md',
            ...options
        };

        const flagManager = new FlagManager();

        container.className = 'flag-selector';
        container.innerHTML = config.countries.map(code => {
            const flagHtml = flagManager.getFlagHtml(code, code, {
                size: `w${config.size === 'sm' ? '16' : config.size === 'lg' ? '32' : '20'}`,
                enableClick: true
            });

            return `
                <div class="flag-option" data-country-code="${code}">
                    ${flagHtml}
                    ${config.showNames ? `<span class="country-name">${code}</span>` : ''}
                </div>
            `;
        }).join('');

        // 添加点击事件
        container.addEventListener('click', (e) => {
            const option = e.target.closest('.flag-option');
            if (option && config.onSelect) {
                const countryCode = option.dataset.countryCode;
                config.onSelect(countryCode, countryCode);
            }
        });

        return {
            setSelected: (countryCode) => {
                container.querySelectorAll('.flag-option').forEach(el => {
                    el.classList.toggle('selected', el.dataset.countryCode === countryCode);
                });
            }
        };
    },

    /**
     * 批量替换页面中的国旗emoji为图片
     */
    replaceEmojiFlags(containerSelector = 'body') {
        const container = document.querySelector(containerSelector);
        if (!container) return 0;

        const flagManager = new FlagManager();
        let replaceCount = 0;

        // 国旗emoji到国家代码的映射
        const emojiToCountry = {
            '🇺🇸': 'US', '🇨🇳': 'CN', '🇸🇬': 'SG', '🇯🇵': 'JP', '🇰🇷': 'KR',
            '🇬🇧': 'GB', '🇩🇪': 'DE', '🇫🇷': 'FR', '🇨🇦': 'CA', '🇦🇺': 'AU',
            '🇮🇳': 'IN', '🇷🇺': 'RU', '🇧🇷': 'BR', '🇳🇱': 'NL', '🇸🇪': 'SE',
            '🇳🇴': 'NO', '🇩🇰': 'DK', '🇫🇮': 'FI', '🇨🇭': 'CH', '🇦🇹': 'AT',
            '🇧🇪': 'BE', '🇮🇹': 'IT', '🇪🇸': 'ES', '🇵🇹': 'PT', '🇹🇭': 'TH',
            '🇻🇳': 'VN', '🇲🇾': 'MY', '🇮🇩': 'ID', '🇵🇭': 'PH', '🇭🇰': 'HK',
            '🇹🇼': 'TW'
        };

        // 遍历所有文本节点
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            let text = textNode.textContent;
            let hasReplacement = false;

            for (const [emoji, countryCode] of Object.entries(emojiToCountry)) {
                if (text.includes(emoji)) {
                    text = text.replace(new RegExp(emoji, 'g'), `||FLAG_${countryCode}||`);
                    hasReplacement = true;
                }
            }

            if (hasReplacement) {
                const wrapper = document.createElement('span');
                wrapper.innerHTML = text.replace(/\|\|FLAG_(\w+)\|\|/g, (match, code) => {
                    replaceCount++;
                    return flagManager.getFlagHtml(code, '', {
                        className: 'country-flag flag-inline'
                    });
                });

                textNode.parentNode.replaceChild(wrapper, textNode);
            }
        });

        console.log(`[FlagUtils] 替换了 ${replaceCount} 个emoji国旗`);
        return replaceCount;
    },

    /**
     * 验证国旗URL是否可访问
     */
    async validateFlagUrl(countryCode, cdnUrl = 'https://flagcdn.com') {
        try {
            const response = await fetch(`${cdnUrl}/w20/${countryCode.toLowerCase()}.png`, {
                method: 'HEAD',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
};

// =============================================================================
// 全局导出和初始化
// =============================================================================

(function(global) {
    'use strict';

    // 导出所有类和工具到全局对象
    global.DynamicFlagSystem = DynamicFlagSystem;
    global.FlagManager = FlagManager;
    global.FlagUtils = FlagUtils;

    // 创建默认实例（向后兼容）
    global.flagManager = new FlagManager();

    // 提供便捷的全局函数
    global.createCountryFlag = function(countryCode, countryName, size = 20) {
        return createFlagImage(countryCode, countryName, { size: size.toString() });
    };

    global.getCountryFlag = function(countryCode, countryName, options = {}) {
        return getCountryFlagHtml(countryCode, countryName, options);
    };

    console.log('🎉 国旗模块加载完成！');
    console.log('📊 可用组件:');
    console.log('  - DynamicFlagSystem: 智能国旗系统');
    console.log('  - FlagManager: 国旗管理器');
    console.log('  - FlagUtils: 国旗工具集');
    console.log('  - createFlagImage: 创建国旗图片');
    console.log('  - getCountryFlagHtml: 获取国旗HTML');

    // 自动运行系统检查
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🔧 国旗系统自检...');
            
            // 测试 DynamicFlagSystem
            try {
                const testSystem = new DynamicFlagSystem();
                testSystem.getCountryCode('United States').then(code => {
                    console.log(`✅ DynamicFlagSystem 测试通过: US = ${code}`);
                }).catch(error => {
                    console.error('❌ DynamicFlagSystem 测试失败:', error);
                });
            } catch (error) {
                console.error('❌ DynamicFlagSystem 创建失败:', error);
            }

            // 测试基础函数
            try {
                const testFlag = createFlagImage('US', 'United States', { size: '20' });
                if (testFlag && testFlag.includes('img')) {
                    console.log('✅ createFlagImage 测试通过');
                } else {
                    console.warn('⚠️ createFlagImage 返回异常结果');
                }
            } catch (error) {
                console.error('❌ createFlagImage 测试失败:', error);
            }

            console.log('🎯 国旗系统自检完成');
        });
    }

})(window || global || this);

// =============================================================================
// 降级emoji方案（作为最后备选）
// =============================================================================

/**
 * 国旗emoji生成 - 降级方案
 */
function countryCodeToFlag(countryCode) {
    if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
        return '🌐';
    }
    
    // 检查是否支持emoji国旗
    try {
        const testFlag = '🇺🇸';
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = '16px Arial';
        const metrics = ctx.measureText(testFlag);
        
        // 如果emoji国旗不被支持，返回文本
        if (metrics.width < 20) {
            return `[${countryCode.toUpperCase()}]`;
        }
        
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        
        return String.fromCodePoint(...codePoints);
    } catch (error) {
        return `[${countryCode.toUpperCase()}]`;
    }
}

// 导出emoji函数到全局
window.countryCodeToFlag = countryCodeToFlag;

console.log('🏁 国旗模块完全加载完成！所有功能已就绪。');