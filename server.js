const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, db } = require('./config/database');
const { cleanOldData, statusCheckTask } = require('./utils/tasks');

// 路由模块
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const nodesRoutes = require('./routes/nodes');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // 提供静态文件

// 初始化数据库
initDatabase();

// 注册路由
app.use('/api/admin', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', nodesRoutes);
app.use('/api', statsRoutes);

// 提供前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 提供管理后台页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 启动定时任务
setInterval(cleanOldData, 6 * 60 * 60 * 1000); // 每6小时清理数据
setInterval(statusCheckTask, 2 * 60 * 1000); // 每2分钟检查状态

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`VPS监控API服务器运行在端口 ${PORT}`);
    console.log(`访问 http://localhost:${PORT} 查看状态页面`);
    console.log(`访问 http://localhost:${PORT}/admin 进入管理后台`);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    db.close((err) => {
        if (err) {
            console.error('关闭数据库连接失败:', err);
        } else {
            console.log('数据库连接已关闭');
        }
        process.exit(0);
    });
});