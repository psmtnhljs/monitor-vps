/**
 * 国旗显示模块 - JavaScript 功能
 * 版本: 1.0.0
 * 作者: VPS Monitor Team
 * 
 * 使用方法:
 * 1. 引入CSS: <link rel="stylesheet" href="assets/css/flag.css">
 * 2. 引入JS: <script src="assets/js/flag.js"></script>
 * 3. 初始化: const flagManager = new FlagManager(options);
 * 4. 使用: flagManager.getFlagHtml('SG', 'Singapore');
 */

(function(global) {
    'use strict';

    /**
     * 国旗管理器类
     */
    class FlagManager {
        constructor(options = {}) {
            // 默认配置
            this.config = {
                cdnUrl: 'https://flagcdn.com',
                defaultSize: 'w20',
                fallbackCdns: [
                    'https://flagcdn.com',
                    'https://flagpedia.net/data/flags'
                ],
                enableCache: true,
                enablePreload: true,
                enableAutoDetect: true,
                autoDetectApiUrl: 'https://ipapi.co',
                timeout: 10000,
                retryAttempts: 2,
                debug: false,
                ...options
            };

            // 内部状态
            this.cache = new Map();
            this.failedCodes = new Set();
            this.loadingCodes = new Set();
            this.preloadPromise = null;

            // 绑定方法
            this.handleFlagLoad = this.handleFlagLoad.bind(this);
            this.handleFlagError = this.handleFlagError.bind(this);

            // 初始化
            this.init();
        }

        /**
         * 初始化国旗管理器
         */
        init() {
            this.log('初始化国旗管理器', this.config);
            
            // 预加载常用国旗
            if (this.config.enablePreload) {
                this.preloadCommonFlags();
            }

            // 设置全局错误处理
            this.setupGlobalHandlers();
        }

        /**
         * 日志输出
         */
        log(...args) {
            if (this.config.debug) {
                console.log('[FlagManager]', ...args);
            }
        }

        /**
         * 设置全局处理函数
         */
        setupGlobalHandlers() {
            // 将处理函数挂载到全局对象，供HTML内联事件使用
            global.flagManagerHandleFlagLoad = this.handleFlagLoad;
            global.flagManagerHandleFlagError = this.handleFlagError;
        }

        /**
         * 获取国旗HTML元素
         * @param {string} countryCode - 国家代码 (如 'SG', 'US')
         * @param {string} countryName - 国家名称 (备用显示)
         * @param {object} options - 选项
         * @returns {string} HTML字符串
         */
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
                this.log('无效的国家代码:', countryCode);
                return this.getDefaultFlagHtml(opts);
            }

            const lowerCode = countryCode.toLowerCase();
            const flagUrl = this.getFlagUrl(lowerCode, opts.size);
            const flagId = this.generateFlagId(lowerCode);

            // 检查是否已知失败
            if (this.failedCodes.has(lowerCode)) {
                return this.getDefaultFlagHtml(opts);
            }

            // 构建CSS类名
            const classNames = [opts.className];
            if (opts.enableHover) classNames.push('flag-hover');
            if (opts.enableClick) classNames.push('flag-clickable');
            if (opts.size !== this.config.defaultSize) {
                classNames.push(`flag-${this.sizeToClass(opts.size)}`);
            }

            // 构建属性
            const attributes = [
                `id="${flagId}"`,
                `class="${classNames.join(' ')}"`,
                `src="${flagUrl}"`,
                `alt="${countryName || countryCode}"`,
                `data-country-code="${countryCode.toUpperCase()}"`,
                `data-country-name="${countryName}"`,
                `loading="lazy"`,
                `onerror="flagManagerHandleFlagError('${lowerCode}', '${flagId}')"`
                `onload="flagManagerHandleFlagLoad('${lowerCode}', '${flagId}')"`
            ];

            if (opts.showTooltip && countryName) {
                attributes.push(`title="${countryName}"`);
            }

            return `<img ${attributes.join(' ')} />`;
        }

        /**
         * 获取国旗URL
         */
        getFlagUrl(countryCode, size = 'w20') {
            return `${this.config.cdnUrl}/${size}/${countryCode}.png`;
        }

        /**
         * 生成唯一的国旗ID
         */
        generateFlagId(countryCode) {
            return `flag-${countryCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        /**
         * 验证国家代码是否有效
         */
        isValidCountryCode(countryCode) {
            return countryCode && 
                   typeof countryCode === 'string' && 
                   countryCode.length === 2 &&
                   /^[A-Za-z]{2}$/.test(countryCode);
        }

        /**
         * 尺寸标识转换为CSS类名
         */
        sizeToClass(size) {
            const sizeMap = {
                'w16': 'sm',
                'w20': 'md', 
                'w24': 'md',
                'w32': 'lg',
                'w48': 'xl'
            };
            return sizeMap[size] || 'md';
        }

        /**
         * 获取默认国旗HTML
         */
        getDefaultFlagHtml(options = {}) {
            const classNames = [options.className || 'country-flag', 'flag-default'];
            if (options.enableHover) classNames.push('flag-hover');
            if (options.enableClick) classNames.push('flag-clickable');

            return `<span class="${classNames.join(' ')}" title="未知国家"></span>`;
        }

        /**
         * 获取加载中的国旗HTML
         */
        getLoadingFlagHtml(options = {}) {
            const classNames = [options.className || 'country-flag', 'flag-loading'];
            return `<span class="${classNames.join(' ')}" title="正在加载..."></span>`;
        }

        /**
         * 处理国旗加载成功
         */
        handleFlagLoad(countryCode, flagId) {
            this.log(`国旗加载成功: ${countryCode.toUpperCase()}`);
            this.cache.set(countryCode, true);
            this.loadingCodes.delete(countryCode);
            
            const flagElement = document.getElementById(flagId);
            if (flagElement) {
                flagElement.classList.remove('flag-loading', 'flag-error');
                // 触发自定义事件
                this.dispatchFlagEvent('flagload', { countryCode, element: flagElement });
            }
        }

        /**
         * 处理国旗加载失败
         */
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
            flagElement.parentNode.insertBefore(defaultFlag, flagElement);

            // 触发自定义事件
            this.dispatchFlagEvent('flagerror', { countryCode, element: flagElement });
        }

        /**
         * 触发自定义事件
         */
        dispatchFlagEvent(eventName, detail) {
            if (typeof CustomEvent !== 'undefined') {
                const event = new CustomEvent(eventName, { detail });
                document.dispatchEvent(event);
            }
        }

        /**
         * 预加载常用国旗
         */
        async preloadCommonFlags() {
            const commonCodes = [
                'sg', 'us', 'cn', 'jp', 'kr', 'hk', 'tw', 
                'de', 'gb', 'fr', 'ca', 'au', 'in', 'ru',
                'br', 'nl', 'se', 'no', 'dk', 'fi', 'ch'
            ];

            this.log('开始预加载常用国旗:', commonCodes);

            this.preloadPromise = Promise.all(
                commonCodes.map(code => this.preloadFlag(code))
            );

            try {
                await this.preloadPromise;
                this.log('常用国旗预加载完成');
            } catch (error) {
                this.log('国旗预加载出错:', error);
            }
        }

        /**
         * 预加载单个国旗
         */
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

        /**
         * 根据IP地址获取国家信息
         */
        async getCountryFromIP(ip) {
            if (!this.config.enableAutoDetect) {
                return null;
            }

            try {
                this.log(`正在检测IP地理位置: ${ip}`);
                
                const response = await fetch(
                    `${this.config.autoDetectApiUrl}/${ip}/json/`,
                    { timeout: this.config.timeout }
                );
                
                if (!response.ok) {
                    throw new Error(`API响应错误: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.country_code && data.country_name) {
                    const result = {
                        country_code: data.country_code.toLowerCase(),
                        country_name: data.country_name,
                        city: data.city,
                        region: data.region
                    };
                    
                    this.log('IP地理位置检测成功:', result);
                    return result;
                }
                
                throw new Error('API返回数据不完整');
                
            } catch (error) {
                this.log('IP地理位置检测失败:', error);
                return null;
            }
        }

        /**
         * 自动检测并显示国旗
         */
        async autoDetectAndShowFlag(ip, elementId, options = {}) {
            const element = document.getElementById(elementId);
            if (!element) {
                this.log(`元素不存在: ${elementId}`);
                return false;
            }

            // 显示加载状态
            element.innerHTML = this.getLoadingFlagHtml(options);

            try {
                const countryInfo = await this.getCountryFromIP(ip);
                
                if (countryInfo && countryInfo.country_code) {
                    const flagHtml = this.getFlagHtml(
                        countryInfo.country_code.toUpperCase(), 
                        countryInfo.country_name,
                        options
                    );
                    
                    element.innerHTML = `${flagHtml} ${countryInfo.country_name}`;
                    return countryInfo;
                } else {
                    element.innerHTML = this.getDefaultFlagHtml(options) + ' 未知';
                    return null;
                }
            } catch (error) {
                this.log('自动检测国旗失败:', error);
                element.innerHTML = this.getDefaultFlagHtml(options) + ' 检测失败';
                return null;
            }
        }

        /**
         * 批量更新页面中的国旗
         */
        updateAllFlags(selector = '[data-country-code]') {
            const elements = document.querySelectorAll(selector);
            
            this.log(`批量更新国旗: ${elements.length} 个元素`);
            
            elements.forEach(element => {
                const countryCode = element.dataset.countryCode;
                const countryName = element.dataset.countryName || '';
                
                if (countryCode && this.isValidCountryCode(countryCode)) {
                    const flagHtml = this.getFlagHtml(countryCode, countryName);
                    element.innerHTML = flagHtml;
                }
            });
        }

        /**
         * 清除缓存
         */
        clearCache() {
            this.log('清除国旗缓存');
            this.cache.clear();
            this.failedCodes.clear();
        }

        /**
         * 获取缓存统计信息
         */
        getCacheStats() {
            return {
                cached: this.cache.size,
                failed: this.failedCodes.size,
                loading: this.loadingCodes.size
            };
        }

        /**
         * 销毁实例
         */
        destroy() {
            this.log('销毁国旗管理器');
            this.cache.clear();
            this.failedCodes.clear();
            this.loadingCodes.clear();
            
            // 清理全局处理函数
            delete global.flagManagerHandleFlagLoad;
            delete global.flagManagerHandleFlagError;
        }
    }

    /**
     * 国家代码映射工具
     */
    class CountryCodeMapper {
        constructor() {
            this.countryMap = {
                // 主要国家和地区
                'China': 'CN', '中国': 'CN',
                'United States': 'US', '美国': 'US',
                'United Kingdom': 'GB', '英国': 'GB',
                'Japan': 'JP', '日本': 'JP',
                'South Korea': 'KR', 'Korea': 'KR', '韩国': 'KR',
                'Singapore': 'SG', '新加坡': 'SG',
                'Hong Kong': 'HK', '香港': 'HK',
                'Taiwan': 'TW', '台湾': 'TW',
                'Germany': 'DE', '德国': 'DE',
                'France': 'FR', '法国': 'FR',
                'Canada': 'CA', '加拿大': 'CA',
                'Australia': 'AU', '澳大利亚': 'AU',
                'India': 'IN', '印度': 'IN',
                'Russia': 'RU', '俄罗斯': 'RU',
                'Brazil': 'BR', '巴西': 'BR',
                'Netherlands': 'NL', '荷兰': 'NL',
                'Sweden': 'SE', '瑞典': 'SE',
                'Norway': 'NO', '挪威': 'NO',
                'Denmark': 'DK', '丹麦': 'DK',
                'Finland': 'FI', '芬兰': 'FI',
                'Switzerland': 'CH', '瑞士': 'CH',
                'Austria': 'AT', '奥地利': 'AT',
                'Belgium': 'BE', '比利时': 'BE',
                'Italy': 'IT', '意大利': 'IT',
                'Spain': 'ES', '西班牙': 'ES',
                'Portugal': 'PT', '葡萄牙': 'PT',
                'Thailand': 'TH', '泰国': 'TH',
                'Vietnam': 'VN', '越南': 'VN',
                'Malaysia': 'MY', '马来西亚': 'MY',
                'Indonesia': 'ID', '印度尼西亚': 'ID',
                'Philippines': 'PH', '菲律宾': 'PH',
                'Myanmar': 'MM', '缅甸': 'MM',
                'Cambodia': 'KH', '柬埔寨': 'KH',
                'Laos': 'LA', '老挝': 'LA',
                'Bangladesh': 'BD', '孟加拉国': 'BD',
                'Pakistan': 'PK', '巴基斯坦': 'PK',
                'Sri Lanka': 'LK', '斯里兰卡': 'LK',
                'Nepal': 'NP', '尼泊尔': 'NP',
                'Afghanistan': 'AF', '阿富汗': 'AF',
                'Iran': 'IR', '伊朗': 'IR',
                'Iraq': 'IQ', '伊拉克': 'IQ',
                'Turkey': 'TR', '土耳其': 'TR',
                'Israel': 'IL', '以色列': 'IL',
                'UAE': 'AE', '阿联酋': 'AE',
                'Saudi Arabia': 'SA', '沙特阿拉伯': 'SA',
                'Egypt': 'EG', '埃及': 'EG',
                'South Africa': 'ZA', '南非': 'ZA',
                'Nigeria': 'NG', '尼日利亚': 'NG',
                'Kenya': 'KE', '肯尼亚': 'KE',
                'Morocco': 'MA', '摩洛哥': 'MA',
                'Mexico': 'MX', '墨西哥': 'MX',
                'Argentina': 'AR', '阿根廷': 'AR',
                'Chile': 'CL', '智利': 'CL',
                'Colombia': 'CO', '哥伦比亚': 'CO',
                'Peru': 'PE', '秘鲁': 'PE',
                'Venezuela': 'VE', '委内瑞拉': 'VE',
                'New Zealand': 'NZ', '新西兰': 'NZ',
                'Iceland': 'IS', '冰岛': 'IS',
                'Ireland': 'IE', '爱尔兰': 'IE',
                'Luxembourg': 'LU', '卢森堡': 'LU',
                'Monaco': 'MC', '摩纳哥': 'MC',
                'Malta': 'MT', '马耳他': 'MT',
                'Cyprus': 'CY', '塞浦路斯': 'CY',
                'Estonia': 'EE', '爱沙尼亚': 'EE',
                'Latvia': 'LV', '拉脱维亚': 'LV',
                'Lithuania': 'LT', '立陶宛': 'LT',
                'Slovenia': 'SI', '斯洛文尼亚': 'SI',
                'Slovakia': 'SK', '斯洛伐克': 'SK',
                'Croatia': 'HR', '克罗地亚': 'HR',
                'Serbia': 'RS', '塞尔维亚': 'RS',
                'Montenegro': 'ME', '黑山': 'ME',
                'Bosnia and Herzegovina': 'BA', '波黑': 'BA',
                'North Macedonia': 'MK', '北马其顿': 'MK',
                'Albania': 'AL', '阿尔巴尼亚': 'AL',
                'Moldova': 'MD', '摩尔多瓦': 'MD',
                'Ukraine': 'UA', '乌克兰': 'UA',
                'Belarus': 'BY', '白俄罗斯': 'BY',
                'Georgia': 'GE', '格鲁吉亚': 'GE',
                'Armenia': 'AM', '亚美尼亚': 'AM',
                'Azerbaijan': 'AZ', '阿塞拜疆': 'AZ',
                'Kazakhstan': 'KZ', '哈萨克斯坦': 'KZ',
                'Uzbekistan': 'UZ', '乌兹别克斯坦': 'UZ',
                'Turkmenistan': 'TM', '土库曼斯坦': 'TM',
                'Kyrgyzstan': 'KG', '吉尔吉斯斯坦': 'KG',
                'Tajikistan': 'TJ', '塔吉克斯坦': 'TJ',
                'Mongolia': 'MN', '蒙古': 'MN'
            };
        }

        /**
         * 根据国家名称获取国家代码
         */
        getCountryCode(countryName) {
            if (!countryName) return null;

            // 直接匹配
            if (this.countryMap[countryName]) {
                return this.countryMap[countryName];
            }

            // 模糊匹配（忽略大小写）
            const lowerCountryName = countryName.toLowerCase();
            for (const [name, code] of Object.entries(this.countryMap)) {
                if (name.toLowerCase() === lowerCountryName) {
                    return code;
                }
            }

            // 部分匹配
            for (const [name, code] of Object.entries(this.countryMap)) {
                if (lowerCountryName.includes(name.toLowerCase()) || 
                    name.toLowerCase().includes(lowerCountryName)) {
                    return code;
                }
            }

            console.log(`未找到国家代码: ${countryName}`);
            return null;
        }

        /**
         * 添加自定义映射
         */
        addMapping(countryName, countryCode) {
            this.countryMap[countryName] = countryCode.toUpperCase();
        }

        /**
         * 获取所有支持的国家
         */
        getAllCountries() {
            return Object.keys(this.countryMap);
        }
    }

    /**
     * 国旗工具函数集合
     */
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
            const countryMapper = new CountryCodeMapper();

            container.className = 'flag-selector';
            container.innerHTML = config.countries.map(code => {
                const name = countryMapper.getCountryName(code) || code;
                const flagHtml = flagManager.getFlagHtml(code, name, {
                    size: `w${config.size === 'sm' ? '16' : config.size === 'lg' ? '32' : '20'}`,
                    enableClick: true
                });

                return `
                    <div class="flag-option" data-country-code="${code}" data-country-name="${name}">
                        ${flagHtml}
                        ${config.showNames ? `<span class="country-name">${name}</span>` : ''}
                    </div>
                `;
            }).join('');

            // 添加点击事件
            container.addEventListener('click', (e) => {
                const option = e.target.closest('.flag-option');
                if (option && config.onSelect) {
                    const countryCode = option.dataset.countryCode;
                    const countryName = option.dataset.countryName;
                    config.onSelect(countryCode, countryName);
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
                        const flagHtml = flagManager.getFlagHtml(countryCode, '', {
                            className: 'country-flag flag-inline'
                        });
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

    // 导出到全局对象
    global.FlagManager = FlagManager;
    global.CountryCodeMapper = CountryCodeMapper;
    global.FlagUtils = FlagUtils;

    // 创建默认实例（向后兼容）
    global.flagManager = new FlagManager();
    global.countryMapper = new CountryCodeMapper();

    console.log('[Flag Module] 国旗模块已加载完成');

})(window || global || this);