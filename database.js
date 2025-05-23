const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { generateAPIKey } = require('../utils/helpers');

// 初始化SQLite数据库
const db = new sqlite3.Database('vps_monitor.db', (err) => {
    if (err) {
        console.error('数据库连接失败:', err);
    } else {
        console.log('SQLite数据库连接成功');
    }
});

// 初始化数据库表
function initDatabase() {
    db.serialize(() => {
        // 管理员用户表
        db.run(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )
        `, (err) => {
            if (err) {
                console.error('创建admin_users表失败:', err);
            } else {
                console.log('admin_users表创建成功');
                createDefaultAdmin();
            }
        });

        // 系统配置表
        db.run(`
            CREATE TABLE IF NOT EXISTS system_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT UNIQUE NOT NULL,
                config_value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('创建system_config表失败:', err);
            } else {
                console.log('system_config表创建成功');
                initDefaultConfig();
            }
        });

        // VPS节点表 - 包含所有必需字段
        db.run(`
            CREATE TABLE IF NOT EXISTS vps_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                provider TEXT NOT NULL,
                ip_address TEXT,
                status BOOLEAN DEFAULT 1,
                is_placeholder BOOLEAN DEFAULT 0,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                country_code TEXT,
                country_name TEXT,
                city TEXT,
                region TEXT,
                isp TEXT,
                UNIQUE(name)
            )
        `, (err) => {
            if (err) {
                console.error('创建vps_nodes表失败:', err);
            } else {
                console.log('vps_nodes表创建成功');
            }
        });

        // 测试结果表
        db.run(`
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER,
                isp_name TEXT NOT NULL,
                target_ip TEXT NOT NULL,
                test_type TEXT NOT NULL,
                avg_latency REAL,
                packet_loss REAL,
                jitter REAL,
                test_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                raw_data TEXT,
                FOREIGN KEY (node_id) REFERENCES vps_nodes (id)
            )
        `, (err) => {
            if (err) {
                console.error('创建test_results表失败:', err);
            } else {
                console.log('test_results表创建成功');
            }
        });

        // 创建索引
        createIndexes();
        console.log('数据库表初始化完成');
    });
}

// 创建索引
function createIndexes() {
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_test_time ON test_results(test_time)',
        'CREATE INDEX IF NOT EXISTS idx_node_isp ON test_results(node_id, isp_name)',
        'CREATE INDEX IF NOT EXISTS idx_nodes_name ON vps_nodes(name)',
        'CREATE INDEX IF NOT EXISTS idx_nodes_country ON vps_nodes(country_code)',
        'CREATE INDEX IF NOT EXISTS idx_nodes_status ON vps_nodes(status, is_placeholder)'
    ];

    indexes.forEach(indexSQL => {
        db.run(indexSQL, (err) => {
            if (err) {
                console.error('创建索引失败:', err);
            }
        });
    });
}

// 创建默认管理员账户
async function createDefaultAdmin() {
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';

    db.get('SELECT id FROM admin_users WHERE username = ?', [defaultUsername], async (err, row) => {
        if (err) {
            console.error('检查默认管理员失败:', err);
            return;
        }

        if (!row) {
            try {
                const hashedPassword = await bcrypt.hash(defaultPassword, 10);
                db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', 
                    [defaultUsername, hashedPassword], (err) => {
                    if (err) {
                        console.error('创建默认管理员失败:', err);
                    } else {
                        console.log(`默认管理员创建成功: ${defaultUsername}/${defaultPassword}`);
                        console.log('⚠️  请尽快修改默认密码！');
                    }
                });
            } catch (error) {
                console.error('密码哈希失败:', error);
            }
        }
    });
}

// 初始化默认配置
function initDefaultConfig() {
    const defaultConfigs = [
        { key: 'api_key', value: generateAPIKey() },
        { key: 'site_title', value: 'VPS网络质量监测' },
        { key: 'test_interval', value: '300' },
        { key: 'show_ip_to_public', value: 'false' }
    ];

    defaultConfigs.forEach(config => {
        db.run(`INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES (?, ?)`,
            [config.key, config.value], (err) => {
            if (err) {
                console.error(`初始化配置 ${config.key} 失败:`, err);
            }
        });
    });
}

module.exports = {
    db,
    initDatabase
};