const { db } = require('../config/database');

// 数据清理任务 - 删除7天前的数据
function cleanOldData() {
    // 检查表是否存在
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='test_results'", (err, row) => {
        if (err) {
            console.error('检查表存在性失败:', err);
            return;
        }
        
        if (!row) {
            console.log('test_results表不存在，跳过数据清理');
            return;
        }
        
        // 表存在，执行清理
        db.run(`
            DELETE FROM test_results 
            WHERE test_time < datetime('now', '-7 days')
        `, function(err) {
            if (err) {
                console.error('数据清理失败:', err);
            } else {
                if (this.changes > 0) {
                    console.log(`清理了 ${this.changes} 条过期数据`);
                }
            }
        });
    });
}

// 定期状态检查任务
function statusCheckTask() {
    // 检查表是否存在
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='vps_nodes'", (err, row) => {
        if (err || !row) {
            console.log('vps_nodes表不存在，跳过状态检查');
            return;
        }
        
        // 自动将长时间无响应的节点标记为离线
        db.run(`
            UPDATE vps_nodes 
            SET status = 0 
            WHERE datetime(last_seen) < datetime('now', '-6 minutes') 
            AND status = 1
            AND is_placeholder = 0
        `, function(err) {
            if (err) {
                console.error('自动状态检查失败:', err);
            } else if (this.changes > 0) {
                console.log(`自动将 ${this.changes} 个节点标记为离线`);
            }
        });
    });
}

module.exports = {
    cleanOldData,
    statusCheckTask
};