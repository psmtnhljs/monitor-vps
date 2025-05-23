const express = require('express');
const { db } = require('../config/database');
const { authenticateAPIKey } = require('../middleware/auth');

const router = express.Router();

// 注册VPS节点
router.post('/nodes/register', authenticateAPIKey, (req, res) => {
    const { name, location, provider, ip_address } = req.body;
    
    if (!name || !location || !provider || !ip_address) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    // 获取客户端真实IP
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     ip_address;

    const cleanIP = clientIP.replace(/^::ffff:/, '');

    // 检查是否为占位符节点
    db.get(
        'SELECT id, is_placeholder FROM vps_nodes WHERE name = ?',
        [name],
        (err, existingNode) => {
            if (err) {
                console.error('检查节点失败:', err);
                return res.status(500).json({ error: '注册失败' });
            }

            if (existingNode && existingNode.is_placeholder) {
                // 更新占位符节点为真实节点
                const updateStmt = db.prepare(`
                    UPDATE vps_nodes 
                    SET ip_address = ?, last_seen = CURRENT_TIMESTAMP, status = 1, is_placeholder = 0
                    WHERE id = ?
                `);

                updateStmt.run([cleanIP, existingNode.id], function(err) {
                    if (err) {
                        console.error('更新占位符节点失败:', err);
                        return res.status(500).json({ error: '更新失败' });
                    }
                    
                    console.log(`占位符节点激活成功: ${name} (${cleanIP})`);
                    
                    res.json({
                        success: true,
                        node_id: existingNode.id,
                        message: '节点激活成功',
                        updated: true,
                        detected_ip: cleanIP
                    });
                });
                
                updateStmt.finalize();
            } else if (existingNode) {
                // 更新现有真实节点
                const updateStmt = db.prepare(`
                    UPDATE vps_nodes 
                    SET location = ?, provider = ?, ip_address = ?, last_seen = CURRENT_TIMESTAMP, status = 1
                    WHERE id = ?
                `);

                updateStmt.run([location, provider, cleanIP, existingNode.id], function(err) {
                    if (err) {
                        console.error('更新节点失败:', err);
                        return res.status(500).json({ error: '更新失败' });
                    }
                    
                    res.json({
                        success: true,
                        node_id: existingNode.id,
                        message: '节点信息已更新',
                        updated: true,
                        detected_ip: cleanIP
                    });
                });
                
                updateStmt.finalize();
            } else {
                // 创建新节点
                const stmt = db.prepare(`
                    INSERT INTO vps_nodes (name, location, provider, ip_address, last_seen, status, is_placeholder)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0)
                `);

                stmt.run([name, location, provider, cleanIP], function(err) {
                    if (err) {
                        console.error('节点注册失败:', err);
                        return res.status(500).json({ error: '注册失败' });
                    }
                    
                    console.log(`新节点注册成功: ${name} (${cleanIP})`);
                    
                    res.json({
                        success: true,
                        node_id: this.lastID,
                        message: '节点注册成功',
                        detected_ip: cleanIP
                    });
                });
                
                stmt.finalize();
            }
        }
    );
});

// 接收测试结果
router.post('/test-results', authenticateAPIKey, (req, res) => {
    const { node_id, results, timestamp } = req.body;
    
    if (!node_id || !results || !Array.isArray(results)) {
        return res.status(400).json({ error: '无效的数据格式' });
    }

    // 更新节点最后在线时间
    db.run('UPDATE vps_nodes SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [node_id]);

    const stmt = db.prepare(`
        INSERT INTO test_results 
        (node_id, isp_name, target_ip, test_type, avg_latency, packet_loss, jitter, test_time, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertCount = 0;
    const testTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    results.forEach(result => {
        stmt.run([
            node_id,
            result.isp_name,
            result.target_ip,
            result.test_type,
            result.avg_latency || null,
            result.packet_loss || null,
            result.jitter || null,
            testTime,
            JSON.stringify(result.raw_data || {})
        ], (err) => {
            if (!err) insertCount++;
        });
    });

    stmt.finalize((err) => {
        if (err) {
            console.error('保存测试结果失败:', err);
            return res.status(500).json({ error: '保存失败' });
        }
        
        res.json({
            success: true,
            inserted: insertCount,
            message: '测试结果保存成功'
        });
    });
});

// 获取所有VPS节点状态（公共接口，根据设置决定是否显示IP）
router.get('/nodes', (req, res) => {
    // 检查是否需要显示IP地址
    db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['show_ip_to_public'], (err, config) => {
        const showIP = config?.config_value === 'true';
        
        const ipField = showIP ? 'ip_address' : 'NULL as ip_address';
        
        db.all(`
            SELECT 
                id, name, location, provider, ${ipField}, status,
                last_seen,
                datetime(last_seen, 'localtime') as last_seen_local,
                CASE 
                    WHEN is_placeholder = 1 THEN 'placeholder'
                    WHEN datetime(last_seen) > datetime('now', '-6 minutes') THEN 'online'
                    WHEN datetime(last_seen) > datetime('now', '-15 minutes') THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                ROUND((julianday('now') - julianday(last_seen)) * 24 * 60, 1) as minutes_since_last_seen
            FROM vps_nodes 
            WHERE is_placeholder = 0
            ORDER BY connection_status ASC, location, name
        `, (err, rows) => {
            if (err) {
                console.error('获取节点列表失败:', err);
                return res.status(500).json({ error: '查询失败' });
            }
            
            // 自动标记长时间离线的节点为offline状态
            const offlineNodeIds = rows
                .filter(row => row.minutes_since_last_seen > 15)
                .map(row => row.id);
            
            if (offlineNodeIds.length > 0) {
                db.run(`
                    UPDATE vps_nodes 
                    SET status = 0 
                    WHERE id IN (${offlineNodeIds.join(',')})
                `, (updateErr) => {
                    if (updateErr) {
                        console.error('更新离线状态失败:', updateErr);
                    }
                });
            }
            
            res.json(rows);
        });
    });
});

// 获取特定节点的最新测试结果
router.get('/nodes/:nodeId/latest', (req, res) => {
    const { nodeId } = req.params;
    
    db.all(`
        SELECT 
            isp_name,
            test_type,
            AVG(avg_latency) as avg_latency,
            AVG(packet_loss) as packet_loss,
            COUNT(*) as test_count,
            MAX(test_time) as last_test
        FROM test_results 
        WHERE node_id = ? 
            AND test_time > datetime('now', '-1 hour')
            AND test_type = 'ping'
        GROUP BY isp_name
        ORDER BY isp_name
    `, [nodeId], (err, rows) => {
        if (err) {
            console.error('获取最新结果失败:', err);
            return res.status(500).json({ error: '查询失败' });
        }
        
        res.json(rows);
    });
});

// 获取图表数据
router.get('/chart-data/:nodeId/:ispName', (req, res) => {
    const { nodeId, ispName } = req.params;
    const { timeRange = '24h' } = req.query;
    
    let timeFilter;
    switch(timeRange) {
        case '1h':
            timeFilter = "datetime('now', '-1 hour')";
            break;
        case '6h':
            timeFilter = "datetime('now', '-6 hours')";
            break;
        case '24h':
            timeFilter = "datetime('now', '-24 hours')";
            break;
        case '7d':
            timeFilter = "datetime('now', '-7 days')";
            break;
        default:
            timeFilter = "datetime('now', '-24 hours')";
    }

    db.all(`
        SELECT 
            test_time,
            avg_latency,
            packet_loss,
            target_ip
        FROM test_results 
        WHERE node_id = ? 
            AND isp_name = ?
            AND test_type = 'ping'
            AND test_time >= ${timeFilter}
        ORDER BY test_time ASC
    `, [nodeId, ispName], (err, rows) => {
        if (err) {
            console.error('获取图表数据失败:', err);
            return res.status(500).json({ error: '查询失败' });
        }
        
        // 格式化数据
        const chartData = {
            ping: [],
            labels: []
        };
        
        const timeLabels = new Set();
        
        rows.forEach(row => {
            const time = new Date(row.test_time);
            const timeLabel = time.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            timeLabels.add(timeLabel);
            
            chartData.ping.push({
                x: timeLabel,
                y: row.avg_latency,
                packetLoss: row.packet_loss,
                time: row.test_time
            });
        });
        
        chartData.labels = Array.from(timeLabels).sort();
        
        res.json(chartData);
    });
});

// 心跳检测端点
router.post('/nodes/:nodeId/heartbeat', authenticateAPIKey, (req, res) => {
    const { nodeId } = req.params;
    
    db.run(`
        UPDATE vps_nodes 
        SET last_seen = CURRENT_TIMESTAMP, status = 1 
        WHERE id = ?
    `, [nodeId], function(err) {
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '节点不存在' });
        }
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            nodeId: nodeId
        });
    });
});

// 公开的一键安装脚本端点
router.get('/install/:nodeId/:token', (req, res) => {
    const { nodeId, token } = req.params;
    
    console.log(`📜 公开安装脚本请求: 节点ID ${nodeId}, Token: ${token.substring(0, 8)}...`);
    
    // 验证安装令牌
    db.get(`
        SELECT vn.*, sc.config_value as api_key 
        FROM vps_nodes vn, system_config sc 
        WHERE vn.id = ? AND vn.is_placeholder = 1 AND sc.config_key = 'api_key'
    `, [nodeId], (err, result) => {
        if (err) {
            console.error('❌ 查询节点失败:', err);
            return res.status(500).send('#!/bin/bash\necho "安装失败: 数据库错误"\nexit 1');
        }
        
        if (!result) {
            console.log(`❌ 节点 ${nodeId} 不存在或不是空白节点`);
            return res.status(404).send('#!/bin/bash\necho "安装失败: 节点不存在或已激活"\nexit 1');
        }
        
        // 生成安装令牌进行简单验证 (基于节点信息的哈希)
        const crypto = require('crypto');
        const expectedToken = crypto
            .createHash('md5')
            .update(`${nodeId}-${result.name}-${result.api_key}`)
            .digest('hex')
            .substring(0, 16);
        
        if (token !== expectedToken) {
            console.log(`❌ 安装令牌无效: 期望 ${expectedToken}, 收到 ${token}`);
            return res.status(403).send('#!/bin/bash\necho "安装失败: 安装令牌无效"\nexit 1');
        }
        
        const node = result;
        const apiKey = result.api_key;
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        
        console.log(`✅ 为节点 ${node.name} 生成公开安装脚本`);
        
        // 处理文件名，确保只包含ASCII安全字符
        const safeFileName = node.name.replace(/[^a-zA-Z0-9\-_]/g, '_');
        
        // 设置正确的Content-Type
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vps-monitor-${safeFileName}.sh"`);
        
        const { generateClientCode } = require('../utils/helpers');
        
        const installScript = `#!/bin/bash
# VPS网络监测客户端一键安装脚本
# 节点: ${node.name}
# 生成时间: ${new Date().toLocaleString()}
# 
# 使用方法:
# curl -fsSL ${serverUrl}/api/install/${nodeId}/${token} | bash
#

set -e

# 颜色输出
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# 输出函数
log_info() {
    echo -e "\${BLUE}[INFO]\${NC} \$1"
}

log_success() {
    echo -e "\${GREEN}[SUCCESS]\${NC} \$1"
}

log_warning() {
    echo -e "\${YELLOW}[WARNING]\${NC} \$1"
}

log_error() {
    echo -e "\${RED}[ERROR]\${NC} \$1"
}

# 检查是否为root用户
if [[ \$EUID -ne 0 ]]; then
   log_error "此脚本需要root权限运行"
   log_info "请使用: sudo curl -fsSL ${serverUrl}/api/install/${nodeId}/${token} | bash"
   exit 1
fi

log_info "🚀 开始安装VPS网络监测客户端..."
log_info "节点名称: ${node.name}"
log_info "节点位置: ${node.location}"
log_info "服务器地址: ${serverUrl}"

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=\$ID
    VER=\$VERSION_ID
else
    log_error "无法检测操作系统版本"
    exit 1
fi

log_info "检测到操作系统: \$OS \$VER"

# 安装Python3和pip
log_info "📦 检查并安装Python3..."
if ! command -v python3 &> /dev/null; then
    log_warning "Python3未安装，正在安装..."
    case \$OS in
        ubuntu|debian)
            apt update
            apt install -y python3 python3-pip python3-venv
            ;;
        centos|rhel|fedora)
            if command -v dnf &> /dev/null; then
                dnf install -y python3 python3-pip
            else
                yum install -y python3 python3-pip
            fi
            ;;
        alpine)
            apk add --no-cache python3 py3-pip
            ;;
        *)
            log_error "不支持的操作系统: \$OS"
            log_info "请手动安装Python3和pip3"
            exit 1
            ;;
    esac
    log_success "Python3安装完成"
else
    log_success "Python3已安装: \$(python3 --version)"
fi

# 检查pip3
if ! command -v pip3 &> /dev/null; then
    log_info "安装pip3..."
    python3 -m ensurepip --upgrade 2>/dev/null || true
    python3 -m pip install --upgrade pip 2>/dev/null || true
fi

# 安装Python依赖
log_info "📦 安装Python依赖包..."

# 优先尝试系统包管理器安装
DEPS_INSTALLED=0

case \$OS in
    ubuntu|debian)
        log_info "尝试通过apt安装Python依赖..."
        if apt install -y python3-aiohttp python3-requests 2>/dev/null; then
            log_success "通过系统包管理器安装依赖完成"
            DEPS_INSTALLED=1
        fi
        ;;
    centos|rhel|fedora)
        log_info "尝试通过包管理器安装Python依赖..."
        if command -v dnf &> /dev/null; then
            dnf install -y python3-aiohttp python3-requests 2>/dev/null && DEPS_INSTALLED=1
        else
            yum install -y python3-aiohttp python3-requests 2>/dev/null && DEPS_INSTALLED=1
        fi
        ;;
    alpine)
        log_info "尝试通过apk安装Python依赖..."
        apk add --no-cache py3-aiohttp py3-requests 2>/dev/null && DEPS_INSTALLED=1
        ;;
esac

# 如果系统包管理器安装失败，使用pip
if [ \$DEPS_INSTALLED -eq 0 ]; then
    log_info "系统包管理器安装失败，尝试使用pip..."
    
    # 尝试多种pip安装方法
    if pip3 install aiohttp requests --quiet 2>/dev/null; then
        log_success "pip安装依赖完成"
    elif pip3 install aiohttp requests --break-system-packages --quiet 2>/dev/null; then
        log_success "pip安装依赖完成（使用--break-system-packages）"
        log_warning "已使用--break-system-packages参数，这可能影响系统Python环境"
    elif python3 -m pip install aiohttp requests --break-system-packages --quiet 2>/dev/null; then
        log_success "pip安装依赖完成（使用python3 -m pip）"
    else
        log_error "Python依赖安装失败"
        log_info "请手动安装依赖后重新运行："
        log_info "  Debian/Ubuntu: apt install python3-aiohttp python3-requests"
        log_info "  或使用: pip3 install aiohttp requests --break-system-packages"
        exit 1
    fi
else
    log_success "Python依赖安装完成"
fi

# 创建工作目录
WORK_DIR="/opt/vps-monitor"
log_info "📁 创建工作目录: \$WORK_DIR"
mkdir -p \$WORK_DIR
cd \$WORK_DIR

# 停止现有服务（如果存在）
if systemctl is-active --quiet vps-monitor 2>/dev/null; then
    log_info "🛑 停止现有服务..."
    systemctl stop vps-monitor
fi

# 创建客户端程序
log_info "⬇️ 创建客户端程序..."
cat > vps_client.py << 'EOF'
${generateClientCode()}
EOF

# 创建配置文件
log_info "⚙️ 创建配置文件..."
cat > config.json << 'EOF'
{
  "node_info": {
    "name": "${node.name}",
    "location": "${node.location}",
    "provider": "${node.provider}",
    "ip_address": "auto"
  },
  "api_endpoint": "${serverUrl}",
  "api_key": "${apiKey}",
  "test_interval": 300,
  "test_targets": {
    "china_telecom": [
      {"ip": "202.96.209.133", "port": 80, "name": "上海电信"},
      {"ip": "61.139.2.69", "port": 80, "name": "北京电信"}
    ],
    "china_unicom": [
      {"ip": "221.5.88.88", "port": 80, "name": "北京联通"},
      {"ip": "123.125.114.144", "port": 80, "name": "上海联通"}
    ],
    "china_mobile": [
      {"ip": "221.179.155.161", "port": 80, "name": "北京移动"},
      {"ip": "117.131.9.2", "port": 80, "name": "上海移动"}
    ]
  }
}
EOF

# 设置权限
chmod +x vps_client.py

# 创建systemd服务
log_info "🔧 创建系统服务..."
cat > /etc/systemd/system/vps-monitor.service << 'EOF'
[Unit]
Description=VPS Network Monitor Client - ${node.name}
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vps-monitor
ExecStart=/usr/bin/python3 vps_client.py --daemon
Restart=always
RestartSec=30
Environment=PYTHONPATH=/opt/vps-monitor
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd并启动服务
log_info "🔄 启动监控服务..."
systemctl daemon-reload
systemctl enable vps-monitor
systemctl start vps-monitor

# 等待服务启动
sleep 3

# 检查服务状态
if systemctl is-active --quiet vps-monitor; then
    log_success "✅ VPS监控服务启动成功！"
else
    log_error "❌ VPS监控服务启动失败"
    log_info "查看错误日志: journalctl -u vps-monitor --no-pager -l"
    exit 1
fi

# 显示安装结果
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "🎉 VPS网络监测客户端安装完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
log_info "📊 服务状态: systemctl status vps-monitor"
log_info "📋 查看日志: journalctl -u vps-monitor -f"
log_info "🔧 配置文件: /opt/vps-monitor/config.json"
log_info "🌐 监控面板: ${serverUrl}"
echo
log_info "常用命令:"
echo "  启动服务: systemctl start vps-monitor"
echo "  停止服务: systemctl stop vps-monitor"
echo "  重启服务: systemctl restart vps-monitor"
echo "  查看状态: systemctl status vps-monitor"
echo "  查看日志: journalctl -u vps-monitor -f"
echo
log_success "节点 '${node.name}' 已成功连接到监控系统！"
`;
        
        res.send(installScript);
    });
});

module.exports = router;