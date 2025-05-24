// 地理位置检测工具 - 最终修复版本
async function getLocationInfo(ip) {
    console.log(`🔍 开始检测IP地理位置: ${ip}`);
    
    // 首先尝试使用内置的 https 模块
    let requestMethod = null;
    
    try {
        const https = require('https');
        const http = require('http');
        
        requestMethod = (url) => {
            return new Promise((resolve, reject) => {
                const urlObj = new URL(url);
                const protocol = urlObj.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'VPS-Monitor/1.0',
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                };
                
                const req = protocol.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const jsonData = JSON.parse(data);
                            resolve({
                                ok: res.statusCode >= 200 && res.statusCode < 300,
                                status: res.statusCode,
                                data: jsonData
                            });
                        } catch (parseError) {
                            reject(new Error(`JSON解析失败: ${parseError.message}`));
                        }
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('请求超时'));
                });
                
                req.end();
            });
        };
        
        console.log('✅ 使用内置 https/http 模块进行地理位置检测');
        
    } catch (error) {
        console.log('⚠️ 内置模块不可用，跳过地理位置检测');
        return createDefaultLocationInfo();
    }

    const locationServices = [
        {
            name: 'ip-api.com',
            url: `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query`,
            parser: parseIpApiResponse
        },
        {
            name: 'ipapi.co',
            url: `https://ipapi.co/${ip}/json/`,
            parser: parseIpApiCoResponse
        },
        {
            name: 'ipwhois.app',
            url: `http://ipwho.is/${ip}`,
            parser: parseIpWhoisResponse
        }
    ];
    
    for (const service of locationServices) {
        try {
            console.log(`🌐 尝试地理位置服务: ${service.name}`);
            
            const response = await requestMethod(service.url);
            
            if (response.ok) {
                const locationInfo = service.parser(response.data);
                
                if (locationInfo && locationInfo.country && locationInfo.country_code && locationInfo.country_code !== 'XX') {
                    console.log(`✅ 地理位置检测成功 (${service.name}):`, locationInfo);
                    return locationInfo;
                } else {
                    console.log(`⚠️ ${service.name} 返回无效数据:`, response.data);
                }
            } else {
                console.log(`⚠️ ${service.name} HTTP错误: ${response.status}`);
            }
        } catch (error) {
            console.log(`⚠️ 地理位置服务失败 ${service.name}:`, error.message);
        }
        
        // 每次请求之间添加延迟
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('❌ 所有地理位置服务都失败，使用默认值');
    return createDefaultLocationInfo();
}

function createDefaultLocationInfo() {
    return {
        country: 'Unknown',
        country_code: 'XX',
        city: 'Unknown',
        region: 'Unknown',
        isp: 'Unknown ISP',
        location_string: 'Unknown Location'
    };
}

function parseIpApiResponse(data) {
    try {
        console.log('🔍 解析 ip-api.com 响应:', data);
        
        if (data.status === 'success') {
            // 保持原始ISP名称，不进行过度清理
            const originalIsp = data.isp || data.org || 'Unknown ISP';
            const cleanIsp = cleanIspNameConservative(originalIsp, data.city, data.country);
            
            const locationInfo = {
                country: data.country || 'Unknown',
                country_code: data.countryCode || 'XX',
                city: data.city || 'Unknown',
                region: data.regionName || data.region || 'Unknown',
                isp: cleanIsp,
                org: data.org || '',
                location_string: `${data.city || 'Unknown'}, ${data.country || 'Unknown'}`
            };
            
            console.log('✅ ip-api.com 解析成功:', locationInfo);
            return locationInfo;
        } else {
            console.log('❌ ip-api.com 响应失败:', data.message);
        }
    } catch (error) {
        console.log('❌ 解析ip-api响应失败:', error.message);
    }
    return null;
}

function parseIpApiCoResponse(data) {
    try {
        console.log('🔍 解析 ipapi.co 响应:', data);
        
        if (data.country_name && data.country_code) {
            const originalIsp = data.org || 'Unknown ISP';
            const cleanIsp = cleanIspNameConservative(originalIsp, data.city, data.country_name);
            
            const locationInfo = {
                country: data.country_name,
                country_code: data.country_code,
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                isp: cleanIsp,
                org: data.org || '',
                location_string: `${data.city || 'Unknown'}, ${data.country_name}`
            };
            
            console.log('✅ ipapi.co 解析成功:', locationInfo);
            return locationInfo;
        } else {
            console.log('❌ ipapi.co 响应数据不完整');
        }
    } catch (error) {
        console.log('❌ 解析ipapi.co响应失败:', error.message);
    }
    return null;
}

function parseIpWhoisResponse(data) {
    try {
        console.log('🔍 解析 ipwho.is 响应:', data);
        
        if (data.success && data.country && data.country_code) {
            const originalIsp = data.connection?.isp || data.connection?.org || 'Unknown ISP';
            const cleanIsp = cleanIspNameConservative(originalIsp, data.city, data.country);
            
            const locationInfo = {
                country: data.country,
                country_code: data.country_code,
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                isp: cleanIsp,
                org: data.connection?.org || '',
                location_string: `${data.city || 'Unknown'}, ${data.country}`
            };
            
            console.log('✅ ipwho.is 解析成功:', locationInfo);
            return locationInfo;
        } else {
            console.log('❌ ipwho.is 响应数据不完整');
        }
    } catch (error) {
        console.log('❌ 解析ipwho.is响应失败:', error.message);
    }
    return null;
}

// 保守的ISP名称清理（避免过度清理）
function cleanIspNameConservative(isp, city, country) {
    if (!isp || isp === 'Unknown ISP') return 'Unknown ISP';
    
    let cleanIsp = isp.toString().trim();
    
    console.log(`🧹 保守清理ISP名称: "${cleanIsp}"`);
    
    // 只在ISP名称明显有问题时才进行清理
    
    // 1. 只处理明显的重复模式（如：SingaporeSingapore）
    cleanIsp = cleanIsp.replace(/(\w{4,})\1+/gi, '$1');
    
    // 2. 只在开头有地名且后面跟逗号时才移除
    if (city && city !== 'Unknown') {
        // 只移除开头的"City, "模式
        const cityPattern = new RegExp(`^${escapeRegExp(city)}\\s*,\\s*`, 'gi');
        cleanIsp = cleanIsp.replace(cityPattern, '');
    }
    
    if (country && country !== 'Unknown') {
        // 只移除开头的"Country, "模式
        const countryPattern = new RegExp(`^${escapeRegExp(country)}\\s*,\\s*`, 'gi');
        cleanIsp = cleanIsp.replace(countryPattern, '');
    }
    
    // 3. 清理开头和结尾的标点符号和空格
    cleanIsp = cleanIsp.replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    
    // 4. 如果清理后太短或为空，使用原始名称
    if (!cleanIsp || cleanIsp.length < 3) {
        cleanIsp = isp;
    }
    
    console.log(`✅ ISP名称清理完成: "${isp}" -> "${cleanIsp}"`);
    
    return cleanIsp;
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 根据国家代码获取国家名称
function getCountryNameFromCode(countryCode) {
    const countryMap = {
        'SG': 'Singapore',
        'US': 'United States',
        'CN': 'China',
        'JP': 'Japan',
        'KR': 'South Korea',
        'HK': 'Hong Kong',
        'TW': 'Taiwan',
        'DE': 'Germany',
        'GB': 'United Kingdom',
        'FR': 'France',
        'CA': 'Canada',
        'AU': 'Australia',
        'IN': 'India',
        'RU': 'Russia',
        'BR': 'Brazil',
        'NL': 'Netherlands',
        'SE': 'Sweden',
        'NO': 'Norway',
        'DK': 'Denmark',
        'FI': 'Finland',
        'CH': 'Switzerland',
        'AT': 'Austria',
        'BE': 'Belgium',
        'IT': 'Italy',
        'ES': 'Spain',
        'PT': 'Portugal',
        'TH': 'Thailand',
        'VN': 'Vietnam',
        'MY': 'Malaysia',
        'ID': 'Indonesia',
        'PH': 'Philippines'
    };
    
    return countryMap[countryCode] || null;
}

// 验证地理位置信息的完整性
function validateLocationInfo(locationInfo) {
    if (!locationInfo) return false;
    
    // 必须有国家信息
    if (!locationInfo.country || !locationInfo.country_code) return false;
    
    // 国家代码不能是未知值
    if (locationInfo.country_code === 'XX' || locationInfo.country === 'Unknown') return false;
    
    return true;
}

module.exports = {
    getLocationInfo,
    parseIpApiResponse,
    parseIpApiCoResponse,
    parseIpWhoisResponse,
    validateLocationInfo,
    cleanIspNameConservative,
    getCountryNameFromCode
};