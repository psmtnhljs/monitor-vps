const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generateAPIKey, generateClientCode } = require('../utils/helpers');

const router = express.Router();

// 获取系统配置
router.get('/config', authenticateToken, (req, res) => {
    db.all('SELECT config_key, config_value FROM system_config', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '获取配置失败' });
        }

        const config = {};
        rows.forEach(row => {
            config[row.config_key] = row.config_value;
        });

        res.json(config);
    });
});

// 更新系统配置
router.post('/config', authenticateToken, (req, res) => {
    const { key, value } = req.body;

    if (!key || value === undefined) {
        return res.status(400).json({ error: '配置键和值不能为空' });
    }

    db.run(`
        INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value], function(err) {
        if (err) {
            return res.status(500).json({ error: '更新配置失败' });
        }

        res.json({ success: true, message: '配置更新成功' });
    });
});

// 重新生成API密钥
router.post('/regenerate-api-key', authenticateToken, (req, res) => {
    const newAPIKey = generateAPIKey();

    db.run(`
        UPDATE system_config 
        SET config_value = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE config_key = 'api_key'
    `, [newAPIKey], function(err) {
        if (err) {
            return res.status(500).json({ error: '重新生成API密钥失败' });
        }

        res.json({ success: true, apiKey: newAPIKey });
    });
});

// 获取所有节点（管理员）
router.get('/nodes', authenticateToken, (req, res) => {
    db.all(`
        SELECT 
            id, name, location, provider, ip_address, status, is_placeholder,
            country_code, country_name, city, isp,
            last_seen,
            datetime(last_seen, 'localtime') as last_seen_local,
            CASE 
                WHEN is_placeholder = 1 THEN 'placeholder'
                WHEN datetime(last_seen) > datetime('now', '-6 minutes') THEN 'online'
                WHEN datetime(last_seen) > datetime('now', '-15 minutes') THEN 'warning'
                ELSE 'offline'
            END as connection_status,
            ROUND((julianday('now') - julianday(last_seen)) * 24 * 60, 1) as minutes_since_last_seen,
            (SELECT COUNT(*) FROM test_results WHERE node_id = vps_nodes.id) as total_tests
        FROM vps_nodes 
        ORDER BY is_placeholder DESC, connection_status ASC, name
    `, (err, rows) => {
        if (err) {
            console.error('获取管理员节点列表失败:', err);
            return res.status(500).json({ error: '查询失败' });
        }
        
        res.json(rows);
    });
});

// 创建空白节点
router.post('/nodes', authenticateToken, (req, res) => {
    const { name, location, provider } = req.body;
    
    console.log('接收到创建节点请求:', { name, location, provider });
    
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: '节点名称不能为空' });
    }

    // 位置和提供商可以为空，将由客户端自动获取
    const finalLocation = (location && location !== 'Auto-detect') ? location : 'Auto-detect';
    const finalProvider = (provider && provider !== 'Auto-detect') ? provider : 'Auto-detect';
    
    console.log('处理后的数据:', { name: name.trim(), finalLocation, finalProvider });

    db.run(`
        INSERT INTO vps_nodes (name, location, provider, is_placeholder, status) 
        VALUES (?, ?, ?, 1, 0)
    `, [name.trim(), finalLocation, finalProvider], function(err) {
        if (err) {
            console.error('创建节点数据库错误:', err);
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: '节点名称已存在' });
            }
            return res.status(500).json({ error: `数据库错误: ${err.message}` });
        }
        
        console.log('节点创建成功，ID:', this.lastID);
        
        res.json({
            success: true,
            nodeId: this.lastID,
            message: '空白节点创建成功'
        });
    });
});

// 删除节点
router.delete('/nodes/:nodeId', authenticateToken, (req, res) => {
    const { nodeId } = req.params;
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 删除测试记录
        db.run('DELETE FROM test_results WHERE node_id = ?', [nodeId], function(testErr) {
            if (testErr) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: '删除测试记录失败' });
            }
            
            const deletedTests = this.changes;
            
            // 删除节点
            db.run('DELETE FROM vps_nodes WHERE id = ?', [nodeId], function(nodeErr) {
                if (nodeErr) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: '删除节点失败' });
                }
                
                if (this.changes === 0) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: '节点不存在' });
                }
                
                db.run('COMMIT');
                
                res.json({
                    success: true,
                    message: '节点删除成功',
                    deletedTests: deletedTests
                });
            });
        });
    });
});

// 生成一键安装脚本
router.get('/nodes/:nodeId/install-script', authenticateToken, (req, res) => {
    const { nodeId } = req.params;
    
    // 获取节点信息和API配置
    Promise.all([
        new Promise((resolve, reject) => {
            db.get('SELECT * FROM vps_nodes WHERE id = ?', [nodeId], (err, node) => {
                if (err) reject(err);
                else resolve(node);
            });
        }),
        new Promise((resolve, reject) => {
            db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['api_key'], (err, row) => {
                if (err) reject(err);
                else resolve(row?.config_value);
            });
        })
    ]).then(([node, apiKey]) => {
        if (!node) {
            return res.status(404).json({ error: '节点不存在' });
        }

        const serverUrl = req.headers.origin || `http://${req.headers.host}`;
        
        const script = `#!/bin/bash
# VPS网络监测客户端一键安装脚本
# 节点: ${node.name}
# 位置: ${node.location}

set -e

echo "🚀 开始安装VPS网络监测客户端..."
echo "节点名称: ${node.name}"
echo "节点位置: ${node.location}"

# 检查Python3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3未安装，正在安装..."
    if command -v apt &> /dev/null; then
        apt update && apt install -y python3 python3-pip
    elif command -v yum &> /dev/null; then
        yum install -y python3 python3-pip
    else
        echo "❌ 无法自动安装Python3，请手动安装"
        exit 1
    fi
fi

# 检查pip3
if ! command -v pip3 &> /dev/null; then
    echo "正在安装pip3..."
    python3 -m ensurepip --upgrade
fi

# 安装依赖
echo "📦 安装Python依赖..."
pip3 install aiohttp

# 创建工作目录
mkdir -p /opt/vps-monitor
cd /opt/vps-monitor

# 下载客户端程序
echo "⬇️ 创建客户端程序..."
cat > vps_client.py << 'EOF'
${generateClientCode()}
EOF

# 创建配置文件
echo "⚙️ 创建配置文件..."
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

# 创建systemd服务
echo "🔧 创建系统服务..."
cat > /etc/systemd/system/vps-monitor.service << 'EOF'
[Unit]
Description=VPS Network Monitor Client - ${node.name}
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vps-monitor
ExecStart=/usr/bin/python3 vps_client.py --daemon
Restart=always
RestartSec=30
Environment=PYTHONPATH=/opt/vps-monitor

[Install]
WantedBy=multi-user.target
EOF

# 设置权限
chmod +x vps_client.py

# 启用并启动服务
systemctl daemon-reload
systemctl enable vps-monitor
systemctl start vps-monitor

echo "✅ 安装完成！"
echo "📊 服务状态: systemctl status vps-monitor"
echo "📋 查看日志: journalctl -u vps-monitor -f"
echo "🔧 配置文件: /opt/vps-monitor/config.json"
echo ""
echo "🌐 请访问 ${serverUrl} 查看监控面板"
`;

        res.json({
            success: true,
            script: script,
            nodeInfo: {
                name: node.name,
                location: node.location,
                provider: node.provider
            }
        });
    }).catch(err => {
        console.error('生成安装脚本失败:', err);
        res.status(500).json({ error: '生成脚本失败' });
    });
});

module.exports = router;