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

        // VPS节点表 - 增强版本，包含地理位置信息
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
                // 检查并迁移现有表结构
                setTimeout(() => {
                    migrateDatabase();
                }, 1000);
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

// 数据库迁移 - 添加地理位置字段
function migrateDatabase() {
    console.log('🔄 检查数据库表结构...');
    
    // 检查是否需要添加地理位置字段
    db.all("PRAGMA table_info(vps_nodes)", (err, columns) => {
        if (err) {
            console.error('检查表结构失败:', err);
            return;
        }
        
        const columnNames = columns.map(col => col.name);
        const hasNewColumns = columnNames.includes('country_code');
        
        if (!hasNewColumns) {
            console.log('📊 添加地理位置字段到 vps_nodes 表...');
            
            const alterStatements = [
                'ALTER TABLE vps_nodes ADD COLUMN country_code TEXT',
                'ALTER TABLE vps_nodes ADD COLUMN country_name TEXT', 
                'ALTER TABLE vps_nodes ADD COLUMN city TEXT',
                'ALTER TABLE vps_nodes ADD COLUMN region TEXT',
                'ALTER TABLE vps_nodes ADD COLUMN isp TEXT'
            ];
            
            let completedAlters = 0;
            
            alterStatements.forEach((statement, index) => {
                db.run(statement, (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        console.error(`执行 ALTER 语句失败 (${index + 1}):`, err.message);
                    } else {
                        console.log(`✅ 添加字段完成 (${index + 1}/${alterStatements.length})`);
                    }
                    
                    completedAlters++;
                    if (completedAlters === alterStatements.length) {
                        console.log('✅ 数据库迁移完成');
                        
                        // 迁移完成后，清理和修复现有数据
                        setTimeout(() => {
                            cleanAndFixExistingData();
                        }, 2000);
                    }
                });
            });
        } else {
            console.log('✅ 数据库表结构已是最新版本');
            // 即使表结构是最新的，也清理和修复数据
            setTimeout(() => {
                cleanAndFixExistingData();
            }, 2000);
        }
    });
}

// 清理和修复现有数据
function cleanAndFixExistingData() {
    console.log('🧹 开始清理和修复现有数据...');
    
    db.all(`
        SELECT id, name, location, provider, ip_address, country_code, country_name, city, region, isp
        FROM vps_nodes 
        WHERE (
            (provider LIKE '%,%' AND provider LIKE '%Singapore%') OR
            (ip_address IS NOT NULL AND ip_address != '' AND (country_code IS NULL OR country_code = '' OR country_code = 'XX'))
        )
        LIMIT 10
    `, async (err, nodes) => {
        if (err) {
            console.error('查询需要修复的节点失败:', err);
            return;
        }
        
        if (nodes.length === 0) {
            console.log('✅ 所有节点数据都已完整');
            return;
        }
        
        console.log(`🔧 发现 ${nodes.length} 个节点需要修复`);
        
        // 动态导入地理位置检测工具
        try {
            const { getLocationInfo } = require('../utils/location');
            
            for (const node of nodes) {
                try {
                    console.log(`🔧 修复节点 ${node.name} (ID: ${node.id})`);
                    
                    let updates = [];
                    let values = [];
                    
                    // 修复提供商名称
                    if (node.provider && node.provider.includes(',') && node.provider.includes('Singapore')) {
                        let cleanProvider = node.provider;
                        console.log(`   原始提供商: "${cleanProvider}"`);
                        
                        const parts = cleanProvider.split(',');
                        if (parts.length > 1) {
                            let ispPart = parts[parts.length - 1].trim();
                            ispPart = ispPart.replace(/^Singapore\s*/gi, '');
                            ispPart = ispPart.replace(/(\w+)\1+/gi, '$1'); // 移除重复单词
                            if (ispPart && ispPart.length > 2) {
                                cleanProvider = ispPart;
                            }
                        }
                        
                        if (cleanProvider !== node.provider) {
                            console.log(`   🏢 修复提供商: "${node.provider}" -> "${cleanProvider}"`);
                            updates.push('provider = ?');
                            values.push(cleanProvider);
                        }
                    }
                    
                    // 检测地理位置信息
                    if (node.ip_address && (!node.country_code || node.country_code === 'XX')) {
                        console.log(`   🌐 检测地理位置: ${node.ip_address}`);
                        
                        const locationInfo = await getLocationInfo(node.ip_address);
                        
                        if (locationInfo && locationInfo.country_code && locationInfo.country_code !== 'XX') {
                            console.log(`   ✅ 地理位置检测成功: ${locationInfo.country} (${locationInfo.country_code})`);
                            console.log(`   📍 ISP: ${locationInfo.isp}`);
                            
                            updates.push('country_code = ?', 'country_name = ?', 'city = ?', 'region = ?', 'isp = ?');
                            values.push(
                                locationInfo.country_code,
                                locationInfo.country,
                                locationInfo.city,
                                locationInfo.region,
                                locationInfo.isp
                            );
                            
                            // 如果位置信息是待检测状态，也更新
                            if (node.location === 'Auto-detect' || node.location === '待检测') {
                                updates.push('location = ?');
                                values.push(locationInfo.location_string);
                                console.log(`   📍 更新位置: ${locationInfo.location_string}`);
                            }
                        } else {
                            console.log(`   ❌ 地理位置检测失败`);
                        }
                        
                        // 添加延迟避免请求过于频繁
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    
                    // 执行更新
                    if (updates.length > 0) {
                        values.push(node.id);
                        const updateSQL = `UPDATE vps_nodes SET ${updates.join(', ')} WHERE id = ?`;
                        
                        const updateStmt = db.prepare(updateSQL);
                        updateStmt.run(values, function(updateErr) {
                            if (updateErr) {
                                console.error(`   ❌ 更新节点失败:`, updateErr);
                            } else {
                                console.log(`   ✅ 节点更新成功`);
                            }
                        });
                        updateStmt.finalize();
                    } else {
                        console.log(`   ℹ️ 节点无需修复`);
                    }
                    
                } catch (error) {
                    console.error(`   ❌ 修复节点 ${node.name} 时出错:`, error);
                }
            }
            
            console.log('✅ 数据清理和修复完成');
            
        } catch (importError) {
            console.log('⚠️ 无法导入地理位置检测工具，跳过自动修复');
        }
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
    initDatabase,
    migrateDatabase,
    cleanAndFixExistingData
};