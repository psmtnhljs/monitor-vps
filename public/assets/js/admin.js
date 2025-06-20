// 令牌过期处理补丁 - 添加到你现有 admin.js 文件的开头
// 在第一行 let authToken = localStorage.getItem('adminToken'); 之后添加以下代码

// ================ 令牌过期处理功能 ================

// 检查令牌是否过期
function isTokenExpired(token) {
    if (!token) return true;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        
        const payload = JSON.parse(atob(parts[1]));
        const exp = payload.exp * 1000; // 转换为毫秒
        const now = Date.now();
        
        // 如果令牌在5分钟内过期，也认为已过期（提前刷新）
        return now >= (exp - 5 * 60 * 1000);
    } catch (error) {
        console.error('解析令牌失败:', error);
        return true;
    }
}

// 获取令牌剩余时间（分钟）
function getTokenRemainingMinutes(token) {
    if (!token) return 0;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return 0;
        
        const payload = JSON.parse(atob(parts[1]));
        const exp = payload.exp * 1000;
        const now = Date.now();
        
        return Math.max(0, Math.floor((exp - now) / (1000 * 60)));
    } catch (error) {
        return 0;
    }
}

// 清除无效令牌
function clearInvalidToken() {
    localStorage.removeItem('adminToken');
    authToken = null;
    console.log('🗑️ 已清除无效令牌');
    if (typeof updateDebugInfo === 'function') {
        updateDebugInfo('已清除无效令牌');
    }
}

// 显示令牌过期提醒
function showTokenExpirationWarning(remainingMinutes) {
    // 移除已存在的警告
    const existing = document.getElementById('tokenWarning');
    if (existing) existing.remove();
    
    const warningDiv = document.createElement('div');
    warningDiv.id = 'tokenWarning';
    warningDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
        padding: 15px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 10000;
        max-width: 300px;
    `;
    
    warningDiv.innerHTML = `
        <strong>⚠️ 登录即将过期</strong><br>
        剩余时间：${remainingMinutes} 分钟<br>
        <button onclick="refreshToken()" style="margin-top: 10px; margin-right: 10px; padding: 5px 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">延长登录</button>
        <button onclick="dismissTokenWarning()" style="margin-top: 10px; padding: 5px 10px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">忽略</button>
    `;
    
    document.body.appendChild(warningDiv);
}

// 关闭令牌过期提醒
function dismissTokenWarning() {
    const warning = document.getElementById('tokenWarning');
    if (warning) warning.remove();
}

// 刷新令牌（重新登录）
async function refreshToken() {
    dismissTokenWarning();
    
    if (confirm('需要重新登录以延长会话，是否继续？')) {
        clearInvalidToken();
        showLoginPage();
    }
}

// 改进的fetch包装函数（保持原有函数名不变）
async function safeFetch(url, options = {}) {
    // 检查令牌是否过期
    if (authToken && isTokenExpired(authToken)) {
        console.log('⚠️ 令牌已过期，自动清除');
        if (typeof updateDebugInfo === 'function') {
            updateDebugInfo('令牌已过期，需要重新登录');
        }
        clearInvalidToken();
        
        if (confirm('登录已过期，是否重新登录？')) {
            showLoginPage();
        }
        throw new Error('令牌已过期，请重新登录');
    }
    
    // 如果需要认证且有令牌，添加认证头
    if (authToken && options.headers && options.headers['Authorization']) {
        // 已经有认证头，直接使用原有逻辑
    } else if (authToken && (url.includes('/api/admin/') || url.includes('/api/nodes/'))) {
        // 自动添加认证头
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
    }
    
    try {
        const response = await fetch(url, options);
        
        // 处理认证错误
        if (response.status === 401 || response.status === 403) {
            console.log('🔒 认证失败，令牌可能已失效');
            if (typeof updateDebugInfo === 'function') {
                updateDebugInfo(`认证失败: HTTP ${response.status}`);
            }
            clearInvalidToken();
            
            // 尝试获取错误详情
            let errorMessage = '认证失败';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // 忽略JSON解析错误
            }
            
            // 显示友好的错误提示
            if (confirm(`${errorMessage}\n\n是否重新登录？`)) {
                showLoginPage();
            }
            
            throw new Error(errorMessage);
        }
        
        return response;
    } catch (error) {
        // 如果不是认证错误，按原有逻辑处理
        if (!error.message.includes('认证失败') && !error.message.includes('令牌已过期')) {
            console.error('网络请求失败:', error);
            if (typeof updateDebugInfo === 'function') {
                updateDebugInfo(`网络请求失败: ${error.message}`);
            }
        }
        throw error;
    }
}

// 检查令牌状态并显示剩余时间（在调试模式下）
function checkTokenStatus() {
    if (authToken) {
        const remainingMinutes = getTokenRemainingMinutes(authToken);
        
        if (typeof updateDebugInfo === 'function' && debugMode) {
            updateDebugInfo(`当前令牌剩余: ${remainingMinutes} 分钟`);
        }
        
        // 如果令牌已过期
        if (isTokenExpired(authToken)) {
            console.log('⏰ 检查发现令牌已过期');
            clearInvalidToken();
            if (confirm('登录已过期，是否重新登录？')) {
                showLoginPage();
            }
            return false;
        }
        // 如果令牌在15分钟内过期，显示警告
        else if (remainingMinutes <= 15 && remainingMinutes > 5) {
            showTokenExpirationWarning(remainingMinutes);
        }
        // 如果令牌在5分钟内过期，强烈提醒
        else if (remainingMinutes <= 5 && remainingMinutes > 0) {
            showTokenExpirationWarning(remainingMinutes);
        }
        
        return true;
    }
    return false;
}

// ================ 修改现有函数以使用令牌检查 ================

// 保存原有的 showAdminPage 函数
const originalShowAdminPage = typeof showAdminPage !== 'undefined' ? showAdminPage : null;

// 重写 showAdminPage 函数，添加令牌检查
function showAdminPage() {
    // 检查令牌状态
    if (!checkTokenStatus()) {
        return; // 令牌无效，已处理
    }
    
    // 调用原有逻辑
    if (originalShowAdminPage) {
        originalShowAdminPage();
    } else {
        // 如果没有原函数，使用基本逻辑
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('adminPage').classList.remove('hidden');
        loadConfig();
        loadNodes();
    }
}

// ================ 定期检查令牌有效性 ================

// 定期检查令牌有效性（每3分钟检查一次）
setInterval(() => {
    if (authToken) {
        checkTokenStatus();
    }
}, 3 * 60 * 1000); // 3分钟

// 页面可见性变化时检查令牌
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && authToken) {
        setTimeout(checkTokenStatus, 1000); // 延迟1秒检查
    }
});

// 页面关闭时清理
window.addEventListener('beforeunload', function() {
    dismissTokenWarning();
});

console.log('✅ 令牌过期处理功能已加载');

// ================ 使用说明 ================
// 现在你需要将所有的 fetch() 调用替换为 safeFetch()
// 或者保持原有的 fetch，safeFetch 会自动处理认证错误

/**
 * VPS网络质量监测 - 管理后台JavaScript（动态国旗系统版）
 * 自动从API获取国家信息，无需维护庞大的国家映射表
 */

let authToken = localStorage.getItem('adminToken');
const API_BASE = window.location.origin;
let debugMode = false;

// 动态国旗系统实例（从上面的系统加载）
let flagSystem = null;

// 初始化动态国旗系统
function initDynamicFlagSystem() {
    if (typeof DynamicFlagSystem !== 'undefined') {
        flagSystem = new DynamicFlagSystem();
        console.log('✅ 动态国旗系统初始化成功');
    } else {
        console.warn('⚠️ 动态国旗系统未加载，使用fallback方案');
    }
}

// 修复的智能国旗创建函数 - 替换 admin.js 中对应的部分

// 智能国旗创建函数 - 修复版本
async function createSmartFlag(locationOrCountry, countryName, size = 20) {
    console.log(`🏁 createSmartFlag 调用:`, { locationOrCountry, countryName, size });
    
    // 如果动态系统可用，使用动态系统
    if (flagSystem) {
        try {
            let countryCode = null;
            let finalCountryName = countryName;

            // 1. 如果已经是有效的国家代码
            if (locationOrCountry && locationOrCountry.length === 2 && /^[A-Z]{2}$/i.test(locationOrCountry)) {
                countryCode = locationOrCountry.toUpperCase();
                console.log(`🔍 检测到国家代码: ${countryCode}`);
            }
            // 2. 从位置字符串解析
            else if (locationOrCountry) {
                console.log(`🔍 动态解析位置: ${locationOrCountry}`);
                
                if (locationOrCountry.includes(',')) {
                    // 位置格式: "City, Country"
                    const result = await flagSystem.extractCountryFromLocation(locationOrCountry);
                    if (result) {
                        countryCode = result.country_code;
                        finalCountryName = result.country_name;
                        console.log(`✅ 位置解析成功: ${countryCode} - ${finalCountryName}`);
                    }
                } else {
                    // 直接查询国家名
                    countryCode = await flagSystem.getCountryCode(locationOrCountry);
                    finalCountryName = finalCountryName || locationOrCountry;
                    console.log(`✅ 国家名查询结果: ${countryCode}`);
                }
            }

            // 3. 生成国旗HTML
            if (countryCode && countryCode !== 'XX') {
                console.log(`🎨 生成国旗HTML: ${countryCode} - ${finalCountryName}`);
                return await createFlagImageWithFallback(countryCode, finalCountryName, size);
            } else {
                console.log(`⚠️ 无有效国家代码，使用默认图标`);
            }
        } catch (error) {
            console.warn('动态国旗生成失败，使用fallback:', error);
        }
    } else {
        console.warn('⚠️ flagSystem 未初始化，使用基础映射');
    }

    // Fallback: 使用基础映射
    const basicCountryCode = getBasicCountryCode(locationOrCountry);
    if (basicCountryCode) {
        console.log(`🔄 使用基础映射: ${locationOrCountry} -> ${basicCountryCode}`);
        return await createFlagImageWithFallback(basicCountryCode, countryName || locationOrCountry, size);
    }

    // 最终fallback: 默认图标
    console.log(`🌐 使用默认图标`);
    return '<span class="country-flag flag-default" title="未知国家">🌐</span>';
}

// 创建带有多重fallback的国旗图片 - 修复版本
async function createFlagImageWithFallback(countryCode, countryName, size = 20) {
    if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
        return '<span class="country-flag flag-default" title="未知国家">🌐</span>';
    }
    
    const lowerCode = countryCode.toLowerCase();
    const title = (countryName || countryCode.toUpperCase()).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const safeCountryCode = countryCode.toUpperCase();
    
    // 多个国旗图片源
    const flagSources = [
        `https://flagcdn.com/w${size}/${lowerCode}.png`,
        `https://flagpedia.net/data/flags/w${size}/${lowerCode}.png`,
        `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${lowerCode}.svg`
    ];
    
    // 生成唯一ID
    const uniqueId = `flag_${lowerCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🖼️ 创建国旗图片: ${safeCountryCode} (${title})`);
    
    return `<img id="${uniqueId}" src="${flagSources[0]}" alt="${title}" title="${title}" class="country-flag" style="width: ${size}px; height: ${Math.round(size * 0.75)}px; margin-right: 6px; border-radius: 2px; vertical-align: middle; object-fit: cover;" onerror="handleSmartFlagError('${uniqueId}', ${JSON.stringify(flagSources)}, '${title}', '${safeCountryCode}')" loading="lazy" />`;
}

// 修复的初始化函数
function initDynamicFlagSystem() {
    console.log('🔄 初始化动态国旗系统...');
    
    if (typeof DynamicFlagSystem !== 'undefined') {
        try {
            flagSystem = new DynamicFlagSystem();
            console.log('✅ 动态国旗系统初始化成功');
            
            // 测试系统是否正常工作
            setTimeout(async () => {
                try {
                    const testResult = await flagSystem.getCountryCode('United States');
                    console.log('🧪 系统测试结果:', testResult);
                } catch (error) {
                    console.error('🧪 系统测试失败:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ 动态国旗系统初始化失败:', error);
            flagSystem = null;
        }
    } else {
        console.warn('⚠️ DynamicFlagSystem 类未找到，使用fallback方案');
        flagSystem = null;
    }
}

// 修复的基础国家代码映射（保持原有逻辑）
function getBasicCountryCode(countryName) {
    const basicMap = {
        'Vietnam': 'VN', 'Viet Nam': 'VN', '越南': 'VN',
        'Singapore': 'SG', '新加坡': 'SG',
        'United States': 'US', 'USA': 'US', 'America': 'US', '美国': 'US',
        'China': 'CN', '中国': 'CN',
        'Japan': 'JP', '日本': 'JP',
        'South Korea': 'KR', 'Korea': 'KR', '韩国': 'KR',
        'Germany': 'DE', '德国': 'DE',
        'United Kingdom': 'GB', 'UK': 'GB', 'Britain': 'GB', '英国': 'GB',
        'France': 'FR', '法国': 'FR',
        'Canada': 'CA', '加拿大': 'CA',
        'Australia': 'AU', '澳大利亚': 'AU',
        'Russia': 'RU', '俄罗斯': 'RU',
        'India': 'IN', '印度': 'IN',
        'Brazil': 'BR', '巴西': 'BR',
        'Netherlands': 'NL', '荷兰': 'NL',
        'Switzerland': 'CH', '瑞士': 'CH',
        'Hong Kong': 'HK', '香港': 'HK',
        'Taiwan': 'TW', '台湾': 'TW',
        'Thailand': 'TH', '泰国': 'TH',
        'Malaysia': 'MY', '马来西亚': 'MY',
        'Indonesia': 'ID', '印度尼西亚': 'ID',
        'Philippines': 'PH', '菲律宾': 'PH'
    };

    if (!countryName) return null;
    
    // 直接匹配
    if (basicMap[countryName]) return basicMap[countryName];
    
    // 忽略大小写匹配
    const lowerName = countryName.toLowerCase();
    for (const [name, code] of Object.entries(basicMap)) {
        if (name.toLowerCase() === lowerName) return code;
    }
    
    // 从位置字符串提取（如："Ho Chi Minh City, Vietnam"）
    if (countryName.includes(',')) {
        const parts = countryName.split(',').map(part => part.trim());
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (basicMap[part]) return basicMap[part];
            
            // 模糊匹配
            for (const [name, code] of Object.entries(basicMap)) {
                if (name.toLowerCase() === part.toLowerCase()) return code;
            }
        }
    }
    
    return null;
}

// 测试函数 - 用于调试
function testFlagSystem() {
    console.log('🧪 开始测试国旗系统...');
    
    const testCases = [
        'United States',
        'Singapore', 
        'China',
        'United Kingdom',
        'Ho Chi Minh City, Vietnam',
        'Tokyo, Japan'
    ];
    
    testCases.forEach(async (testCase) => {
        try {
            const result = await createSmartFlag(testCase, testCase, 20);
            console.log(`🧪 测试 "${testCase}":`, result ? '✅ 成功' : '❌ 失败');
        } catch (error) {
            console.error(`🧪 测试 "${testCase}" 出错:`, error);
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initDynamicFlagSystem();
    
    if (authToken) {
        showAdminPage();
    } else {
        showLoginPage();
    }
});

// 调试功能
function toggleDebug() {
    debugMode = !debugMode;
    const debugPanel = document.getElementById('debugPanel');
    if (debugMode) {
        debugPanel.style.display = 'block';
        updateDebugInfo('调试模式已启用');
        console.log('🐛 调试模式启用');
        
        // 显示国旗系统状态
        if (flagSystem) {
            const stats = flagSystem.getCacheStats();
            updateDebugInfo(`国旗缓存: ${stats.size} 个条目`);
        }
    } else {
        debugPanel.style.display = 'none';
        console.log('🐛 调试模式关闭');
    }
}

function updateDebugInfo(message) {
    if (debugMode) {
        const debugInfo = document.getElementById('debugInfo');
        const timestamp = new Date().toLocaleTimeString();
        debugInfo.innerHTML += `[${timestamp}] ${message}\n`;
        debugInfo.scrollTop = debugInfo.scrollHeight;
    }
}

// 显示登录页面
function showLoginPage() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('adminPage').classList.add('hidden');
}

// 显示管理页面
function showAdminPage() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('adminPage').classList.remove('hidden');
    loadConfig();
    loadNodes();
}

// 登录处理
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            document.getElementById('welcomeText').textContent = `欢迎，${data.user.username}`;
            showAdminPage();
            showAlert('loginAlert', '登录成功！', 'success');
        } else {
            showAlert('loginAlert', data.error || '登录失败', 'danger');
        }
    } catch (error) {
        showAlert('loginAlert', '网络错误，请重试', 'danger');
    }
});

// 退出登录
function logout() {
    localStorage.removeItem('adminToken');
    authToken = null;
    showLoginPage();
}

// 显示提示信息
function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

// 显示修改密码模态框
function showChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'block';
    document.getElementById('changePasswordForm').reset();
    document.getElementById('passwordAlert').innerHTML = '';
    updateDebugInfo('显示修改密码对话框');
}

// 修改密码处理
document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // 验证新密码
    if (newPassword.length < 6) {
        showAlert('passwordAlert', '新密码长度至少6位', 'danger');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('passwordAlert', '两次输入的新密码不一致', 'danger');
        return;
    }
    
    if (currentPassword === newPassword) {
        showAlert('passwordAlert', '新密码不能与当前密码相同', 'danger');
        return;
    }
    
    console.log('🔐 开始修改密码...');
    updateDebugInfo('开始修改密码');
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ 密码修改成功');
            updateDebugInfo('密码修改成功');
            
            showAlert('passwordAlert', '密码修改成功！即将重新登录...', 'success');
            
            setTimeout(() => {
                closeModal('changePasswordModal');
                logout();
                alert('密码修改成功，请使用新密码重新登录！');
            }, 2000);
        } else {
            console.error('❌ 密码修改失败:', data.error);
            updateDebugInfo(`密码修改失败: ${data.error}`);
            showAlert('passwordAlert', data.error || '密码修改失败', 'danger');
        }
    } catch (error) {
        console.error('❌ 密码修改网络错误:', error);
        updateDebugInfo(`密码修改网络错误: ${error.message}`);
        showAlert('passwordAlert', '网络错误，请重试', 'danger');
    }
});

// 加载系统配置
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/config`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const config = await response.json();
        
        document.getElementById('apiKey').value = config.api_key || '';
        document.getElementById('showIPToPublic').value = config.show_ip_to_public || 'false';
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 更新配置
async function updateConfig(key, value) {
    try {
        const response = await fetch(`${API_BASE}/api/admin/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ key, value })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('configAlert', '配置更新成功', 'success');
        } else {
            showAlert('configAlert', data.error || '更新失败', 'danger');
        }
    } catch (error) {
        showAlert('configAlert', '网络错误', 'danger');
    }
}

// 切换API密钥可见性
function toggleAPIKeyVisibility() {
    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
    } else {
        apiKeyInput.type = 'password';
    }
}

// 重新生成API密钥
async function regenerateAPIKey() {
    if (!confirm('确定要重新生成API密钥吗？这将使所有现有的VPS客户端失效！')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/regenerate-api-key`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('apiKey').value = data.apiKey;
            showAlert('configAlert', 'API密钥重新生成成功！请更新所有VPS客户端配置。', 'success');
        } else {
            showAlert('configAlert', data.error || '生成失败', 'danger');
        }
    } catch (error) {
        showAlert('configAlert', '网络错误', 'danger');
    }
}

// 加载节点列表 - 集成动态国旗系统
async function loadNodes() {
    updateDebugInfo('开始加载节点列表...');
    
    try {
        console.log('🔄 开始加载节点列表...');
        
        const response = await fetch(`${API_BASE}/api/admin/nodes`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('📡 API响应状态:', response.status);
        updateDebugInfo(`API响应状态: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const nodes = await response.json();
        console.log('📦 接收到的原始数据:', nodes);
        updateDebugInfo(`接收到 ${nodes.length} 个节点`);
        
        // 分析节点类型
        const placeholderNodes = nodes.filter(n => n.is_placeholder);
        const realNodes = nodes.filter(n => !n.is_placeholder);
        
        console.log(`📊 节点分析:
- 总计: ${nodes.length} 个节点
- 空白节点: ${placeholderNodes.length} 个
- 真实节点: ${realNodes.length} 个`);
        
        updateDebugInfo(`空白节点: ${placeholderNodes.length} 个, 真实节点: ${realNodes.length} 个`);
        
        const tbody = document.getElementById('nodesTableBody');
        
        if (nodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">暂无节点</td></tr>';
            updateDebugInfo('没有找到任何节点');
            return;
        }
        
        // 渲染节点列表 - 使用动态国旗系统
        const nodeRows = await Promise.all(nodes.map(async (node) => {
            console.log(`🔨 渲染节点: ${node.name} (ID: ${node.id}, 空白: ${node.is_placeholder})`);
            console.log(`🏁 国家信息:`, {
                country_code: node.country_code,
                country_name: node.country_name,
                location: node.location,
                ip_address: node.ip_address
            });
            
            const statusClass = `status-${node.connection_status}`;
            const statusText = {
                'online': '在线',
                'warning': '警告',
                'offline': '离线',
                'placeholder': '等待激活'
            }[node.connection_status] || '未知';
            
            // 智能获取国旗HTML
            let flagHtml = '';
            let countryDisplay = '';
            
            if (node.country_code && node.country_code !== 'XX') {
                // 有有效的国家代码，直接使用
                flagHtml = await createSmartFlag(node.country_code, node.country_name, 20);
                countryDisplay = node.country_name || node.country_code;
                console.log(`🏁 节点 ${node.name} 使用已有国家代码: ${node.country_code} -> ${countryDisplay}`);
            } else if (node.location && node.location !== 'Auto-detect' && node.location !== '待检测') {
                // 动态解析位置信息
                console.log(`🔍 动态解析节点 ${node.name} 位置: ${node.location}`);
                
                try {
                    flagHtml = await createSmartFlag(node.location, null, 20);
                    
                    // 如果位置包含逗号，提取最后一部分作为国家显示
                    if (node.location.includes(',')) {
                        const parts = node.location.split(',').map(part => part.trim());
                        countryDisplay = parts[parts.length - 1];
                    } else {
                        countryDisplay = node.location;
                    }
                    
                    console.log(`✅ 动态解析成功: ${node.location} -> ${countryDisplay}`);
                } catch (error) {
                    console.warn(`⚠️ 动态解析失败: ${error.message}`);
                    flagHtml = '<span class="country-flag flag-default">🌐</span>';
                    countryDisplay = node.location;
                }
            } else {
                // 默认显示
                flagHtml = '<span class="country-flag flag-default">🌐</span>';
                countryDisplay = '待检测';
                console.log(`⚠️ 节点 ${node.name} 使用默认显示`);
            }
            
            let actionsHtml = '';
            if (node.is_placeholder) {
                actionsHtml = `
                    <button class="btn btn-success" onclick="showInstallScript(${node.id}, '${escapeHtml(node.name)}')">📜 安装脚本</button>
                    <button class="btn btn-danger" onclick="deleteNode(${node.id}, '${escapeHtml(node.name)}')">删除</button>
                `;
            } else {
                actionsHtml = `
                    <button class="btn btn-info" onclick="refreshNodeData(${node.id})">🔄 刷新数据</button>
                    <button class="btn btn-danger" onclick="deleteNode(${node.id}, '${escapeHtml(node.name)}')">删除</button>
                `;
            }
            
            const lastSeen = node.last_seen ? new Date(node.last_seen).toLocaleString('zh-CN') : '-';
            const ipAddress = node.ip_address || '-';
            
            const rowClass = node.is_placeholder ? 'placeholder-row' : '';
            
            return `
                <tr class="${rowClass}">
                    <td>${node.id}</td>
                    <td>
                        ${escapeHtml(node.name)}
                        ${node.is_placeholder ? '<br><small style="color: #856404; font-weight: bold;">[空白节点]</small>' : ''}
                    </td>
                    <td id="country-display-${node.id}">
                        ${flagHtml} ${escapeHtml(countryDisplay)}
                    </td>
                    <td>
                        ${escapeHtml(node.location)}
                        <br><small style="color: #666;">${escapeHtml(node.provider)}</small>
                    </td>
                    <td>${escapeHtml(ipAddress)}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${escapeHtml(lastSeen)}</td>
                    <td>${node.total_tests || 0}</td>
                    <td>${actionsHtml}</td>
                </tr>
            `;
        }));
        
        tbody.innerHTML = nodeRows.join('');
        
        console.log('✅ 节点列表渲染完成');
        updateDebugInfo('节点列表渲染完成');
        
        // 显示国旗缓存统计
        if (flagSystem && debugMode) {
            const stats = flagSystem.getCacheStats();
            updateDebugInfo(`国旗缓存更新: ${stats.size} 个条目`);
        }
        
    } catch (error) {
        console.error('❌ 加载节点列表失败:', error);
        updateDebugInfo(`加载失败: ${error.message}`);
        document.getElementById('nodesTableBody').innerHTML = 
            `<tr><td colspan="9" style="text-align: center; color: red;">加载失败: ${error.message}</td></tr>`;
    }
}

// HTML转义函数
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 刷新节点数据
async function refreshNodeData(nodeId) {
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '🔄 刷新中...';
    button.disabled = true;
    
    try {
        console.log(`🔄 手动刷新节点 ${nodeId} 数据`);
        updateDebugInfo(`手动刷新节点 ${nodeId} 数据`);
        
        // 重新加载节点列表
        await loadNodes();
        
        alert('节点数据刷新成功！');
        console.log(`✅ 手动刷新节点 ${nodeId} 成功`);
        
    } catch (error) {
        console.error('刷新节点数据失败:', error);
        updateDebugInfo(`刷新失败: ${error.message}`);
        alert('刷新失败：' + error.message);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

// 显示添加节点模态框
function showAddNodeModal() {
    document.getElementById('addNodeModal').style.display = 'block';
    updateDebugInfo('显示添加节点对话框');
}

// 添加节点 - 保持原有逻辑
document.getElementById('addNodeForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('nodeName').value.trim();
    const location = document.getElementById('nodeLocation').value.trim();
    const provider = document.getElementById('nodeProvider').value.trim();
    
    console.log('🚀 开始创建节点:', { name, location, provider });
    updateDebugInfo(`开始创建节点: ${name}`);
    
    // 只验证节点名称是否为空
    if (!name) {
        alert('节点名称不能为空');
        return;
    }
    
    try {
        const payload = { 
            name, 
            location: location || undefined,
            provider: provider || undefined
        };
        
        console.log('📤 发送请求数据:', payload);
        updateDebugInfo(`请求数据: ${JSON.stringify(payload)}`);
        
        const response = await fetch(`${API_BASE}/api/admin/nodes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        
        console.log('📡 创建节点响应状态:', response.status);
        updateDebugInfo(`创建响应状态: ${response.status}`);
        
        const data = await response.json();
        console.log('📦 创建节点响应数据:', data);
        updateDebugInfo(`响应数据: ${JSON.stringify(data)}`);
        
        if (data.success) {
            closeModal('addNodeModal');
            document.getElementById('addNodeForm').reset();
            
            console.log(`✅ 节点创建成功! ID: ${data.nodeId}`);
            updateDebugInfo(`节点创建成功! ID: ${data.nodeId}`);
            
            // 延迟500ms后重新加载，确保数据库已更新
            setTimeout(() => {
                loadNodes();
            }, 500);
            
            alert(`空白节点 "${name}" 创建成功！\nID: ${data.nodeId}\n现在可以使用一键脚本部署了。`);
        } else {
            console.error('❌ 创建节点失败:', data.error);
            updateDebugInfo(`创建失败: ${data.error}`);
            alert(data.error || '创建失败');
        }
    } catch (error) {
        console.error('❌ 创建节点网络错误:', error);
        updateDebugInfo(`网络错误: ${error.message}`);
        alert('网络错误，请重试: ' + error.message);
    }
});

// 删除节点
async function deleteNode(nodeId, nodeName) {
    if (!confirm(`确定要删除节点 "${nodeName}" 吗？这将同时删除所有相关的测试数据！`)) {
        return;
    }
    
    console.log(`🗑️ 删除节点: ${nodeName} (ID: ${nodeId})`);
    updateDebugInfo(`删除节点: ${nodeName} (ID: ${nodeId})`);
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/nodes/${nodeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ 节点 ${nodeName} 删除成功`);
            updateDebugInfo(`节点删除成功: ${nodeName}`);
            loadNodes();
            alert(`节点 "${nodeName}" 删除成功`);
        } else {
            console.error(`❌ 删除节点失败:`, data.error);
            updateDebugInfo(`删除失败: ${data.error}`);
            alert(data.error || '删除失败');
        }
    } catch (error) {
        console.error('❌ 删除节点网络错误:', error);
        updateDebugInfo(`删除网络错误: ${error.message}`);
        alert('网络错误，请重试');
    }
}

// 显示安装脚本
async function showInstallScript(nodeId, nodeName) {
    console.log(`📜 生成安装脚本: ${nodeName} (ID: ${nodeId})`);
    updateDebugInfo(`生成安装脚本: ${nodeName} (ID: ${nodeId})`);
    
    document.getElementById('scriptModalTitle').textContent = `${nodeName} - 一键安装脚本`;
    document.getElementById('scriptModal').style.display = 'block';
    document.getElementById('installScript').textContent = '正在生成脚本...';
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/nodes/${nodeId}/install-script`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ 安装脚本生成成功');
            updateDebugInfo('安装脚本生成成功');
            document.getElementById('installScript').textContent = data.script;
        } else {
            console.error('❌ 生成脚本失败:', data.error);
            updateDebugInfo(`生成脚本失败: ${data.error}`);
            document.getElementById('installScript').textContent = '生成脚本失败: ' + (data.error || '未知错误');
        }
    } catch (error) {
        console.error('❌ 生成脚本网络错误:', error);
        updateDebugInfo(`生成脚本网络错误: ${error.message}`);
        document.getElementById('installScript').textContent = '网络错误，无法生成脚本';
    }
}

// 复制脚本
function copyScript() {
    const scriptContent = document.getElementById('installScript').textContent;
    navigator.clipboard.writeText(scriptContent).then(() => {
        alert('脚本已复制到剪贴板！');
        updateDebugInfo('脚本已复制到剪贴板');
    }).catch(() => {
        alert('复制失败，请手动选择复制');
        updateDebugInfo('脚本复制失败');
    });
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 点击模态框外部关闭
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// 清除国旗缓存（调试功能）
function clearFlagCache() {
    if (flagSystem) {
        flagSystem.clearCache();
        updateDebugInfo('国旗缓存已清除');
        alert('国旗缓存已清除！下次加载时将重新获取所有国旗信息。');
    }
}

console.log('✅ 动态国旗管理后台系统已加载完成');