/**
 * VPS网络质量监测 - 前台JavaScript（简化静默更新版本）
 * 确保节点正常显示，同时优化刷新体验
 */

let modalChart = null;
let currentNodeId = null;
const API_BASE = window.location.origin;

// 缓存数据，用于比较变化
let lastStatsHash = '';
let lastNodesHash = '';
let isFirstLoad = true;

// 前台的全局错误处理函数
window.handleFlagErrorFrontend = function(imgId, fallbackUrl, title, countryCode) {
    const img = document.getElementById(imgId);
    if (!img) return;
    
    if (img.dataset.fallbackTried) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'country-flag flag-default';
        iconSpan.title = title;
        iconSpan.textContent = '🌐';
        iconSpan.style.cssText = 'font-size: 1.2em; margin-right: 6px; vertical-align: middle;';
        img.parentNode.replaceChild(iconSpan, img);
    } else {
        img.dataset.fallbackTried = 'true';
        img.src = fallbackUrl;
    }
};

// 修复后的国旗图片创建函数
function createFlagImage(countryCode, countryName, size = 20) {
    if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
        return '<span class="country-flag flag-default" title="未知国家">🌐</span>';
    }
    
    const lowerCode = countryCode.toLowerCase();
    const title = (countryName || countryCode.toUpperCase()).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const safeCountryCode = countryCode.toUpperCase().replace(/'/g, '').replace(/"/g, '');
    
    const flagUrl = `https://flagcdn.com/w${size}/${lowerCode}.png`;
    const fallbackUrl = `https://flagpedia.net/data/flags/w${size}/${lowerCode}.png`;
    const uniqueId = `flag_${lowerCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return `<img id="${uniqueId}" src="${flagUrl}" alt="${title}" title="${title}" class="country-flag" style="width: ${size}px; height: ${Math.round(size * 0.75)}px; margin-right: 6px; border-radius: 2px; vertical-align: middle; object-fit: cover;" onerror="handleFlagErrorFrontend('${uniqueId}', '${fallbackUrl}', '${title}', '${safeCountryCode}')" loading="lazy" />`;
}

// 获取国旗HTML
function getCountryFlagHtml(countryCode, countryName) {
    console.log(`🏁 生成国旗: ${countryCode} - ${countryName}`);
    if (countryCode && countryCode !== 'XX') {
        return createFlagImage(countryCode, countryName, 20);
    }
    return '<span class="country-flag flag-default" title="未知国家">🌐</span>';
}

// 根据国家名称获取国家代码
function getCountryCodeFromName(countryName) {
    const simpleMap = {
        'Singapore': 'SG', 'United States': 'US', 'China': 'CN', 'Japan': 'JP',
        'Korea': 'KR', 'South Korea': 'KR', 'Hong Kong': 'HK', 'Taiwan': 'TW',
        'Germany': 'DE', 'United Kingdom': 'GB', 'France': 'FR', 'Canada': 'CA',
        'Australia': 'AU', 'India': 'IN', 'Russia': 'RU', 'Brazil': 'BR',
        'Netherlands': 'NL', 'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK',
        'Finland': 'FI', 'Switzerland': 'CH'
    };
    return simpleMap[countryName] || null;
}

// 生成数据哈希值
function generateHash(data) {
    return JSON.stringify(data).length.toString() + '_' + JSON.stringify(data).slice(0, 100);
}

// 设置模态框
function setupModal() {
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close');
    
    if (!modal || !closeBtn) {
        console.warn('模态框元素未找到');
        return;
    }
    
    closeBtn.onclick = () => closeModal();
    window.onclick = (event) => {
        if (event.target === modal) closeModal();
    };
    
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            closeModal();
        }
    });
    
    const modalIspSelect = document.getElementById('modalIspSelect');
    const modalTimeRange = document.getElementById('modalTimeRange');
    
    if (modalIspSelect) modalIspSelect.addEventListener('change', loadModalChart);
    if (modalTimeRange) modalTimeRange.addEventListener('change', loadModalChart);
}

// 打开模态框
function openChart(nodeId, nodeName) {
    currentNodeId = nodeId;
    const modal = document.getElementById('chartModal');
    const modalTitle = document.getElementById('modalTitle');

    if (!modal || !modalTitle) {
        console.error('模态框元素未找到');
        return;
    }

    modalTitle.textContent = `${nodeName} - 网络延迟趋势图`;
    modal.style.display = 'block';
    loadModalChart();
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('chartModal');
    if (modal) modal.style.display = 'none';
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// 优化的统计信息加载
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        const dataHash = generateHash(data);
        
        // 检查数据是否有变化
        if (!isFirstLoad && dataHash === lastStatsHash) {
            console.log('📊 统计数据无变化，跳过更新');
            return;
        }
        
        lastStatsHash = dataHash;
        console.log('✅ 统计信息更新:', data);

        // 更新DOM元素
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                const newValue = (value ?? 0).toString();
                if (element.textContent !== newValue) {
                    element.textContent = newValue;
                    // 添加简单的更新效果
                    if (!isFirstLoad) {
                        element.style.color = '#28a745';
                        setTimeout(() => { element.style.color = ''; }, 1000);
                    }
                }
            }
        };

        updateElement('totalNodes', data.total_nodes);
        updateElement('onlineNodes', data.online_nodes);
        updateElement('recentTests', data.recent_tests);
        updateElement('monitoredISPs', data.monitored_isps);
        
    } catch (error) {
        console.error('❌ 获取统计信息失败:', error);
        if (isFirstLoad) {
            ['totalNodes', 'onlineNodes', 'recentTests', 'monitoredISPs'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '-';
            });
        }
    }
}

// 获取节点最新数据
async function loadLatestData(nodeId) {
    try {
        const response = await fetch(`${API_BASE}/api/nodes/${nodeId}/latest`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error(`获取节点 ${nodeId} 最新数据失败:`, error);
        return [];
    }
}

// 优化的节点列表加载
async function loadNodes() {
    const container = document.getElementById('nodesContainer');
    
    if (!container) {
        console.error('节点容器元素未找到');
        return;
    }

    try {
        // 只在首次加载时显示加载状态
        if (isFirstLoad) {
            console.log('🔄 首次加载节点列表...');
            container.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    正在加载节点信息...
                </div>
            `;
        } else {
            console.log('🔄 静默更新节点列表...');
        }
        
        const response = await fetch(`${API_BASE}/api/nodes`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const nodes = await response.json();
        if (!Array.isArray(nodes)) throw new Error('API返回的数据格式错误：不是数组');

        // 检查数据是否有变化
        const nodesHash = generateHash(nodes);
        if (!isFirstLoad && nodesHash === lastNodesHash) {
            console.log('🔄 节点数据无变化，跳过更新');
            return;
        }
        
        lastNodesHash = nodesHash;
        console.log(`✅ 节点数据有更新，共 ${nodes.length} 个节点`);

        if (nodes.length === 0) {
            container.innerHTML = '<div class="loading">暂无节点数据</div>';
            return;
        }

        // 确保容器具有正确的CSS类
        container.className = 'nodes-grid';

        // 并行加载节点数据
        const nodePromises = nodes.map(async (node) => {
            try {
                const latestData = await loadLatestData(node.id);
                return createNodeCard(node, latestData);
            } catch (error) {
                console.error(`处理节点 ${node.id} 失败:`, error);
                return createNodeCard(node, []);
            }
        });
        
        const nodeCardsHtml = await Promise.all(nodePromises);
        const finalHtml = nodeCardsHtml.filter(html => html).join('');
        
        // 更新内容
        if (isFirstLoad) {
            container.innerHTML = finalHtml;
        } else {
            // 简单的淡入淡出效果
            container.style.opacity = '0.8';
            setTimeout(() => {
                container.innerHTML = finalHtml;
                container.style.opacity = '1';
            }, 150);
        }
        
    } catch (error) {
        console.error('❌ 获取节点列表失败:', error);
        if (isFirstLoad) {
            container.innerHTML = `<div class="error-message">加载节点信息失败: ${error.message}</div>`;
        }
    }
}

// 创建节点卡片
function createNodeCard(node, latestData) {
    if (!node || !node.id) {
        console.error('无效的节点数据:', node);
        return '';
    }
    
    const statusClass = `status-${node.connection_status || 'offline'}`;
    const statusText = {
        'online': '在线',
        'warning': '警告', 
        'offline': '离线',
        'placeholder': '等待激活'
    }[node.connection_status] || '未知';
    
    // ISP名称映射
    const ispNameMap = {
        'china_mobile': '中国移动',
        'china_telecom': '中国电信',
        'china_unicom': '中国联通'
    };
    
    // 获取国旗
    let flagHtml = '';
    let countryDisplay = '';
    
    if (node.country_code && node.country_code !== 'XX') {
        flagHtml = createFlagImage(node.country_code, node.country_name, 20);
        countryDisplay = node.country_name || node.country_code;
    } else if (node.location && node.location !== 'Auto-detect' && node.location !== '待检测' && node.location !== 'Unknown Location') {
        if (node.location.includes(',')) {
            const parts = node.location.split(',');
            const countryPart = parts[parts.length - 1].trim();
            const detectedCode = getCountryCodeFromName(countryPart);
            
            if (detectedCode) {
                flagHtml = createFlagImage(detectedCode, countryPart, 20);
                countryDisplay = countryPart;
            } else {
                flagHtml = '<span class="country-flag flag-default">🌐</span>';
                countryDisplay = node.location;
            }
        } else {
            flagHtml = '<span class="country-flag flag-default">🌐</span>';
            countryDisplay = node.location;
        }
    } else {
        flagHtml = '<span class="country-flag flag-default">🌐</span>';
        countryDisplay = '未知位置';
    }
    
    // 计算离线时间
    let offlineInfo = '';
    if (node.minutes_since_last_seen !== undefined && node.minutes_since_last_seen !== null) {
        const minutes = Math.round(node.minutes_since_last_seen);
        if (minutes < 60) offlineInfo = `${minutes}分钟前`;
        else if (minutes < 1440) offlineInfo = `${Math.round(minutes/60)}小时前`;
        else offlineInfo = `${Math.round(minutes/1440)}天前`;
    }
    
    // 生成测试结果HTML
    let testResultsHtml = '';
    if (latestData && latestData.length > 0) {
        testResultsHtml = '<div class="test-results">';
        latestData.forEach(result => {
            const latencyClass = getLatencyClass(result.avg_latency);
            const displayName = ispNameMap[result.isp_name] || result.isp_name;
            testResultsHtml += `
                <div class="test-item">
                    <span class="test-label">${escapeHtml(displayName)}</span>
                    <span class="test-value ${latencyClass}">
                        ${result.avg_latency ? result.avg_latency.toFixed(1) + 'ms' : 'N/A'}
                        ${result.packet_loss ? `(${result.packet_loss.toFixed(1)}% 丢包)` : ''}
                    </span>
                </div>
            `;
        });
        testResultsHtml += '</div>';
    } else {
        testResultsHtml = '<div class="test-results"><div class="test-item">暂无测试数据</div></div>';
    }
    
    // 位置和提供商信息
    const locationDisplay = node.city && node.country_name ? 
        `${node.city}, ${node.country_name}` : (node.location || '未知位置');
    
    let providerDisplay = '未知提供商';
    if (node.isp && node.isp !== 'Unknown ISP') {
        providerDisplay = node.isp;
    } else if (node.provider && node.provider !== 'Auto-detect' && node.provider !== '待检测') {
        providerDisplay = node.provider;
    }
    
    // 最后在线时间
    let lastSeenDisplay = '-';
    try {
        if (node.last_seen) {
            lastSeenDisplay = new Date(node.last_seen).toLocaleString('zh-CN');
        }
    } catch (error) {
        console.warn('解析最后在线时间失败:', node.last_seen);
    }
    
    return `
        <div class="node-card" data-node-id="${node.id}">
            <div class="node-header">
                <div>
                    <div class="node-name">
                        ${flagHtml}
                        ${escapeHtml(node.name)}
                    </div>
                    <div class="node-location">${escapeHtml(countryDisplay)}</div>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="node-details">
                <div>位置: ${escapeHtml(locationDisplay)}</div>
                <div>提供商: ${escapeHtml(providerDisplay)}</div>
                ${node.ip_address ? `<div>IP: ${escapeHtml(node.ip_address)}</div>` : ''}
                <div>最后在线: ${escapeHtml(lastSeenDisplay)} ${offlineInfo ? `(${offlineInfo})` : ''}</div>
            </div>
            ${testResultsHtml}
            <button class="chart-button" onclick="openChart(${node.id}, '${escapeHtml(node.name).replace(/'/g, "\\'")}')">
                📊 查看延迟趋势图
            </button>
        </div>
    `;
}

// HTML转义函数
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 根据延迟获取样式类
function getLatencyClass(latency) {
    if (!latency || isNaN(latency)) return '';
    if (latency < 100) return 'latency-good';
    if (latency < 200) return 'latency-warning';
    return 'latency-bad';
}

// 加载模态框图表数据
async function loadModalChart() {
    if (!currentNodeId) return;

    const modalIspSelect = document.getElementById('modalIspSelect');
    const modalTimeRange = document.getElementById('modalTimeRange');
    
    if (!modalIspSelect || !modalTimeRange) {
        console.error('模态框控件元素未找到');
        return;
    }

    const ispName = modalIspSelect.value;
    const timeRange = modalTimeRange.value;

    try {
        const response = await fetch(`${API_BASE}/api/chart-data/${currentNodeId}/${ispName}?timeRange=${timeRange}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        updateModalChart(data);
    } catch (error) {
        console.error('获取图表数据失败:', error);
    }
}

// 更新模态框图表
function updateModalChart(data) {
    const ctx = document.getElementById('modalChart');
    if (!ctx) {
        console.error('图表画布元素未找到');
        return;
    }

    if (modalChart) modalChart.destroy();

    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js 未加载');
            return;
        }

        modalChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Ping延迟 (ms)',
                    data: (data.ping || []).map(p => p.y),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true,
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                const dataPoint = data.ping?.[context.dataIndex];
                                if (dataPoint && dataPoint.packetLoss !== undefined) {
                                    return `丢包率: ${dataPoint.packetLoss.toFixed(1)}%`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '延迟 (ms)' },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    x: {
                        title: { display: true, text: '时间' },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    }
                },
                interaction: { intersect: false, mode: 'index' },
                elements: { line: { borderWidth: 3 } }
            }
        });
    } catch (error) {
        console.error('创建图表失败:', error);
    }
}

// 手动刷新功能
function manualRefresh() {
    console.log('🔄 用户手动刷新...');
    lastStatsHash = '';
    lastNodesHash = '';
    const wasFirstLoad = isFirstLoad;
    isFirstLoad = true;
    
    loadStats();
    loadNodes();
    
    setTimeout(() => {
        isFirstLoad = wasFirstLoad;
    }, 2000);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 页面初始化开始...');
    
    // 检查必要元素
    const requiredElements = ['totalNodes', 'onlineNodes', 'recentTests', 'monitoredISPs', 'nodesContainer'];
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    
    if (missingElements.length > 0) {
        console.error('❌ 缺少必要的DOM元素:', missingElements);
        return;
    }
    
    // 初始化
    loadStats();
    loadNodes();
    setupModal();
    
    // 绑定手动刷新按钮
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', manualRefresh);
    }
    
    console.log('✅ 页面初始化完成');
    
    // 切换到静默更新模式
    setTimeout(() => {
        isFirstLoad = false;
        console.log('🎯 切换到静默更新模式');
    }, 3000);
    
    // 定时静默刷新
    setInterval(() => {
        console.log('🔄 静默刷新统计信息...');
        loadStats();
    }, 30000);  // 30秒
    
    setInterval(() => {
        console.log('🔄 静默刷新节点列表...');
        loadNodes(); 
    }, 60000);  // 60秒
});