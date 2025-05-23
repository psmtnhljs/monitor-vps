const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// 管理员登录
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('登录查询失败:', err);
            return res.status(500).json({ error: '服务器错误' });
        }

        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        try {
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: '用户名或密码错误' });
            }

            // 更新最后登录时间
            db.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

            // 生成JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    lastLogin: user.last_login
                }
            });
        } catch (error) {
            console.error('密码验证失败:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    });
});

// 修改管理员密码
router.post('/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '当前密码和新密码不能为空' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度至少6位' });
    }

    db.get('SELECT password_hash FROM admin_users WHERE id = ?', [req.user.userId], async (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: '用户不存在' });
        }

        try {
            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: '当前密码错误' });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            db.run('UPDATE admin_users SET password_hash = ? WHERE id = ?', 
                [hashedNewPassword, req.user.userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: '密码更新失败' });
                }
                res.json({ success: true, message: '密码修改成功' });
            });
        } catch (error) {
            console.error('密码修改失败:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    });
});

module.exports = router;