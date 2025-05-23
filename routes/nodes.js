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

module.exports = router;