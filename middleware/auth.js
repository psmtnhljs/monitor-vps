const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

// JWT密钥（生产环境应该使用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// JWT认证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '缺少访问令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效' });
        }
        req.user = user;
        next();
    });
}

// API密钥认证中间件
function authenticateAPIKey(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '缺少API密钥' });
    }
    
    const providedKey = authHeader.substring(7);
    
    // 从数据库获取当前API密钥
    db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['api_key'], (err, row) => {
        if (err || !row) {
            return res.status(500).json({ error: '服务器配置错误' });
        }
        
        if (providedKey !== row.config_value) {
            return res.status(401).json({ error: 'API密钥无效' });
        }
        
        next();
    });
}

module.exports = {
    authenticateToken,
    authenticateAPIKey,
    JWT_SECRET
};