/**
 * VPS网络质量监测 - 管理后台JavaScript（国旗模块集成版）
 */

let authToken = localStorage.getItem('adminToken');
const API_BASE = window.location.origin;
let debugMode = false;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
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

/**
 * 获取国旗HTML - 使用国旗模块
 * 替换原来的 countryCodeToFlag 函数
 */
function getCountryFlagHtml(countryCode, countryName) {
    // 检查国旗模块是否可用
    if (typeof flagManager === 'undefined') {
        console.warn('国旗模块未加载，使用默认显示');
        return '🌐';
    }
    
    // 使用国旗模块生成HTML
    if (countryCode && countryCode !== 'XX') {
        return flagManager.getFlagHtml(countryCode, countryName, {
            className: 'country-flag',
            enableHover: true,
            showTooltip: true
        });
    }
    
    // 默认显示
    return '<span class="country-flag flag-default" title="未知国家"></span>';
}

/**
 * 根据国家名称获取国家代码 - 使用国旗模块
 */
function getCountryCodeFromName(countryName) {
    // 检查国旗模块是否可用
    if (typeof countryMapper !== 'undefined') {
        return countryMapper.getCountryCode(countryName);
    }
    
    // 降级到简单映射
    const simpleMap = {
        'Singapore': 'SG',
        'United States': 'US',
        'China': 'CN',
        'Japan': 'JP',
        'Korea': 'KR',
        'Hong Kong': 'HK',
        'Taiwan': 'TW',
        'Germany': 'DE',
        'United Kingdom': 'GB',
        'France': 'FR',
        'Canada': 'CA',
        'Australia': 'AU'
    };
    
    return simpleMap[countryName] || null;
}

// 加载节点列表 - 增强调试版本
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
        
        if (placeholderNodes.length > 0) {
            console.log('🔍 空白节点详情:', placeholderNodes);
            placeholderNodes.forEach(node => {
                updateDebugInfo(`空白节点: ID${node.id} - ${node.name} (${node.connection_status})`);
            });
        }
        
        const tbody = document.getElementById('nodesTableBody');
        
        if (nodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">暂无节点</td></tr>';
            updateDebugInfo('没有找到任何节点');
            return;
        }
        
        // 渲染节点列表 - 使用国旗模块
        tbody.innerHTML = nodes.map(node => {
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
            
            // 获取国旗HTML - 使用新的国旗模块
            let flagHtml = '';
            let countryDisplay = '';
            
            if (node.country_code && node.country_code !== 'XX') {
                // 有有效的国家代码，使用国旗模块
                flagHtml = getCountryFlagHtml(node.country_code, node.country_name);
                countryDisplay = node.country_name || node.country_code;
                console.log(`🏁 节点 ${node.name} 使用国旗模块: ${node.country_code} -> ${countryDisplay}`);
            } else if (node.ip_address && !node.is_placeholder) {
                // 没有国家代码但有IP地址，尝试自动检测
                flagHtml = '<span class="country-flag flag-loading" title="正在检测..."></span>';
                countryDisplay = '检测中...';
                
                // 异步检测国旗（不阻塞渲染）
                setTimeout(() => {
                    autoDetectAndUpdateFlag(node.id, node.ip_address);
                }, 100);
                
                console.log(`🔍 节点 ${node.name} 将自动检测国旗: IP ${node.ip_address}`);
            } else {
                // 默认显示
                flagHtml = '<span class="country-flag flag-default" title="未知国家"></span>';
                
                // 尝试从location字段解析
                if (node.location && node.location !== 'Auto-detect' && node.location !== '待检测') {
                    countryDisplay = node.location;
                    
                    // 尝试从位置信息中提取国家代码
                    if (node.location.includes(',')) {
                        const parts = node.location.split(',');
                        const countryPart = parts[parts.length - 1].trim();
                        const detectedCode = getCountryCodeFromName(countryPart);
                        
                        if (detectedCode) {
                            flagHtml = getCountryFlagHtml(detectedCode, countryPart);
                            console.log(`🔍 从位置信息解析出国旗: ${countryPart} -> ${detectedCode}`);
                        }
                    }
                } else {
                    countryDisplay = '未知位置';
                }
                
                console.log(`⚠️ 节点 ${node.name} 使用默认显示: ${countryDisplay}`);
            }
            
            // 处理位置和提供商显示
            const locationDisplay = node.city && node.country_name ? 
                `${node.city}, ${node.country_name}` : 
                (node.location || '未知位置');
            
            const providerDisplay = (node.provider && node.provider !== 'Auto-detect') ? 
                node.provider : 
                (node.isp || '未知提供商');
            
            let actionsHtml = '';
            if (node.is_placeholder) {
                actionsHtml = `
                    <button class="btn btn-success" onclick="showInstallScript(${node.id}, '${node.name.replace(/'/g, "\\'")}')">📜 安装脚本</button>
                    <button class="btn btn-danger" onclick="deleteNode(${node.id}, '${node.name.replace(/'/g, "\\'")}')">删除</button>
                `;
            } else {
                actionsHtml = `
                    <button class="btn btn-info" onclick="refreshNodeFlag(${node.id})">🔄 刷新国旗</button>
                    <button class="btn btn-danger" onclick="deleteNode(${node.id}, '${node.name.replace(/'/g, "\\'")}')">删除</button>
                `;
            }
            
            const lastSeen = node.last_seen ? new Date(node.last_seen).toLocaleString('zh-CN') : '-';
            const ipAddress = node.ip_address || '-';
            
            const rowClass = node.is_placeholder ? 'placeholder-row' : '';
            
            return `
                <tr class="${rowClass}">
                    <td>${node.id}</td>
                    <td>
                        ${node.name}
                        ${node.is_placeholder ? '<br><small style="color: #856404; font-weight: bold;">[空白节点]</small>' : ''}
                    </td>
                    <td id="country-display-${node.id}" data-country-code="${node.country_code || ''}" data-country-name="${node.country_name || ''}">
                        ${flagHtml} ${countryDisplay}
                    </td>
                    <td>
                        ${locationDisplay}
                        <br><small style="color: #666;">${providerDisplay}</small>
                    </td>
                    <td>${ipAddress}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${lastSeen}</td>
                    <td>${node.total_tests || 0}</td>
                    <td>${actionsHtml}</td>
                </tr>
            `;
        }).join('');
        
        console.log('✅ 节点列表渲染完成');
        updateDebugInfo('节点列表渲染完成');
        
    } catch (error) {
        console.error('❌ 加载节点列表失败:', error);
        updateDebugInfo(`加载失败: ${error.message}`);
        document.getElementById('nodesTableBody').innerHTML = 
            `<tr><td colspan="9" style="text-align: center; color: red;">加载失败: ${error.message}</td></tr>`;
    }
}

/**
 * 自动检测并更新节点国旗
 */
async function autoDetectAndUpdateFlag(nodeId, ipAddress) {
    if (typeof flagManager === 'undefined') {
        console.warn('国旗模块未加载，无法自动检测');
        return;
    }
    
    const elementId = `country-display-${nodeId}`;
    const element = document.getElementById(elementId);
    
    if (!element) {
        console.warn(`元素不存在: ${elementId}`);
        return;
    }
    
    try {
        console.log(`🔍 自动检测节点 ${nodeId} 的国旗 (IP: ${ipAddress})`);
        
        const result = await flagManager.autoDetectAndShowFlag(ipAddress, elementId, {
            className: 'country-flag',
            enableHover: true,
            showTooltip: true
        });
        
        if (result) {
            console.log(`✅ 节点 ${nodeId} 国旗检测成功:`, result);
            updateDebugInfo(`节点 ${nodeId} 检测到: ${result.country_name} (${result.country_code})`);
        } else {
            console.log(`❌ 节点 ${nodeId} 国旗检测失败`);
            updateDebugInfo(`节点 ${nodeId} 检测失败`);
        }
    } catch (error) {
        console.error(`❌ 节点 ${nodeId} 自动检测出错:`, error);
        updateDebugInfo(`节点 ${nodeId} 检测出错: ${error.message}`);
    }
}

/**
 * 手动刷新节点国旗
 */
async function refreshNodeFlag(nodeId) {
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '🔄 检测中...';
    button.disabled = true;
    
    try {
        // 重新加载节点列表以获取最新的IP信息
        const response = await fetch(`${API_BASE}/api/admin/nodes`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const nodes = await response.json();
        const node = nodes.find(n => n.id === nodeId);
        
        if (!node || !node.ip_address) {
            alert('无法刷新：节点无IP地址信息');
            return;
        }
        
        // 使用国旗模块检测
        const result = await flagManager.autoDetectAndShowFlag(
            node.ip_address, 
            `country-display-${nodeId}`,
            {
                className: 'country-flag',
                enableHover: true,
                showTooltip: true
            }
        );
        
        if (result) {
            alert(`节点国旗刷新成功：${result.country_name}`);
            console.log(`✅ 手动刷新节点 ${nodeId} 成功:`, result);
        } else {
            alert('无法检测到有效的地理位置信息');
        }
        
    } catch (error) {
        console.error('刷新节点国旗失败:', error);
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

// 添加节点
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