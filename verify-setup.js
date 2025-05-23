// verify-setup.js - 验证项目结构和依赖
const fs = require('fs');
const path = require('path');

console.log('🔍 验证VPS监控系统项目结构...\n');

// 检查必要文件
const requiredFiles = [
    'package.json',
    'server.js',
    'config/database.js',
    'middleware/auth.js',
    'routes/auth.js',
    'routes/admin.js',
    'routes/nodes.js',
    'routes/stats.js',
    'utils/helpers.js',
    'utils/tasks.js',
    'public/index.html',
    'public/admin.html'
];

console.log('📁 检查文件结构:');
let missingFiles = [];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - 缺失`);
        missingFiles.push(file);
    }
});

// 检查依赖
console.log('\n📦 检查package.json依赖:');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = ['express', 'sqlite3', 'cors', 'bcrypt', 'jsonwebtoken', 'node-fetch'];
    
    requiredDeps.forEach(dep => {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
            console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
        } else {
            console.log(`❌ ${dep} - 未安装`);
            missingFiles.push(`dependency: ${dep}`);
        }
    });
} catch (error) {
    console.log('❌ 无法读取package.json');
    missingFiles.push('package.json');
}

// 检查数据库
console.log('\n🗄️ 检查数据库:');
if (fs.existsSync('vps_monitor.db')) {
    console.log('✅ vps_monitor.db 存在');
} else {
    console.log('⚪ vps_monitor.db 不存在 (首次运行时会自动创建)');
}

// 生成报告
console.log('\n📋 验证报告:');
if (missingFiles.length === 0) {
    console.log('🎉 所有必要文件和依赖都已就绪！');
    console.log('\n🚀 启动建议:');
    console.log('1. npm install (如果还没安装依赖)');
    console.log('2. node server.js');
    console.log('3. 访问 http://localhost:3000/debug 进行测试');
} else {
    console.log('⚠️ 发现以下问题:');
    missingFiles.forEach(file => {
        console.log(`   - ${file}`);
    });
    console.log('\n🔧 解决建议:');
    console.log('1. 确保按照模块化结构创建所有文件');
    console.log('2. 运行 npm install 安装依赖');
    console.log('3. 检查文件路径和名称是否正确');
}

// 输出目录结构
console.log('\n📂 期望的目录结构:');
console.log(`
vps-monitor/
├── server.js
├── package.json
├── config/
│   └── database.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js
│   ├── admin.js
│   ├── nodes.js
│   └── stats.js
├── utils/
│   ├── helpers.js
│   └── tasks.js
├── public/
│   ├── index.html
│   ├── admin.html
│   └── debug.html
└── vps_monitor.db (自动创建)
`);

console.log('\n🔗 有用的命令:');
console.log('- node verify-setup.js  # 运行此验证脚本');
console.log('- npm install           # 安装依赖');
console.log('- node server.js        # 启动服务器');
console.log('- curl http://localhost:3000/health  # 健康检查');