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

// 智能国旗创建函数 - 集成动态系统
async function createSmartFlag(locationOrCountry, countryName, size = 20) {
    // 如果动态系统可用，使用动态系统
    if (flagSystem) {
        try {
            let countryCode = null;
            let finalCountryName = countryName;

            // 1. 如果已经是有效的国家代码
            if (locationOrCountry && locationOrCountry.length === 2 && /^[A-Z]{2}$/i.test(locationOrCountry)) {
                countryCode = locationOrCountry.toUpperCase();
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
                    }
                } else {
                    // 直接查询国家名
                    countryCode = await flagSystem.getCountryCode(locationOrCountry);
                    finalCountryName = finalCountryName || locationOrCountry;
                }
            }

            // 3. 生成国旗HTML
            if (countryCode && countryCode !== 'XX') {
                return await createFlagImageWithFallback(countryCode, finalCountryName, size);
            }
        } catch (error) {
            console.warn('动态国旗生成失败，使用fallback:', error);
        }
    }

    // Fallback: 使用基础映射
    const basicCountryCode = getBasicCountryCode(locationOrCountry);
    if (basicCountryCode) {
        return await createFlagImageWithFallback(basicCountryCode, countryName || locationOrCountry, size);
    }

    // 最终fallback: 默认图标
    return '<span class="country-flag flag-default" title="未知国家">🌐</span>';
}

// 创建带有多重fallback的国旗图片
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
    
    return `<img id="${uniqueId}" src="${flagSources[0]}" alt="${title}" title="${title}" class="country-flag" style="width: ${size}px; height: ${Math.round(size * 0.75)}px; margin-right: 6px; border-radius: 2px; vertical-align: middle; object-fit: cover;" onerror="handleSmartFlagError('${uniqueId}', ${JSON.stringify(flagSources)}, '${title}', '${safeCountryCode}')" loading="lazy" />`;
}

// 智能国旗错误处理
window.handleSmartFlagError = function(imgId, flagSources, title, countryCode) {
    const img = document.getElementById(imgId);
    if (!img) return;
    
    const currentSrc = img.src;
    const currentIndex = flagSources.findIndex(src => currentSrc.includes(src.split('/').pop().split('.')[0]));
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < flagSources.length && nextIndex >= 0) {
        console.log(`🔄 尝试备用国旗源: ${flagSources[nextIndex]}`);
        img.src = flagSources[nextIndex];
    } else {
        // 所有源都失败，显示文本
        const textSpan = document.createElement('span');
        textSpan.className = 'country-flag flag-text';
        textSpan.title = title;
        textSpan.textContent = `[${countryCode}]`;
        textSpan.style.cssText = 'background: #f0f0f0; color: #666; padding: 2px 4px; font-size: 0.7em; font-weight: bold; border-radius: 2px; font-family: monospace; margin-right: 6px;';
        
        img.parentNode.replaceChild(textSpan, img);
    }
};

// 基础国家代码映射（仅作为fallback）
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