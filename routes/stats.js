const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// 系统统计信息
router.get('/stats', (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM vps_nodes WHERE status = 1 AND is_placeholder = 0) as total_nodes,
            (SELECT COUNT(*) FROM vps_nodes WHERE datetime(last_seen) > datetime('now', '-6 minutes') AND is_placeholder = 0) as online_nodes,
            (SELECT COUNT(*) FROM test_results WHERE test_time > datetime('now', '-1 hour')) as recent_tests,
            (SELECT COUNT(DISTINCT isp_name) FROM test_results) as monitored_isps
    `, (err, row) => {
        if (err) {
            console.error('获取统计信息失败:', err);
            return res.status(500).json({ error: '查询失败' });
        }
        
        res.json(row);
    });
});

module.exports = router;