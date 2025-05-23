const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generateAPIKey, generateClientCode } = require('../utils/helpers');

const router = express.Router();

console.log('✅ Admin routes loaded');

// 获取系统配置
router.get('/config', authenticateToken, (req, res) => {
    console.log('🔧 获取系统配置请求');
    db.all('SELECT config_key, config_value FROM system_config', (err, rows) => {
        if (err) {
            console.error('❌ 获取配置失败:', err);
            return res.status(500).json({ error: '获取配置失败' });
        }

        const config = {};
        rows.forEach(row => {
            config[row.config_key] = row.config_value;
        });

        console.log('✅ 配置获取成功');
        res.json(config);
    });
});

// 更新系统配置
router.post('/config', authenticateToken, (req, res) => {
    const { key, value } = req.body;
    console.log(`🔧 更新配置: ${key} = ${value}`);

    if (!key || value === undefined) {
        return res.status(400).json({ error: '配置键和值不能为空' });
    }

    db.run(`
        INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value], function(err) {
        if (err) {
            console.error('❌ 更新配置失败:', err);
            return res.status(500).json({ error: '更新配置失败' });
        }

        console.log('✅ 配置更新成功');
        res.json({ success: true, message: '配置更新成功' });
    });
});

// 重新生成API密钥
router.post('/regenerate-api-key', authenticateToken, (req, res) => {
    console.log('🔑 重新生成API密钥请求');
    const newAPIKey = generateAPIKey();

    db.run(`
        UPDATE system_config 
        SET config_value = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE config_key = 'api_key'
    `, [newAPIKey], function(err) {
        if (err) {
            console.error('❌ 重新生成API密钥失败:', err);
            return res.status(500).json({ error: '重新生成API密钥失败' });
        }

        console.log('✅ API密钥重新生成成功');
        res.json({ success: true, apiKey: newAPIKey });
    });
});

// 获取所有节点（管理员）- 最简版本
router.get('/nodes', authenticateToken, (req, res) => {
    console.log('🌐 管理员请求节点列表...');
    
    // 使用最简单的查询，避免复杂的SQL
    db.all(`
        SELECT 
            id, name, location, provider, ip_address, status, is_placeholder,
            last_seen
        FROM vps_nodes 
        ORDER BY is_placeholder DESC, id DESC
    `, (err, rows) => {
        if (err) {
            console.error('❌ 获取节点列表失败:', err);
            return res.status(500).json({ 
                error: '查询失败', 
                details: err.message 
            });
        }
        
        console.log(`✅ 查询成功，返回 ${rows.length} 个节点`);
        
        // 手动处理数据，添加缺失的字段
        const processedRows = rows.map(row => {
            // 计算连接状态
            let connection_status = 'offline';
            if (row.is_placeholder) {
                connection_status = 'placeholder';
            } else if (row.last_seen) {
                const lastSeenTime = new Date(row.last_seen);
                const now = new Date();
                const diffMinutes = (now - lastSeenTime) / (1000 * 60);
                
                if (diffMinutes <= 6) {
                    connection_status = 'online';
                } else if (diffMinutes <= 15) {
                    connection_status = 'warning';
                } else {
                    connection_status = 'offline';
                }
            }
            
            return {
                id: row.id,
                name: row.name,
                location: row.location || 'Auto-detect',
                provider: row.provider || 'Auto-detect',
                ip_address: row.ip_address || null,
                status: row.status || 0,
                is_placeholder: row.is_placeholder || 0,
                last_seen: row.last_seen || new Date().toISOString(),
                connection_status: connection_status,
                country_code: null,
                country_name: null,
                city: null,
                isp: null,
                total_tests: 0,
                minutes_since_last_seen: row.last_seen ? 
                    Math.round((new Date() - new Date(row.last_seen)) / (1000 * 60)) : null
            };
        });
        
        // 分类统计
        const placeholderNodes = processedRows.filter(r => r.is_placeholder);
        const realNodes = processedRows.filter(r => !r.is_placeholder);
        
        console.log(`📊 空白节点: ${placeholderNodes.length} 个`);
        console.log(`📊 真实节点: ${realNodes.length} 个`);
        
        if (placeholderNodes.length > 0) {
            console.log('🔍 空白节点列表:');
            placeholderNodes.forEach(node => {
                console.log(`  ID: ${node.id}, 名称: ${node.name}`);
            });
        }
        
        res.json(processedRows);
    });
});

// 创建空白节点
router.post('/nodes', authenticateToken, (req, res) => {
    const { name, location, provider } = req.body;
    
    console.log('🚀 创建空白节点请求:', { name, location, provider });
    
    if (!name || name.trim() === '') {
        console.log('❌ 节点名称为空');
        return res.status(400).json({ error: '节点名称不能为空' });
    }

    const finalName = name.trim();
    const finalLocation = (location && location.trim()) ? location.trim() : 'Auto-detect';
    const finalProvider = (provider && provider.trim()) ? provider.trim() : 'Auto-detect';
    
    console.log('📝 处理后的数据:', { 
        name: finalName, 
        location: finalLocation, 
        provider: finalProvider 
    });

    // 检查节点名称是否已存在
    db.get('SELECT id FROM vps_nodes WHERE name = ?', [finalName], (checkErr, existingNode) => {
        if (checkErr) {
            console.error('❌ 检查节点名称失败:', checkErr);
            return res.status(500).json({ error: '数据库查询失败' });
        }
        
        if (existingNode) {
            console.log('❌ 节点名称已存在:', existingNode.id);
            return res.status(400).json({ error: '节点名称已存在，请使用不同的名称' });
        }
        
        // 创建新的空白节点
        console.log('💾 开始插入新节点...');
        
        db.run(`
            INSERT INTO vps_nodes (name, location, provider, is_placeholder, status) 
            VALUES (?, ?, ?, 1, 0)
        `, [finalName, finalLocation, finalProvider], function(err) {
            if (err) {
                console.error('❌ 创建节点失败:', err);
                return res.status(500).json({ error: `数据库错误: ${err.message}` });
            }
            
            const newNodeId = this.lastID;
            console.log(`✅ 空白节点创建成功! ID: ${newNodeId}`);
            
            res.json({
                success: true,
                nodeId: newNodeId,
                message: '空白节点创建成功'
            });
        });
    });
});

// 删除节点
router.delete('/nodes/:nodeId', authenticateToken, (req, res) => {
    const { nodeId } = req.params;
    
    console.log(`🗑️ 删除节点请求: ID ${nodeId}`);
    
    // 先删除测试记录，再删除节点
    db.run('DELETE FROM test_results WHERE node_id = ?', [nodeId], function(testErr) {
        if (testErr) {
            console.error('❌ 删除测试记录失败:', testErr);
            return res.status(500).json({ error: '删除测试记录失败' });
        }
        
        const deletedTests = this.changes;
        console.log(`🗑️ 删除了 ${deletedTests} 条测试记录`);
        
        // 删除节点
        db.run('DELETE FROM vps_nodes WHERE id = ?', [nodeId], function(nodeErr) {
            if (nodeErr) {
                console.error('❌ 删除节点失败:', nodeErr);
                return res.status(500).json({ error: '删除节点失败' });
            }
            
            if (this.changes === 0) {
                console.log('❌ 节点不存在:', nodeId);
                return res.status(404).json({ error: '节点不存在' });
            }
            
            console.log(`✅ 节点 ${nodeId} 删除成功`);
            
            res.json({
                success: true,
                message: '节点删除成功',
                deletedTests: deletedTests
            });
        });
    });
});

// 生成一键安装脚本 - 新版本
router.get('/nodes/:nodeId/install-script', authenticateToken, (req, res) => {
    const { nodeId } = req.params;
    
    console.log(`📜 生成安装脚本: 节点ID ${nodeId}`);
    
    db.get('SELECT * FROM vps_nodes WHERE id = ?', [nodeId], (nodeErr, node) => {
        if (nodeErr || !node) {
            return res.status(404).json({ error: '节点不存在' });
        }

        if (!node.is_placeholder) {
            return res.status(400).json({ error: '只有空白节点才能生成安装脚本' });
        }

        db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['api_key'], (keyErr, row) => {
            if (keyErr || !row?.config_value) {
                return res.status(500).json({ error: 'API密钥未配置' });
            }
            
            const apiKey = row.config_value;
            
            // 生成安装令牌
            const crypto = require('crypto');
            const installToken = crypto
                .createHash('md5')
                .update(`${nodeId}-${node.name}-${apiKey}`)
                .digest('hex')
                .substring(0, 16);

            const serverUrl = req.headers.origin || `http://${req.headers.host}`;
            const installUrl = `${serverUrl}/api/install/${nodeId}/${installToken}`;
            const curlCommand = `curl -fsSL ${installUrl} | bash`;
            const wgetCommand = `wget -qO- ${installUrl} | bash`;
            
            console.log(`✅ 为节点 ${node.name} 生成安装URL`);
            
            res.json({
                success: true,
                script: `一键安装命令已生成，请在目标VPS上执行：\n\n${curlCommand}\n\n或使用wget：\n${wgetCommand}`,
                installUrl: installUrl,
                curlCommand: curlCommand,
                wgetCommand: wgetCommand,
                nodeInfo: {
                    name: node.name,
                    installToken: installToken
                }
            });
        });
    });
});
// 简单测试端点
router.get('/test', (req, res) => {
    console.log('🧪 管理员路由测试端点被访问');
    res.json({ 
        success: true, 
        message: '管理员路由工作正常',
        timestamp: new Date().toISOString()
    });
});

console.log('✅ Admin routes module exports completed');
module.exports = router;