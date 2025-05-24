// 地理位置检测工具
async function getLocationInfo(ip) {
    // 首先尝试使用 node-fetch，如果不可用则跳过服务器端检测
    let fetch;
    try {
        fetch = require('node-fetch');
    } catch (error) {
        console.log('⚠️ node-fetch 不可用，跳过服务器端地理位置检测');
        return {
            country: 'Unknown',
            country_code: 'XX',
            city: 'Unknown',
            region: 'Unknown',
            isp: 'Unknown ISP',
            location_string: 'Unknown Location'
        };
    }

    const locationServices = [
        {
            url: `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query`,
            parser: parseIpApiResponse
        },
        {
            url: `https://ipinfo.io/${ip}/json`,
            parser: parseIpInfoResponse
        }
    ];
    
    for (const service of locationServices) {
        try {
            const response = await fetch(service.url, { timeout: 10000 });
            if (response.ok) {
                const data = await response.json();
                const locationInfo = service.parser(data);
                
                if (locationInfo && locationInfo.country) {
                    console.log(`✅ 地理位置检测成功 (${service.url}):`, locationInfo);
                    return locationInfo;
                }
            }
        } catch (error) {
            console.log(`⚠️ 地理位置服务失败 ${service.url}:`, error.message);
        }
    }
    
    console.log('❌ 所有地理位置服务都失败，使用默认值');
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
        if (data.status === 'success') {
            return {
                country: data.country || 'Unknown',
                country_code: data.countryCode || 'XX',
                city: data.city || 'Unknown',
                region: data.regionName || 'Unknown',
                isp: data.isp || 'Unknown ISP',
                org: data.org || '',
                location_string: `${data.city || 'Unknown'}, ${data.country || 'Unknown'}`
            };
        }
    } catch (error) {
        console.log('解析ip-api响应失败:', error.message);
    }
    return null;
}

function parseIpInfoResponse(data) {
    try {
        if (data.country) {
            const city = data.city || 'Unknown';
            const country = data.country || 'Unknown';
            const region = data.region || 'Unknown';
            const org = data.org || 'Unknown ISP';
            
            return {
                country: country,
                country_code: data.country || 'XX',
                city: city,
                region: region,
                isp: org,
                org: org,
                location_string: `${city}, ${country}`
            };
        }
    } catch (error) {
        console.log('解析ipinfo响应失败:', error.message);
    }
    return null;
}

module.exports = {
    getLocationInfo,
    parseIpApiResponse,
    parseIpInfoResponse
};