const express = require('express');
const { db } = require('../config/database');
const { generateClientCode } = require('../utils/helpers');

const router = express.Router();

// 公开的一键安装脚本端点
router.get('/install/:nodeId/:token', (req, res) => {
    const { nodeId, token } = req.params;
    
    console.log(`📜 公开安装脚本请求: 节点ID ${nodeId}, Token: ${token.substring(0, 8)}...`);
    
    // 验证安装令牌
    db.get(`
        SELECT vn.*, sc.config_value as api_key 
        FROM vps_nodes vn, system_config sc 
        WHERE vn.id = ? AND vn.is_placeholder = 1 AND sc.config_key = 'api_key'
    `, [nodeId], (err, result) => {
        if (err) {
            console.error('❌ 查询节点失败:', err);
            return res.status(500).send('#!/bin/bash\necho "安装失败: 数据库错误"\nexit 1');
        }
        
        if (!result) {
            console.log(`❌ 节点 ${nodeId} 不存在或不是空白节点`);
            return res.status(404).send('#!/bin/bash\necho "安装失败: 节点不存在或已激活"\nexit 1');
        }
        
        // 生成安装令牌进行简单验证 (基于节点信息的哈希)
        const crypto = require('crypto');
        const expectedToken = crypto
            .createHash('md5')
            .update(`${nodeId}-${result.name}-${result.api_key}`)
            .digest('hex')
            .substring(0, 16);
        
        if (token !== expectedToken) {
            console.log(`❌ 安装令牌无效: 期望 ${expectedToken}, 收到 ${token}`);
            return res.status(403).send('#!/bin/bash\necho "安装失败: 安装令牌无效"\nexit 1');
        }
        
        const node = result;
        const apiKey = result.api_key;
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        
        console.log(`✅ 为节点 ${node.name} 生成公开安装脚本`);
        
        // 处理文件名，确保只包含ASCII安全字符
        const safeFileName = node.name.replace(/[^a-zA-Z0-9\-_]/g, '_');
        
        // 设置正确的Content-Type
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vps-monitor-${safeFileName}.sh"`);
        
        const installScript = generateInstallScript(node, apiKey, serverUrl, nodeId, token);
        res.send(installScript);
    });
});

// 生成完整的安装脚本
function generateInstallScript(node, apiKey, serverUrl, nodeId, token) {
    return `#!/bin/bash
# VPS网络监测客户端一键安装脚本
# 节点: ${node.name}
# 生成时间: ${new Date().toLocaleString()}
# 
# 使用方法:
# curl -fsSL ${serverUrl}/api/install/${nodeId}/${token} | bash
#

set -e

# 颜色输出
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# 输出函数
log_info() {
    echo -e "\${BLUE}[INFO]\${NC} \$1"
}

log_success() {
    echo -e "\${GREEN}[SUCCESS]\${NC} \$1"
}

log_warning() {
    echo -e "\${YELLOW}[WARNING]\${NC} \$1"
}

log_error() {
    echo -e "\${RED}[ERROR]\${NC} \$1"
}

# 检查是否为root用户
if [[ \$EUID -ne 0 ]]; then
   log_error "此脚本需要root权限运行"
   log_info "请使用: sudo curl -fsSL ${serverUrl}/api/install/${nodeId}/${token} | bash"
   exit 1
fi

log_info "🚀 开始安装VPS网络监测客户端..."
log_info "节点名称: ${node.name}"
log_info "节点位置: ${node.location}"
log_info "服务器地址: ${serverUrl}"

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=\$ID
    VER=\$VERSION_ID
else
    log_error "无法检测操作系统版本"
    exit 1
fi

log_info "检测到操作系统: \$OS \$VER"

# 安装Python3和pip
log_info "📦 检查并安装Python3..."
if ! command -v python3 &> /dev/null; then
    log_warning "Python3未安装，正在安装..."
    case \$OS in
        ubuntu|debian)
            apt update
            apt install -y python3 python3-pip python3-venv
            ;;
        centos|rhel|fedora)
            if command -v dnf &> /dev/null; then
                dnf install -y python3 python3-pip
            else
                yum install -y python3 python3-pip
            fi
            ;;
        alpine)
            apk add --no-cache python3 py3-pip
            ;;
        *)
            log_error "不支持的操作系统: \$OS"
            log_info "请手动安装Python3和pip3"
            exit 1
            ;;
    esac
    log_success "Python3安装完成"
else
    log_success "Python3已安装: \$(python3 --version)"
fi

# 检查pip3
if ! command -v pip3 &> /dev/null; then
    log_info "安装pip3..."
    python3 -m ensurepip --upgrade 2>/dev/null || true
    python3 -m pip install --upgrade pip 2>/dev/null || true
fi

# 安装Python依赖
log_info "📦 安装Python依赖包..."

# 优先尝试系统包管理器安装
DEPS_INSTALLED=0

case \$OS in
    ubuntu|debian)
        log_info "尝试通过apt安装Python依赖..."
        if apt install -y python3-aiohttp python3-requests 2>/dev/null; then
            log_success "通过系统包管理器安装依赖完成"
            DEPS_INSTALLED=1
        fi
        ;;
    centos|rhel|fedora)
        log_info "尝试通过包管理器安装Python依赖..."
        if command -v dnf &> /dev/null; then
            dnf install -y python3-aiohttp python3-requests 2>/dev/null && DEPS_INSTALLED=1
        else
            yum install -y python3-aiohttp python3-requests 2>/dev/null && DEPS_INSTALLED=1
        fi
        ;;
    alpine)
        log_info "尝试通过apk安装Python依赖..."
        apk add --no-cache py3-aiohttp py3-requests 2>/dev/null && DEPS_INSTALLED=1
        ;;
esac

# 如果系统包管理器安装失败，使用pip
if [ \$DEPS_INSTALLED -eq 0 ]; then
    log_info "系统包管理器安装失败，尝试使用pip..."
    
    # 尝试多种pip安装方法
    if pip3 install aiohttp requests --quiet 2>/dev/null; then
        log_success "pip安装依赖完成"
    elif pip3 install aiohttp requests --break-system-packages --quiet 2>/dev/null; then
        log_success "pip安装依赖完成（使用--break-system-packages）"
        log_warning "已使用--break-system-packages参数，这可能影响系统Python环境"
    elif python3 -m pip install aiohttp requests --break-system-packages --quiet 2>/dev/null; then
        log_success "pip安装依赖完成（使用python3 -m pip）"
    else
        log_error "Python依赖安装失败"
        log_info "请手动安装依赖后重新运行："
        log_info "  Debian/Ubuntu: apt install python3-aiohttp python3-requests"
        log_info "  或使用: pip3 install aiohttp requests --break-system-packages"
        exit 1
    fi
else
    log_success "Python依赖安装完成"
fi

# 创建工作目录
WORK_DIR="/opt/vps-monitor"
log_info "📁 创建工作目录: \$WORK_DIR"
mkdir -p \$WORK_DIR
cd \$WORK_DIR

# 停止现有服务（如果存在）
if systemctl is-active --quiet vps-monitor 2>/dev/null; then
    log_info "🛑 停止现有服务..."
    systemctl stop vps-monitor
fi

# 创建客户端程序
log_info "⬇️ 创建客户端程序..."
cat > vps_client.py << 'EOF'
${generateClientCode()}
EOF

# 创建配置文件
log_info "⚙️ 创建配置文件..."
cat > config.json << 'EOF'
{
  "node_info": {
    "name": "${node.name}",
    "location": "${node.location}",
    "provider": "${node.provider}",
    "ip_address": "auto"
  },
  "api_endpoint": "${serverUrl}",
  "api_key": "${apiKey}",
  "test_interval": 300,
  "test_targets": {
    "china_telecom": [
      {"ip": "202.96.209.133", "port": 80, "name": "上海电信"},
      {"ip": "61.139.2.69", "port": 80, "name": "北京电信"}
    ],
    "china_unicom": [
      {"ip": "221.5.88.88", "port": 80, "name": "北京联通"},
      {"ip": "123.125.114.144", "port": 80, "name": "上海联通"}
    ],
    "china_mobile": [
      {"ip": "221.179.155.161", "port": 80, "name": "北京移动"},
      {"ip": "117.131.9.2", "port": 80, "name": "上海移动"}
    ]
  }
}
EOF

# 设置权限
chmod +x vps_client.py

# 创建systemd服务
log_info "🔧 创建系统服务..."
cat > /etc/systemd/system/vps-monitor.service << 'EOF'
[Unit]
Description=VPS Network Monitor Client - ${node.name}
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vps-monitor
ExecStart=/usr/bin/python3 vps_client.py --daemon
Restart=always
RestartSec=30
Environment=PYTHONPATH=/opt/vps-monitor
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd并启动服务
log_info "🔄 启动监控服务..."
systemctl daemon-reload
systemctl enable vps-monitor
systemctl start vps-monitor

# 等待服务启动
sleep 3

# 检查服务状态
if systemctl is-active --quiet vps-monitor; then
    log_success "✅ VPS监控服务启动成功！"
else
    log_error "❌ VPS监控服务启动失败"
    log_info "查看错误日志: journalctl -u vps-monitor --no-pager -l"
    exit 1
fi

# 显示安装结果
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "🎉 VPS网络监测客户端安装完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
log_info "📊 服务状态: systemctl status vps-monitor"
log_info "📋 查看日志: journalctl -u vps-monitor -f"
log_info "🔧 配置文件: /opt/vps-monitor/config.json"
log_info "🌐 监控面板: ${serverUrl}"
echo
log_info "常用命令:"
echo "  启动服务: systemctl start vps-monitor"
echo "  停止服务: systemctl stop vps-monitor"
echo "  重启服务: systemctl restart vps-monitor"
echo "  查看状态: systemctl status vps-monitor"
echo "  查看日志: journalctl -u vps-monitor -f"
echo
log_success "节点 '${node.name}' 已成功连接到监控系统！"
`;
}

module.exports = router;