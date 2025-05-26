const express = require('express');
const { db } = require('../config/database');
const { authenticateAPIKey } = require('../middleware/auth');
const { getLocationInfo } = require('../utils/location');

const router = express.Router();

// 注册VPS节点 - 增强版本，确保自动检测地理位置
router.post('/nodes/register', authenticateAPIKey, async (req, res) => {
    const { name, location, provider, ip_address } = req.body;
    
    if (!name || !ip_address) {
        return res.status(400).json({ error: '节点名称和IP地址不能为空' });
    }

    // 获取客户端真实IP
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     ip_address;

    const cleanIP = clientIP.replace(/^::ffff:/, '');
    
    console.log(`📍 节点注册请求: ${name} (客户端IP: ${cleanIP})`);
    console.log(`原始位置信息: location=${location}, provider=${provider}`);

    // 检查是否为占位符节点
    db.get(
        'SELECT id, is_placeholder, location, provider FROM vps_nodes WHERE name = ?',
        [name],
        async (err, existingNode) => {
            if (err) {
                console.error('检查节点失败:', err);
                return res.status(500).json({ error: '注册失败' });
            }

            let finalLocation = location;
            let finalProvider = provider;
            let locationInfo = null;
            
            // 始终尝试获取地理位置信息（用于自动检测或更新现有信息）
            console.log('🔍 开始自动检测地理位置和ISP信息...');
            locationInfo = await getLocationInfo(cleanIP);
            
            if (locationInfo) {
                console.log('✅ 地理位置检测成功:', locationInfo);
                
                // 如果位置或提供商需要自动检测，则使用检测结果
                if (location === 'Auto-detect' || !location) {
                    finalLocation = locationInfo.location_string;
                    console.log(`📍 自动检测到位置: ${finalLocation}`);
                }
                
                if (provider === 'Auto-detect' || !provider) {
                    finalProvider = locationInfo.isp;
                    console.log(`🏢 自动检测到ISP: ${finalProvider}`);
                }
            } else {
                console.log('⚠️ 地理位置检测失败，使用默认值');
                if (location === 'Auto-detect' || !location) {
                    finalLocation = '待检测';
                }
                if (provider === 'Auto-detect' || !provider) {
                    finalProvider = '待检测';
                }
            }

            if (existingNode && existingNode.is_placeholder) {
                // 更新占位符节点为真实节点
                console.log(`🔄 激活空白节点: ${name} (ID: ${existingNode.id})`);
                
                // 检查数据库表是否有新字段
                db.all("PRAGMA table_info(vps_nodes)", (pragmaErr, columns) => {
                    if (pragmaErr) {
                        console.error('检查表结构失败:', pragmaErr);
                        return res.status(500).json({ error: '数据库错误' });
                    }
                    
                    const columnNames = columns.map(col => col.name);
                    const hasNewColumns = columnNames.includes('country_code');
                    
                    let updateSQL, updateParams;
                    
                    if (hasNewColumns && locationInfo) {
                        // 新版本数据库，包含地理位置字段
                        updateSQL = `
                            UPDATE vps_nodes 
                            SET location = ?, provider = ?, ip_address = ?, 
                                last_seen = CURRENT_TIMESTAMP, status = 1, is_placeholder = 0,
                                country_code = ?, country_name = ?, city = ?, region = ?, isp = ?
                            WHERE id = ?
                        `;
                        updateParams = [
                            finalLocation, 
                            finalProvider, 
                            cleanIP,
                            locationInfo.country_code || null,
                            locationInfo.country || null,
                            locationInfo.city || null,
                            locationInfo.region || null,
                            locationInfo.isp || null,
                            existingNode.id
                        ];
                    } else {
                        // 旧版本数据库或无地理位置信息，只更新基本字段
                        updateSQL = `
                            UPDATE vps_nodes 
                            SET location = ?, provider = ?, ip_address = ?, 
                                last_seen = CURRENT_TIMESTAMP, status = 1, is_placeholder = 0
                            WHERE id = ?
                        `;
                        updateParams = [finalLocation, finalProvider, cleanIP, existingNode.id];
                    }
                    
                    const updateStmt = db.prepare(updateSQL);
                    updateStmt.run(updateParams, function(err) {
                        if (err) {
                            console.error('更新占位符节点失败:', err);
                            return res.status(500).json({ error: '更新失败' });
                        }
                        
                        console.log(`✅ 空白节点激活成功: ${name} (${cleanIP})`);
                        console.log(`   位置: ${finalLocation}`);
                        console.log(`   提供商: ${finalProvider}`);
                        if (locationInfo) {
                            console.log(`   地理信息: ${locationInfo.country} (${locationInfo.country_code})`);
                        }
                        
                        res.json({
                            success: true,
                            node_id: existingNode.id,
                            message: '节点激活成功',
                            updated: true,
                            detected_ip: cleanIP,
                            location_info: {
                                location: finalLocation,
                                provider: finalProvider,
                                country_code: locationInfo?.country_code,
                                country: locationInfo?.country,
                                city: locationInfo?.city,
                                isp: locationInfo?.isp
                            }
                        });
                    });
                    updateStmt.finalize();
                });
            } else if (existingNode) {
                // 更新现有真实节点（包括地理位置信息）
                console.log(`🔄 更新现有节点: ${name} (ID: ${existingNode.id})`);
                
                // 检查数据库表是否有新字段
                db.all("PRAGMA table_info(vps_nodes)", (pragmaErr, columns) => {
                    if (pragmaErr) {
                        console.error('检查表结构失败:', pragmaErr);
                        return res.status(500).json({ error: '数据库错误' });
                    }
                    
                    const columnNames = columns.map(col => col.name);
                    const hasNewColumns = columnNames.includes('country_code');
                    
                    let updateSQL, updateParams;
                    
                    if (hasNewColumns && locationInfo) {
                        updateSQL = `
                            UPDATE vps_nodes 
                            SET location = ?, provider = ?, ip_address = ?, 
                                last_seen = CURRENT_TIMESTAMP, status = 1,
                                country_code = ?, country_name = ?, city = ?, region = ?, isp = ?
                            WHERE id = ?
                        `;
                        updateParams = [
                            finalLocation, 
                            finalProvider, 
                            cleanIP,
                            locationInfo.country_code || null,
                            locationInfo.country || null,
                            locationInfo.city || null,
                            locationInfo.region || null,
                            locationInfo.isp || null,
                            existingNode.id
                        ];
                    } else {
                        updateSQL = `
                            UPDATE vps_nodes 
                            SET location = ?, provider = ?, ip_address = ?, 
                                last_seen = CURRENT_TIMESTAMP, status = 1
                            WHERE id = ?
                        `;
                        updateParams = [finalLocation, finalProvider, cleanIP, existingNode.id];
                    }
                    
                    const updateStmt = db.prepare(updateSQL);
                    updateStmt.run(updateParams, function(err) {
                        if (err) {
                            console.error('更新节点失败:', err);
                            return res.status(500).json({ error: '更新失败' });
                        }
                        
                        console.log(`✅ 节点信息更新成功: ${name} (${cleanIP})`);
                        if (locationInfo) {
                            console.log(`   地理信息: ${locationInfo.country} (${locationInfo.country_code})`);
                        }
                        
                        res.json({
                            success: true,
                            node_id: existingNode.id,
                            message: '节点信息已更新',
                            updated: true,
                            detected_ip: cleanIP,
                            location_info: {
                                location: finalLocation,
                                provider: finalProvider,
                                country_code: locationInfo?.country_code,
                                country: locationInfo?.country,
                                city: locationInfo?.city,
                                isp: locationInfo?.isp
                            }
                        });
                    });
                    updateStmt.finalize();
                });
            } else {
                // 创建新节点
                console.log(`🆕 创建新节点: ${name}`);
                
                // 检查数据库表是否有新字段
                db.all("PRAGMA table_info(vps_nodes)", (pragmaErr, columns) => {
                    if (pragmaErr) {
                        console.error('检查表结构失败:', pragmaErr);
                        return res.status(500).json({ error: '数据库错误' });
                    }
                    
                    const columnNames = columns.map(col => col.name);
                    const hasNewColumns = columnNames.includes('country_code');
                    
                    let insertSQL, insertParams;
                    
                    if (hasNewColumns && locationInfo) {
                        insertSQL = `
                            INSERT INTO vps_nodes 
                            (name, location, provider, ip_address, last_seen, status, is_placeholder,
                             country_code, country_name, city, region, isp)
                            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0, ?, ?, ?, ?, ?)
                        `;
                        insertParams = [
                            name, 
                            finalLocation, 
                            finalProvider, 
                            cleanIP,
                            locationInfo.country_code || null,
                            locationInfo.country || null,
                            locationInfo.city || null,
                            locationInfo.region || null,
                            locationInfo.isp || null
                        ];
                    } else {
                        insertSQL = `
                            INSERT INTO vps_nodes (name, location, provider, ip_address, last_seen, status, is_placeholder)
                            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0)
                        `;
                        insertParams = [name, finalLocation, finalProvider, cleanIP];
                    }
                    
                    const stmt = db.prepare(insertSQL);
                    stmt.run(insertParams, function(err) {
                        if (err) {
                            console.error('节点注册失败:', err);
                            return res.status(500).json({ error: '注册失败' });
                        }
                        
                        console.log(`✅ 新节点注册成功: ${name} (${cleanIP})`);
                        if (locationInfo) {
                            console.log(`   地理信息: ${locationInfo.country} (${locationInfo.country_code})`);
                        }
                        
                        res.json({
                            success: true,
                            node_id: this.lastID,
                            message: '节点注册成功',
                            detected_ip: cleanIP,
                            location_info: {
                                location: finalLocation,
                                provider: finalProvider,
                                country_code: locationInfo?.country_code,
                                country: locationInfo?.country,
                                city: locationInfo?.city,
                                isp: locationInfo?.isp
                            }
                        });
                    });
                    stmt.finalize();
                });
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
        
        // 先检查表结构
        db.all("PRAGMA table_info(vps_nodes)", (pragmaErr, columns) => {
            if (pragmaErr) {
                console.error('检查表结构失败:', pragmaErr);
                return res.status(500).json({ error: '数据库错误' });
            }
            
            const columnNames = columns.map(col => col.name);
            const hasNewColumns = columnNames.includes('country_code');
            
            let selectSQL;
            if (hasNewColumns) {
                selectSQL = `
                    SELECT 
                        id, name, location, provider, ${ipField}, status,
                        last_seen, country_code, country_name, city, region, isp,
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
                `;
            } else {
                selectSQL = `
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
                `;
            }
            
            db.all(selectSQL, (err, rows) => {
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
// 获取图表数据 - 修复时区问题
router.get('/chart-data/:nodeId/:ispName', (req, res) => {
    const { nodeId, ispName } = req.params;
    const { timeRange = '24h' } = req.query;
    
    // 使用UTC时间计算时间范围
    const now = new Date();
    let hoursBack;
    
    switch(timeRange) {
        case '1h':
            hoursBack = 1;
            break;
        case '6h':
            hoursBack = 6;
            break;
        case '24h':
            hoursBack = 24;
            break;
        case '7d':
            hoursBack = 24 * 7;
            break;
        default:
            hoursBack = 24;
    }
    
    // 计算起始时间（UTC）
    const startTimeUTC = new Date(now.getTime() - hoursBack * 60 * 60 * 1000).toISOString();
    const nowUTC = now.toISOString();
    
    console.log(`📊 查询图表数据: 节点${nodeId}, ISP:${ispName}, 时间范围:${timeRange}`);
    console.log(`   起始UTC时间: ${startTimeUTC}`);
    console.log(`   当前UTC时间: ${nowUTC}`);
    console.log(`   查询${hoursBack}小时内的数据`);

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
            AND test_time >= ?
        ORDER BY test_time ASC
    `, [nodeId, ispName, startTimeUTC], (err, rows) => {
        if (err) {
            console.error('获取图表数据失败:', err);
            return res.status(500).json({ error: '查询失败' });
        }
        
        console.log(`   查询结果: 找到 ${rows.length} 条数据记录`);
        if (rows.length > 0) {
            console.log(`   最早记录: ${rows[0].test_time}`);
            console.log(`   最晚记录: ${rows[rows.length - 1].test_time}`);
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
                minute: '2-digit',
                timeZone: 'UTC'  // 统一使用UTC时间显示，避免时区混乱
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
        
        console.log(`   返回 ${chartData.ping.length} 个数据点，${chartData.labels.length} 个时间标签`);
        
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
        if (err) {
            console.error('心跳更新失败:', err);
            return res.status(500).json({ error: '心跳更新失败' });
        }
        
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

// 节点状态更新端点（用于客户端下线通知）
router.post('/nodes/:nodeId/status', authenticateAPIKey, (req, res) => {
    const { nodeId } = req.params;
    const { status } = req.body;
    
    console.log(`📡 节点 ${nodeId} 状态更新: ${status}`);
    
    let statusValue = 1; // 默认在线
    if (status === 'offline') {
        statusValue = 0;
    }
    
    db.run(`
        UPDATE vps_nodes 
        SET status = ?, last_seen = CURRENT_TIMESTAMP 
        WHERE id = ?
    `, [statusValue, nodeId], function(err) {
        if (err) {
            console.error('状态更新失败:', err);
            return res.status(500).json({ error: '状态更新失败' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '节点不存在' });
        }
        
        console.log(`✅ 节点 ${nodeId} 状态更新为: ${status}`);
        
        res.json({
            success: true,
            message: '状态更新成功',
            nodeId: nodeId,
            status: status
        });
    });
});

module.exports = router;