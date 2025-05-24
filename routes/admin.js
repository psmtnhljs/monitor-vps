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

// 获取所有节点（管理员）- 最终修复版本
router.get('/nodes', authenticateToken, (req, res) => {
    console.log('🌐 管理员请求节点列表...');
    
    // 先检查表结构
    db.all("PRAGMA table_info(vps_nodes)", (pragmaErr, columns) => {
        if (pragmaErr) {
            console.error('❌ 检查表结构失败:', pragmaErr);
            return res.status(500).json({ 
                error: '查询失败', 
                details: pragmaErr.message 
            });
        }
        
        const columnNames = columns.map(col => col.name);
        const hasNewColumns = columnNames.includes('country_code');
        
        console.log(`📊 表结构状态: ${hasNewColumns ? '已升级（包含地理位置字段）' : '基础版本'}`);
        
        let selectSQL;
        if (hasNewColumns) {
            // 新版本数据库，包含地理位置字段
            selectSQL = `
                SELECT 
                    id, name, location, provider, ip_address, status,
                    last_seen, is_placeholder, country_code, country_name, city, region, isp,
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
                ORDER BY is_placeholder DESC, connection_status ASC, id DESC
            `;
        } else {
            // 旧版本数据库，不包含地理位置字段
            selectSQL = `
                SELECT 
                    id, name, location, provider, ip_address, status,
                    last_seen, is_placeholder,
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
                ORDER BY is_placeholder DESC, connection_status ASC, id DESC
            `;
        }
        
        db.all(selectSQL, (err, rows) => {
            if (err) {
                console.error('❌ 获取节点列表失败:', err);
                return res.status(500).json({ 
                    error: '查询失败', 
                    details: err.message 
                });
            }
            
            console.log(`✅ 查询成功，返回 ${rows.length} 个节点`);
            
            // 处理数据，修复显示问题
            const processedRows = rows.map(row => {
                console.log(`🔍 处理节点 ${row.name}:`, {
                    location: row.location,
                    provider: row.provider,
                    country_code: row.country_code,
                    country_name: row.country_name,
                    city: row.city,
                    isp: row.isp
                });
                
                // 正确处理位置显示
                let locationDisplay = '未知位置';
                let countryCode = null;
                let countryName = null;
                
                if (hasNewColumns && row.city && row.country_name) {
                    // 优先使用新字段的数据
                    locationDisplay = `${row.city}, ${row.country_name}`;
                    countryCode = row.country_code;
                    countryName = row.country_name;
                    console.log(`   📍 使用新字段数据: ${locationDisplay}`);
                } else if (row.location && row.location !== 'Auto-detect' && row.location !== '待检测') {
                    // 使用原有location字段
                    locationDisplay = row.location;
                    // 尝试从location字段解析国家信息
                    if (row.location.includes(',')) {
                        const parts = row.location.split(',');
                        if (parts.length >= 2) {
                            countryName = parts[parts.length - 1].trim();
                        }
                    }
                    console.log(`   📍 使用location字段: ${locationDisplay}`);
                } else if (row.location === 'Auto-detect' || row.location === '待检测') {
                    locationDisplay = '待检测';
                    console.log(`   📍 位置状态: ${locationDisplay}`);
                }
                
                // 正确处理提供商显示 - 优先使用ISP字段
                let providerDisplay = '未知提供商';
                
                if (hasNewColumns && row.isp && row.isp !== 'Unknown ISP') {
                    // 优先使用ISP字段（已经过清理）
                    providerDisplay = row.isp;
                    console.log(`   🏢 使用ISP字段: ${providerDisplay}`);
                } else if (row.provider && row.provider !== 'Auto-detect' && row.provider !== '待检测') {
                    // 使用原有provider字段，应用保守清理
                    providerDisplay = cleanProviderNameSafe(row.provider);
                    console.log(`   🏢 使用provider字段（清理后）: ${row.provider} -> ${providerDisplay}`);
                } else if (row.provider === 'Auto-detect' || row.provider === '待检测') {
                    providerDisplay = '待检测';
                    console.log(`   🏢 提供商状态: ${providerDisplay}`);
                }
                
                console.log(`✅ 处理结果:`, {
                    locationDisplay,
                    providerDisplay,
                    countryCode,
                    countryName
                });
                
                return {
                    id: row.id,
                    name: row.name,
                    location: locationDisplay,
                    provider: providerDisplay,
                    ip_address: row.ip_address || null,
                    status: row.status || 0,
                    is_placeholder: row.is_placeholder || 0,
                    last_seen: row.last_seen || new Date().toISOString(),
                    connection_status: row.connection_status,
                    // 正确的地理位置字段
                    country_code: countryCode,
                    country_name: countryName,
                    city: hasNewColumns ? row.city : null,
                    region: hasNewColumns ? row.region : null,
                    isp: hasNewColumns ? row.isp : null,
                    // 兼容字段
                    total_tests: row.total_tests || 0,
                    minutes_since_last_seen: row.minutes_since_last_seen
                };
            });
            
            // 分类统计并输出详细信息
            const placeholderNodes = processedRows.filter(r => r.is_placeholder);
            const realNodes = processedRows.filter(r => !r.is_placeholder);
            
            console.log(`📊 节点状态统计:`);
            console.log(`   - 空白节点: ${placeholderNodes.length} 个`);
            console.log(`   - 真实节点: ${realNodes.length} 个`);
            
            // 输出每个节点的详细状态
            processedRows.forEach(node => {
                const nodeType = node.is_placeholder ? '[空白]' : '[真实]';
                const statusIcon = {
                    'online': '🟢',
                    'warning': '🟡', 
                    'offline': '🔴',
                    'placeholder': '⚪'
                }[node.connection_status] || '❓';
                
                console.log(`   ${statusIcon} ${nodeType} ID:${node.id} "${node.name}" - ${node.connection_status}`);
                console.log(`      位置: ${node.location} | 提供商: ${node.provider}`);
            });
            
            res.json(processedRows);
        });
    });
});

// 安全的提供商名称清理函数
function cleanProviderNameSafe(provider) {
    if (!provider || provider === 'Auto-detect' || provider === '待检测') {
        return '待检测';
    }
    
    let cleanProvider = provider.trim();
    
    console.log(`🧹 安全清理提供商名称: "${cleanProvider}"`);
    
    // 只进行最基本的清理
    
    // 1. 处理明显的格式问题："Location, LocationCompany" -> "Company"
    if (cleanProvider.includes(',')) {
        const parts = cleanProvider.split(',');
        if (parts.length === 2) {
            const firstPart = parts[0].trim();
            const secondPart = parts[1].trim();
            
            // 如果第二部分以第一部分开头，说明有重复
            if (secondPart.toLowerCase().startsWith(firstPart.toLowerCase())) {
                cleanProvider = secondPart.substring(firstPart.length).trim();
                console.log(`   🔧 移除重复前缀: "${provider}" -> "${cleanProvider}"`);
            }
        }
    }
    
    // 2. 只处理明显的重复模式
    const originalLength = cleanProvider.length;
    cleanProvider = cleanProvider.replace(/(\w{4,})\1+/gi, '$1');
    if (cleanProvider.length !== originalLength) {
        console.log(`   🔧 移除重复单词: "${provider}" -> "${cleanProvider}"`);
    }
    
    // 3. 清理开头和结尾的标点
    cleanProvider = cleanProvider.replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    
    // 4. 如果清理后太短或为空，使用原始名称
    if (!cleanProvider || cleanProvider.length < 2) {
        cleanProvider = provider;
        console.log(`   ⚠️ 清理后过短，恢复原始名称: "${cleanProvider}"`);
    }
    
    console.log(`✅ 提供商名称清理完成: "${provider}" -> "${cleanProvider}"`);
    
    return cleanProvider;
}

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

// 生成一键安装脚本
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