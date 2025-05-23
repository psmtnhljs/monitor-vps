#!/usr/bin/env node
/**
 * 数据库清理脚本
 * 用于清理重复节点和无效数据
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.argv[2] || 'vps_monitor.db';

console.log(`正在清理数据库: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        process.exit(1);
    }
    console.log('数据库连接成功');
});

async function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}

async function getRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function cleanupDatabase() {
    try {
        console.log('\n=== 开始数据库清理 ===');
        
        // 1. 查看当前节点状态
        console.log('\n1. 当前节点列表:');
        const nodes = await getRows(`
            SELECT id, name, location, ip_address, 
                   datetime(last_seen, 'localtime') as last_seen_local,
                   CASE 
                       WHEN datetime(last_seen) > datetime('now', '-10 minutes') THEN 'online'
                       WHEN datetime(last_seen) > datetime('now', '-1 hour') THEN 'warning'
                       ELSE 'offline'
                   END as status
            FROM vps_nodes 
            ORDER BY ip_address, last_seen DESC
        `);
        
        nodes.forEach(node => {
            console.log(`  ID: ${node.id}, 名称: ${node.name}, IP: ${node.ip_address}, 状态: ${node.status}, 最后在线: ${node.last_seen_local}`);
        });
        
        // 2. 查找重复IP的节点
        console.log('\n2. 查找重复IP节点:');
        const duplicates = await getRows(`
            SELECT ip_address, COUNT(*) as count, 
                   GROUP_CONCAT(id) as node_ids,
                   GROUP_CONCAT(name) as node_names
            FROM vps_nodes 
            GROUP BY ip_address 
            HAVING COUNT(*) > 1
        `);
        
        if (duplicates.length === 0) {
            console.log('  没有发现重复IP节点');
        } else {
            for (const dup of duplicates) {
                console.log(`  IP: ${dup.ip_address} 有 ${dup.count} 个节点:`);
                console.log(`    节点IDs: ${dup.node_ids}`);
                console.log(`    节点名称: ${dup.node_names}`);
                
                // 保留最近活跃的节点，删除其他的
                const nodeIds = dup.node_ids.split(',').map(id => parseInt(id));
                
                // 获取每个节点的详细信息
                const nodeDetails = await getRows(`
                    SELECT id, name, last_seen, 
                           (SELECT COUNT(*) FROM test_results WHERE node_id = vps_nodes.id) as test_count
                    FROM vps_nodes 
                    WHERE id IN (${nodeIds.join(',')})
                    ORDER BY last_seen DESC, test_count DESC
                `);
                
                // 保留第一个（最活跃的）节点
                const keepNode = nodeDetails[0];
                const deleteNodes = nodeDetails.slice(1);
                
                console.log(`    保留节点: ID ${keepNode.id} (${keepNode.name}), 测试记录: ${keepNode.test_count}`);
                
                for (const deleteNode of deleteNodes) {
                    console.log(`    删除节点: ID ${deleteNode.id} (${deleteNode.name}), 测试记录: ${deleteNode.test_count}`);
                    
                    // 将测试记录迁移到保留的节点
                    if (deleteNode.test_count > 0) {
                        const updateResult = await runQuery(`
                            UPDATE test_results 
                            SET node_id = ? 
                            WHERE node_id = ?
                        `, [keepNode.id, deleteNode.id]);
                        console.log(`      迁移了 ${updateResult.changes} 条测试记录`);
                    }
                    
                    // 删除重复节点
                    const deleteResult = await runQuery(`
                        DELETE FROM vps_nodes WHERE id = ?
                    `, [deleteNode.id]);
                    console.log(`      删除节点成功`);
                }
            }
        }
        
        // 3. 清理离线超过7天的节点
        console.log('\n3. 清理长期离线节点:');
        const offlineNodes = await getRows(`
            SELECT id, name, ip_address, 
                   datetime(last_seen, 'localtime') as last_seen_local,
                   (SELECT COUNT(*) FROM test_results WHERE node_id = vps_nodes.id) as test_count
            FROM vps_nodes 
            WHERE last_seen < datetime('now', '-7 days')
        `);
        
        if (offlineNodes.length === 0) {
            console.log('  没有长期离线的节点');
        } else {
            for (const node of offlineNodes) {
                console.log(`  离线节点: ${node.name} (${node.ip_address}), 最后在线: ${node.last_seen_local}, 测试记录: ${node.test_count}`);
                
                // 询问是否删除
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const answer = await new Promise(resolve => {
                    rl.question(`    是否删除此节点？(y/N): `, resolve);
                });
                
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    // 删除测试记录
                    const deleteTestsResult = await runQuery(`
                        DELETE FROM test_results WHERE node_id = ?
                    `, [node.id]);
                    console.log(`      删除了 ${deleteTestsResult.changes} 条测试记录`);
                    
                    // 删除节点
                    await runQuery(`DELETE FROM vps_nodes WHERE id = ?`, [node.id]);
                    console.log(`      节点删除成功`);
                } else {
                    console.log(`      跳过节点 ${node.name}`);
                }
                
                rl.close();
            }
        }
        
        // 4. 清理旧的测试数据
        console.log('\n4. 清理旧测试数据:');
        const oldDataCount = await getRows(`
            SELECT COUNT(*) as count FROM test_results 
            WHERE test_time < datetime('now', '-7 days')
        `);
        
        if (oldDataCount[0].count > 0) {
            console.log(`  发现 ${oldDataCount[0].count} 条超过7天的测试记录`);
            const deleteOldResult = await runQuery(`
                DELETE FROM test_results 
                WHERE test_time < datetime('now', '-7 days')
            `);
            console.log(`  删除了 ${deleteOldResult.changes} 条旧测试记录`);
        } else {
            console.log('  没有超过7天的测试记录');
        }
        
        // 5. 优化数据库
        console.log('\n5. 优化数据库...');
        await runQuery('VACUUM');
        console.log('  数据库优化完成');
        
        // 6. 显示清理后的统计信息
        console.log('\n6. 清理后的统计信息:');
        const finalStats = await getRows(`
            SELECT 
                (SELECT COUNT(*) FROM vps_nodes) as total_nodes,
                (SELECT COUNT(*) FROM vps_nodes WHERE datetime(last_seen) > datetime('now', '-10 minutes')) as online_nodes,
                (SELECT COUNT(*) FROM test_results) as total_tests,
                (SELECT COUNT(*) FROM test_results WHERE test_time > datetime('now', '-24 hours')) as recent_tests
        `);
        
        const stats = finalStats[0];
        console.log(`  总节点数: ${stats.total_nodes}`);
        console.log(`  在线节点: ${stats.online_nodes}`);
        console.log(`  总测试记录: ${stats.total_tests}`);
        console.log(`  近24小时测试: ${stats.recent_tests}`);
        
        console.log('\n=== 数据库清理完成 ===');
        
    } catch (error) {
        console.error('清理过程出错:', error);
    } finally {
        db.close();
    }
}

// 检查命令行参数
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
使用方法: node cleanup.js [数据库路径]

选项:
  数据库路径    SQLite数据库文件路径 (默认: vps_monitor.db)
  --help, -h   显示此帮助信息

示例:
  node cleanup.js
  node cleanup.js /path/to/vps_monitor.db
    `);
    process.exit(0);
}

// 运行清理
cleanupDatabase().catch(console.error);