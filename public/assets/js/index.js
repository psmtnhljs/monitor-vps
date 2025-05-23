/**
 * VPS网络质量监测 - 前台JavaScript
 */

let modalChart = null;
let currentNodeId = null;
const API_BASE = window.location.origin;

// 将国家代码转换为国旗emoji
function countryCodeToFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return '🌐'; // 默认地球图标
    }
    
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
}

// 设置模态框
function setupModal() {
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close');
    
    // 点击关闭按钮
    closeBtn.onclick = () => closeModal();
    
    // 点击模态框外部关闭
    window.onclick = (event) => {
        if (event.target === modal) closeModal();
    };
    
    // ESC键关闭
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            closeModal();
        }
    });
    
    // 绑定控件事件
    document.getElementById('modalIspSelect').addEventListener('change', loadModalChart);
    document.getElementById('modalTimeRange').addEventListener('change', loadModalChart);
}

// 打开模态框
function openChart(nodeId, nodeName) {
    currentNodeId = nodeId;
    const modal = document.getElementById('chartModal');
    const modalTitle = document.getElementById('modalTitle');

    modalTitle.textContent = `${nodeName} - 网络延迟趋势图`;
    modal.style.display = 'block';
    loadModalChart();
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('chartModal');
    modal.style.display = 'none';
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        document.getElementById('totalNodes').textContent = data.total_nodes ?? 0;
        document.getElementById('onlineNodes').textContent = data.online_nodes ?? 0;
        document.getElementById('recentTests').textContent = data.recent_tests ?? 0;
        document.getElementById('monitoredISPs').textContent = data.monitored_isps ?? 0;
    } catch (error) {
        console.error('获取统计信息失败:', error);
    }
}

// 加载节点列表
async function loadNodes() {
    const container = document.getElementById('nodesContainer');

    try {
        const response = await fetch(`${API_BASE}/api/nodes`);
        if (!response.ok) throw new Error('Network response was not ok');
        const nodes = await response.json();

        if (nodes.length === 0) {
            container.innerHTML = '<div class="loading">暂无节点数据</div>';
            return;
        }

        container.innerHTML = '';

        for (const node of nodes) {
            const latestData = await loadLatestData(node.id);
            const nodeCard = createNodeCard(node, latestData);
            container.appendChild(nodeCard);
        }
    } catch (error) {
        console.error('获取节点列表失败:', error);
        container.innerHTML = '<div class="error-message">加载节点信息失败</div>';
    }
}

// 获取节点最新数据
async function loadLatestData(nodeId) {
    try {
        const response = await fetch(`${API_BASE}/api/nodes/${nodeId}/latest`);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error(`获取节点 ${nodeId} 最新数据失败:`, error);
        return [];
    }
}

// 创建节点卡片
function createNodeCard(node, latestData) {
    const card = document.createElement('div');
    card.className = 'node-card';
    
    const statusClass = `status-${node.connection_status}`;
    const statusText = {
        'online': '在线',
        'warning': '警告',
        'offline': '离线'
    }[node.connection_status] || '未知';
    
    // ISP名称映射
    const ispNameMap = {
        'china_mobile': '中国移动',
        'china_telecom': '中国电信',
        'china_unicom': '中国联通'
    };
    
    // 获取国旗
    const flag = countryCodeToFlag(node.country_code);
    
    // 计算离线时间
    let offlineInfo = '';
    if (node.minutes_since_last_seen !== undefined) {
        const minutes = Math.round(node.minutes_since_last_seen);
        if (minutes < 60) {
            offlineInfo = `${minutes}分钟前`;
        } else if (minutes < 1440) {
            offlineInfo = `${Math.round(minutes/60)}小时前`;
        } else {
            offlineInfo = `${Math.round(minutes/1440)}天前`;
        }
    }
    
    let testResultsHtml = '';
    if (latestData?.length > 0) {
        testResultsHtml = '<div class="test-results">';
        latestData.forEach(result => {
            const latencyClass = getLatencyClass(result.avg_latency);
            const displayName = ispNameMap[result.isp_name] || result.isp_name;
            testResultsHtml += `
                <div class="test-item">
                    <span class="test-label">${displayName}</span>
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
    
    // 显示位置信息
    const locationDisplay = node.city && node.country_name ? 
        `${node.city}, ${node.country_name}` : 
        (node.location || '未知位置');
    
    // 显示提供商信息（如果不是Auto-detect的话）
    const providerDisplay = (node.provider && node.provider !== 'Auto-detect') ? 
        ` - ${node.provider}` : 
        (node.isp ? ` - ${node.isp}` : '');
    
    card.innerHTML = `
        <div class="node-header">
            <div>
                <div class="node-name">
                    <span class="country-flag">${flag}</span>
                    ${node.name}
                </div>
                <div class="node-location">${locationDisplay}${providerDisplay}</div>
            </div>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="node-details">
            ${node.ip_address ? `<div>IP: ${node.ip_address}</div>` : ''}
            <div>最后在线: ${new Date(node.last_seen).toLocaleString('zh-CN')} ${offlineInfo ? `(${offlineInfo})` : ''}</div>
        </div>
        ${testResultsHtml}
        <button class="chart-button" onclick="openChart(${node.id}, '${node.name.replace(/'/g, "\\'")}')" aria-label="查看 ${node.name} 的延迟趋势图">
            📊 查看延迟趋势图
        </button>
    `;
    
    return card;
}

// 根据延迟获取样式类
function getLatencyClass(latency) {
    if (!latency) return '';
    if (latency < 100) return 'latency-good';
    if (latency < 200) return 'latency-warning';
    return 'latency-bad';
}

// 加载模态框图表数据
async function loadModalChart() {
    if (!currentNodeId) return;

    const ispName = document.getElementById('modalIspSelect').value;
    const timeRange = document.getElementById('modalTimeRange').value;

    try {
        const response = await fetch(`${API_BASE}/api/chart-data/${currentNodeId}/${ispName}?timeRange=${timeRange}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        updateModalChart(data);
    } catch (error) {
        console.error('获取图表数据失败:', error);
    }
}

// 更新模态框图表
function updateModalChart(data) {
    const ctx = document.getElementById('modalChart').getContext('2d');

    if (modalChart) {
        modalChart.destroy();
    }

    modalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Ping延迟 (ms)',
                    data: data.ping.map(p => p.y),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true,
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const dataPoint = data.ping[context.dataIndex];
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
                    title: {
                        display: true,
                        text: '延迟 (ms)'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '时间'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                line: {
                    borderWidth: 3
                }
            }
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadNodes();
    setupModal();
    
    // 定时刷新
    setInterval(loadStats, 30000);  // 30秒刷新统计
    setInterval(loadNodes, 60000);  // 60秒刷新节点
});