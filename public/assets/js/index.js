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
// 修复的loadModalChart函数，增加更多调试信息
async function loadModalChart() {
    if (!currentNodeId) {
        console.error('❌ currentNodeId 未设置');
        return;
    }

    const modalIspSelect = document.getElementById('modalIspSelect');
    const modalTimeRange = document.getElementById('modalTimeRange');
    
    if (!modalIspSelect || !modalTimeRange) {
        console.error('❌ 模态框控件元素未找到');
        return;
    }

    const ispName = modalIspSelect.value;
    const timeRange = modalTimeRange.value;
    
    console.log(`🔄 加载图表数据开始`);
    console.log(`   节点ID: ${currentNodeId}`);
    console.log(`   ISP: ${ispName}`);
    console.log(`   时间范围: ${timeRange}`);

    // 显示加载状态
    const chartContainer = document.querySelector('.chart-container-modal');
    if (chartContainer) {
        chartContainer.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #666;">
                <div style="text-align: center;">
                    <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                    <div>正在加载图表数据...</div>
                </div>
            </div>
        `;
    }

    try {
        const url = `${API_BASE}/api/chart-data/${currentNodeId}/${ispName}?timeRange=${timeRange}`;
        console.log(`📡 请求URL: ${url}`);
        
        const response = await fetch(url);
        console.log(`📡 响应状态: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HTTP错误: ${response.status} - ${errorText}`);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();
        console.log(`📦 原始响应内容:`, responseText.substring(0, 500) + '...');
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON解析失败:', parseError);
            console.error('响应内容:', responseText);
            throw new Error('服务器返回的不是有效的JSON数据');
        }
        
        console.log('📦 解析后的数据:', data);
        
        // 详细数据验证
        if (!data) {
            throw new Error('服务器返回空数据');
        }
        
        if (!data.ping || !Array.isArray(data.ping)) {
            console.warn('⚠️ ping数据异常，尝试修复...');
            data.ping = data.ping || [];
        }
        
        if (!data.labels || !Array.isArray(data.labels)) {
            console.warn('⚠️ labels数据异常，尝试修复...');
            data.labels = data.labels || [];
        }
        
        console.log(`✅ 数据验证通过:`);
        console.log(`   - ping数据: ${data.ping.length} 个点`);
        console.log(`   - labels: ${data.labels.length} 个标签`);
        console.log(`   - 第一个数据点:`, data.ping[0]);
        console.log(`   - 最后一个数据点:`, data.ping[data.ping.length - 1]);
        
        // 重新创建canvas元素
        if (chartContainer) {
            chartContainer.innerHTML = '<canvas id="modalChart" style="width: 100%; height: 100%;"></canvas>';
        }
        
        // 等待DOM更新
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 渲染图表
        updateModalChart(data);
        
    } catch (error) {
        console.error('❌ 获取图表数据失败:', error);
        console.error('错误详情:', error.stack);
        
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #dc3545; text-align: center;">
                    <div>
                        <div style="font-size: 32px; margin-bottom: 15px;">⚠️</div>
                        <div style="font-weight: bold; margin-bottom: 10px; font-size: 1.1em;">加载图表数据失败</div>
                        <div style="font-size: 0.9em; color: #666; margin-bottom: 20px; max-width: 300px;">${error.message}</div>
                        <button onclick="loadModalChart()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1em;">
                            🔄 重新加载
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

// 修复图表显示问题的版本
function updateModalChart(data) {
    const ctx = document.getElementById('modalChart');
    if (!ctx) {
        console.error('图表画布元素未找到');
        return;
    }

    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }

    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js 未加载');
            return;
        }

        console.log('📊 开始渲染图表，原始数据:', data);

        // 检查数据有效性
        if (!data || !data.ping || !Array.isArray(data.ping)) {
            console.error('图表数据格式无效:', data);
            return;
        }

        const dataPointCount = data.ping.length;
        const aggregateInfo = data.aggregateInfo || {};
        
        console.log(`   数据点数量: ${dataPointCount}`);
        console.log(`   标签数量: ${data.labels ? data.labels.length : 0}`);
        console.log(`   聚合信息:`, aggregateInfo);

        // 检查每个数据点的结构
        console.log('   前3个数据点详情:', data.ping.slice(0, 3));

        // 根据数据点数量调整显示
        let pointRadius = dataPointCount > 100 ? 1 : dataPointCount > 50 ? 2 : 4;
        let pointHoverRadius = pointRadius + 2;
        let borderWidth = dataPointCount > 100 ? 2 : 3;
        let tension = dataPointCount > 100 ? 0.4 : 0.1;

        // 准备标签和数据
        let chartLabels = [];
        let chartData = [];

        if (data.labels && data.labels.length > 0) {
            // 使用提供的标签
            chartLabels = data.labels;
            chartData = data.ping.map(point => {
                if (typeof point === 'object' && point.y !== undefined) {
                    return point.y;
                } else if (typeof point === 'number') {
                    return point;
                } else {
                    console.warn('无效数据点:', point);
                    return 0;
                }
            });
        } else {
            // 从数据点生成标签
            data.ping.forEach((point, index) => {
                if (typeof point === 'object') {
                    chartLabels.push(point.x || `点${index + 1}`);
                    chartData.push(point.y || 0);
                } else {
                    chartLabels.push(`点${index + 1}`);
                    chartData.push(point || 0);
                }
            });
        }

        console.log('   处理后的标签:', chartLabels.slice(0, 5), '...(共' + chartLabels.length + '个)');
        console.log('   处理后的数据:', chartData.slice(0, 5), '...(共' + chartData.length + '个)');

        // 确保标签和数据数量匹配
        const minLength = Math.min(chartLabels.length, chartData.length);
        chartLabels = chartLabels.slice(0, minLength);
        chartData = chartData.slice(0, minLength);

        console.log(`   最终数据点: ${chartData.length} 个, 标签: ${chartLabels.length} 个`);

        // 创建图表
        modalChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: `Ping延迟 (${aggregateInfo.interval || 'ms'})`,
                    data: chartData,
                    borderColor: '#4BC0C0',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: borderWidth,
                    tension: tension,
                    fill: true,
                    pointBackgroundColor: '#4BC0C0',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: pointRadius,
                    pointHoverRadius: pointHoverRadius,
                    pointHoverBackgroundColor: '#4BC0C0',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: !!aggregateInfo.interval,
                        text: aggregateInfo.interval ? 
                            `数据聚合: ${aggregateInfo.interval} (${dataPointCount} 个数据点)` : 
                            `延迟趋势图 (${dataPointCount} 个数据点)`,
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        padding: {
                            top: 10,
                            bottom: 30
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#4BC0C0',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                const dataIndex = context[0].dataIndex;
                                const dataPoint = data.ping[dataIndex];
                                if (dataPoint && typeof dataPoint === 'object' && dataPoint.time) {
                                    try {
                                        const time = new Date(dataPoint.time);
                                        return time.toLocaleString('zh-CN');
                                    } catch (e) {
                                        return context[0].label;
                                    }
                                }
                                return context[0].label;
                            },
                            label: function(context) {
                                const dataIndex = context.dataIndex;
                                const dataPoint = data.ping[dataIndex];
                                
                                let tooltipLines = [`延迟: ${context.parsed.y.toFixed(1)}ms`];
                                
                                if (dataPoint && typeof dataPoint === 'object') {
                                    if (dataPoint.packetLoss !== undefined && dataPoint.packetLoss !== null) {
                                        tooltipLines.push(`丢包率: ${dataPoint.packetLoss.toFixed(1)}%`);
                                    }
                                    
                                    if (dataPoint.isAggregated && dataPoint.sampleCount) {
                                        tooltipLines.push(`样本数: ${dataPoint.sampleCount}`);
                                        if (dataPoint.minLatency !== undefined && dataPoint.maxLatency !== undefined) {
                                            tooltipLines.push(`范围: ${dataPoint.minLatency.toFixed(1)}ms - ${dataPoint.maxLatency.toFixed(1)}ms`);
                                        }
                                    }
                                }
                                
                                return tooltipLines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: aggregateInfo.interval ? `时间 (${aggregateInfo.interval})` : '时间',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                        },
                        ticks: {
                            font: {
                                size: 10
                            },
                            maxTicksLimit: 15,
                            autoSkip: true,
                            maxRotation: 45
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '延迟 (ms)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                        },
                        ticks: {
                            font: {
                                size: 10
                            },
                            callback: function(value) {
                                return value.toFixed(0) + 'ms';
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        hoverBorderWidth: 3
                    },
                    line: {
                        borderJoinStyle: 'round'
                    }
                },
                animation: {
                    duration: dataPointCount > 100 ? 0 : 750,
                    easing: 'easeInOutQuart'
                }
            }
        });
        
        console.log(`✅ 图表创建成功!`);
        console.log('   Chart.js 实例:', modalChart);
        console.log('   数据集:', modalChart.data.datasets[0]);
        
        // 强制重绘
        setTimeout(() => {
            if (modalChart) {
                modalChart.update('none');
                console.log('🔄 图表已强制更新');
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ 创建图表失败:', error);
        console.error('错误堆栈:', error.stack);
        
        // 显示错误信息
        const chartContainer = document.querySelector('.chart-container-modal');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #dc3545; text-align: center;">
                    <div>
                        <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                        <div style="font-weight: bold; margin-bottom: 5px;">图表渲染失败</div>
                        <div style="font-size: 0.9em; color: #666; margin-bottom: 15px;">${error.message}</div>
                        <button onclick="loadModalChart()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            重新加载
                        </button>
                    </div>
                </div>
            `;
        }
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