const express = require('express');
const { db } = require('../config/database');
const { generateClientCode } = require('../utils/helpers');

const router = express.Router();
// 在 routes/oneclick.js 文件的开头添加这个路由定义
// 放在现有的 generateInstallScript 函数之前

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
        
        // 设置正确的Content-Type
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vps-monitor-${node.name.replace(/[^a-zA-Z0-9\-_]/g, '_')}.sh"`);
        
        const installScript = generateInstallScript(node, apiKey, serverUrl, nodeId, token);
        res.send(installScript);
    });
});
// 生成完整的安装脚本 - UTC时间支持版本
function generateInstallScript(node, apiKey, serverUrl, nodeId, token) {
    return `#!/bin/bash
# VPS网络监测客户端一键安装脚本 (UTC时间支持版)
# 节点: ${node.name} (ID: ${nodeId})
# 生成时间: ${new Date().toISOString()}
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

log_info "🚀 开始安装VPS网络监测客户端 (UTC时间支持版)..."
log_info "节点名称: ${node.name}"
log_info "节点ID: ${nodeId}"
log_info "服务器地址: ${serverUrl}"

# 显示时区信息
log_info "📅 当前系统时间信息:"
log_info "   本地时间: \$(date)"
log_info "   UTC时间: \$(date -u)"
log_info "   时区: \$(timedatectl 2>/dev/null | grep 'Time zone' | awk '{print \$3, \$4}' || echo '未知')"
log_warning "客户端将使用UTC时间记录数据，与主控面板保持一致"

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
            apt install -y python3 python3-pip python3-venv curl iputils-ping net-tools
            ;;
        centos|rhel|fedora)
            if command -v dnf &> /dev/null; then
                dnf install -y python3 python3-pip curl iputils net-tools
            else
                yum install -y python3 python3-pip curl iputils net-tools
            fi
            ;;
        alpine)
            apk add --no-cache python3 py3-pip curl iputils
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

# 创建客户端程序 - UTC时间支持版本
log_info "⬇️ 创建客户端程序 (UTC时间支持版)..."
cat > vps_client.py << 'EOF'
#!/usr/bin/env python3
"""
VPS网络测试客户端 - UTC时间支持版本
自动使用UTC时间记录所有测试数据，解决时区不一致问题
"""

import asyncio
import aiohttp
import subprocess
import json
import time
import logging
import socket
import statistics
from datetime import datetime, timezone
from typing import Dict, List, Optional
import argparse
import sys
import os

# 配置日志 - 显示UTC时间
class UTCFormatter(logging.Formatter):
    """UTC时间格式化器"""
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=timezone.utc)
        if datefmt:
            s = dt.strftime(datefmt)
        else:
            s = dt.strftime('%Y-%m-%d %H:%M:%S UTC')
        return s

# 设置日志格式
formatter = UTCFormatter('%(asctime)s - %(levelname)s - %(message)s')

# 文件处理器
file_handler = logging.FileHandler('vps_monitor.log')
file_handler.setFormatter(formatter)

# 控制台处理器
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)

# 配置根日志器
logging.basicConfig(
    level=logging.INFO,
    handlers=[file_handler, console_handler]
)

logger = logging.getLogger(__name__)

class NetworkTester:
    def __init__(self, config_file: str = 'config.json'):
        """初始化网络测试器"""
        self.config = self.load_config(config_file)
        self.node_id = None
        self.session = None
        
        # 启动时显示时区信息
        self.log_timezone_info()
        
    def log_timezone_info(self):
        """记录时区信息"""
        now = datetime.now()
        utc_now = datetime.now(timezone.utc)
        
        logger.info("=" * 60)
        logger.info("🌍 时区信息:")
        logger.info(f"  本地时间: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        logger.info(f"  UTC时间: {utc_now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        logger.info(f"  时区偏移: {now.strftime('%z')}")
        logger.info(f"  ⚡ 客户端将使用UTC时间记录所有数据")
        logger.info("=" * 60)
        
    def load_config(self, config_file: str) -> Dict:
        """加载配置文件"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            required_fields = ['node_info', 'api_endpoint', 'test_targets']
            for field in required_fields:
                if field not in config:
                    raise ValueError(f"配置文件缺少必要字段: {field}")
            
            return config
            
        except FileNotFoundError:
            logger.error(f"配置文件 {config_file} 不存在")
            sys.exit(1)
        except json.JSONDecodeError as e:
            logger.error(f"配置文件格式错误: {e}")
            sys.exit(1)

    def get_utc_timestamp(self) -> str:
        """获取UTC时间戳字符串"""
        return datetime.now(timezone.utc).isoformat()
        
    def get_utc_datetime(self) -> datetime:
        """获取UTC datetime对象"""
        return datetime.now(timezone.utc)

    def get_local_ip(self) -> str:
        """获取本机公网IP"""
        try:
            ip_services = [
                'https://api.ipify.org',
                'https://checkip.amazonaws.com',
                'https://icanhazip.com',
                'https://ipecho.net/plain'
            ]
            
            for service in ip_services:
                try:
                    import urllib.request
                    response = urllib.request.urlopen(service, timeout=10)
                    ip = response.read().decode('utf-8').strip()
                    
                    import ipaddress
                    ipaddress.ip_address(ip)
                    
                    logger.info(f"检测到公网IP: {ip}")
                    return ip
                    
                except Exception:
                    continue
            
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                logger.warning(f"无法获取公网IP，使用本地IP: {local_ip}")
                return local_ip
                
        except Exception as e:
            logger.error(f"获取IP地址失败: {e}")
            return "127.0.0.1"

    async def register_node(self) -> bool:
        """注册VPS节点"""
        node_info = self.config['node_info'].copy()
        
        if node_info.get('ip_address') == 'auto':
            node_info['ip_address'] = self.get_local_ip()
        
        utc_now = self.get_utc_timestamp()
        logger.info(f"正在注册节点: {node_info['name']} at {utc_now}")
        
        try:
            async with self.session.post(
                f"{self.config['api_endpoint']}/api/nodes/register",
                json=node_info,
                headers=self.get_headers()
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.node_id = result.get('node_id')
                    
                    if result.get('updated'):
                        logger.info(f"节点信息已更新，ID: {self.node_id}")
                    else:
                        logger.info(f"节点注册成功，ID: {self.node_id}")
                    
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"节点注册失败: HTTP {response.status} - {error_text}")
                    return False
                    
        except Exception as e:
            logger.error(f"节点注册出错: {e}")
            return False

    def get_headers(self) -> Dict[str, str]:
        """获取HTTP请求头"""
        headers = {'Content-Type': 'application/json'}
        if self.config.get('api_key'):
            headers['Authorization'] = f"Bearer {self.config['api_key']}"
        return headers

    async def ping_test(self, target_ip: str, count: int = 10) -> Optional[Dict]:
        """执行ping测试 - UTC时间戳版本"""
        try:
            if sys.platform.startswith('win'):
                cmd = ['ping', '-n', str(count), target_ip]
            else:
                cmd = ['ping', '-c', str(count), '-W', '5', target_ip]
            
            test_start_time = self.get_utc_timestamp()
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=60
            )
            
            if process.returncode != 0:
                logger.warning(f"Ping {target_ip} 失败: {stderr.decode()}")
                return None
            
            output = stdout.decode()
            result = self.parse_ping_output(output, target_ip)
            
            if result:
                result['test_time_utc'] = test_start_time
            
            return result
            
        except asyncio.TimeoutError:
            logger.warning(f"Ping {target_ip} 超时")
            return None
        except Exception as e:
            logger.error(f"Ping {target_ip} 出错: {e}")
            return None

    def parse_ping_output(self, output: str, target_ip: str) -> Dict:
        """解析ping输出结果"""
        lines = output.split('\\n')
        
        latencies = []
        packet_loss = 100.0
        
        try:
            if sys.platform.startswith('win'):
                for line in lines:
                    if 'time=' in line or 'time<' in line:
                        try:
                            time_part = line.split('time')[1]
                            if '=' in time_part:
                                time_str = time_part.split('=')[1].split('ms')[0]
                            else:
                                time_str = time_part.split('<')[1].split('ms')[0]
                            latencies.append(float(time_str))
                        except:
                            continue
                
                for line in lines:
                    if 'Lost' in line and '%' in line:
                        try:
                            loss_part = line.split('(')[1].split('%')[0]
                            packet_loss = float(loss_part)
                        except:
                            pass
            else:
                for line in lines:
                    if 'time=' in line:
                        try:
                            time_str = line.split('time=')[1].split(' ')[0]
                            latencies.append(float(time_str))
                        except:
                            continue
                
                for line in lines:
                    if 'packet loss' in line:
                        try:
                            loss_str = line.split(',')[2].strip().split('%')[0]
                            packet_loss = float(loss_str)
                        except:
                            pass
        except Exception as e:
            logger.warning(f"解析ping输出失败: {e}")
        
        if latencies:
            avg_latency = statistics.mean(latencies)
            jitter = statistics.stdev(latencies) if len(latencies) > 1 else 0
        else:
            avg_latency = None
            jitter = None
        
        return {
            'target_ip': target_ip,
            'test_type': 'ping',
            'avg_latency': avg_latency,
            'packet_loss': packet_loss,
            'jitter': jitter,
            'raw_data': {
                'latencies': latencies,
                'output': output[:500]
            }
        }

    async def run_all_tests(self) -> List[Dict]:
        """运行所有测试"""
        all_results = []
        
        for isp_name, targets in self.config['test_targets'].items():
            logger.info(f"开始测试 {isp_name}")
            
            for target in targets:
                target_ip = target['ip']
                target_name = target.get('name', target_ip)
                
                logger.info(f"  测试目标: {target_name} ({target_ip})")
                
                result = await self.ping_test(target_ip)
                
                if isinstance(result, dict):
                    result['isp_name'] = isp_name
                    result['target_name'] = target_name
                    all_results.append(result)
        
        return all_results

    async def submit_results(self, results: List[Dict]) -> bool:
        """提交测试结果 - UTC时间版本"""
        if not results:
            logger.warning("没有测试结果需要提交")
            return False
        
        utc_timestamp = self.get_utc_timestamp()
        
        payload = {
            'node_id': self.node_id,
            'results': results,
            'timestamp': utc_timestamp
        }
        
        logger.info(f"📊 提交测试结果 (UTC: {utc_timestamp}，数量: {len(results)})")
        
        try:
            async with self.session.post(
                f"{self.config['api_endpoint']}/api/test-results",
                json=payload,
                headers=self.get_headers()
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"✅ 测试结果提交成功，插入 {result.get('inserted', 0)} 条记录")
                    return True
                else:
                    logger.error(f"❌ 提交结果失败: HTTP {response.status}")
                    return False
                    
        except Exception as e:
            logger.error(f"提交结果出错: {e}")
            return False

    async def send_heartbeat(self):
        """发送心跳信号"""
        if not self.node_id:
            return
            
        try:
            async with self.session.post(
                f"{self.config['api_endpoint']}/api/nodes/{self.node_id}/heartbeat",
                json={'timestamp': self.get_utc_timestamp()},
                headers=self.get_headers()
            ) as response:
                if response.status == 200:
                    logger.debug("💓 心跳发送成功")
                else:
                    logger.warning(f"心跳发送失败: HTTP {response.status}")
        except Exception as e:
            logger.error(f"发送心跳出错: {e}")

    async def run_test_cycle(self):
        """运行测试周期 - UTC时间版本"""
        utc_start = self.get_utc_datetime()
        logger.info("=" * 60)
        logger.info(f"🚀 开始新的测试周期 (UTC: {utc_start.isoformat()})")
        
        start_time = time.time()
        
        await self.send_heartbeat()
        results = await self.run_all_tests()
        
        end_time = time.time()
        
        logger.info(f"⏱️  测试完成，耗时 {end_time - start_time:.2f} 秒")
        logger.info(f"📈 获得 {len(results)} 个测试结果")
        
        if results:
            success = await self.submit_results(results)
            if success:
                logger.info("✅ 测试周期完成")
            else:
                logger.error("❌ 测试结果提交失败")
        else:
            logger.warning("⚠️  没有有效的测试结果")
            await self.send_heartbeat()

    async def run_daemon(self):
        """守护进程模式"""
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        try:
            if not await self.register_node():
                logger.error("节点注册失败，退出程序")
                return
            
            test_interval = self.config.get('test_interval', 300)
            heartbeat_interval = min(120, test_interval // 3)
            
            logger.info(f"开始监控循环，测试间隔: {test_interval} 秒")
            
            last_test_time = 0
            last_heartbeat_time = 0
            
            while True:
                try:
                    current_time = time.time()
                    
                    if current_time - last_heartbeat_time >= heartbeat_interval:
                        await self.send_heartbeat()
                        last_heartbeat_time = current_time
                    
                    if current_time - last_test_time >= test_interval:
                        await self.run_test_cycle()
                        last_test_time = current_time
                        last_heartbeat_time = current_time
                    
                    await asyncio.sleep(10)
                    
                except KeyboardInterrupt:
                    logger.info("接收到中断信号...")
                    break
                except Exception as e:
                    logger.error(f"主循环出错: {e}")
                    await asyncio.sleep(30)
                
        except KeyboardInterrupt:
            logger.info("程序被用户中断")
        finally:
            if self.node_id:
                try:
                    async with self.session.post(
                        f"{self.config['api_endpoint']}/api/nodes/{self.node_id}/status",
                        json={'status': 'offline', 'timestamp': self.get_utc_timestamp()},
                        headers=self.get_headers()
                    ) as response:
                        if response.status == 200:
                            logger.info("已通知服务器节点离线")
                except:
                    pass
            
            if self.session:
                await self.session.close()
                logger.info("程序已安全退出")

    async def run_once(self):
        """运行一次测试"""
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        try:
            if not await self.register_node():
                logger.error("节点注册失败")
                return
            
            await self.run_test_cycle()
            
        finally:
            if self.session:
                await self.session.close()

def main():
    parser = argparse.ArgumentParser(description='VPS网络质量测试客户端 (UTC时间支持版)')
    parser.add_argument('--config', '-c', default='config.json', help='配置文件路径')
    parser.add_argument('--once', action='store_true', help='只运行一次测试')
    parser.add_argument('--daemon', action='store_true', help='以守护进程模式运行')
    
    args = parser.parse_args()
    
    if not args.once and not args.daemon:
        args.daemon = True
    
    try:
        tester = NetworkTester(args.config)
        
        if args.once:
            asyncio.run(tester.run_once())
        else:
            asyncio.run(tester.run_daemon())
            
    except KeyboardInterrupt:
        logger.info("程序被用户中断")
    except Exception as e:
        logger.error(f"程序出错: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
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
Description=VPS Network Monitor Client (UTC Support) - ${node.name}
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
Environment=TZ=UTC

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
log_success "🎉 VPS网络监测客户端安装完成！(UTC时间支持版)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
log_info "📊 服务状态: systemctl status vps-monitor"
log_info "📋 查看日志: journalctl -u vps-monitor -f"
log_info "🔧 配置文件: /opt/vps-monitor/config.json"
log_info "🌐 监控面板: ${serverUrl}"
echo
log_info "⏰ 重要特性:"
echo "  • 使用UTC时间记录数据，确保时区兼容性"
echo "  • 自动心跳检测，保持连接状态"
echo "  • 系统级服务，开机自启"
echo "  • 详细日志记录，便于故障排除"
echo
log_info "常用命令:"
echo "  启动服务: systemctl start vps-monitor"
echo "  停止服务: systemctl stop vps-monitor"
echo "  重启服务: systemctl restart vps-monitor"
echo "  查看状态: systemctl status vps-monitor"
echo "  查看日志: journalctl -u vps-monitor -f"
echo "  手动测试: cd /opt/vps-monitor && python3 vps_client.py --once"
echo
log_success "节点 '${node.name}' 已成功连接到监控系统！"
log_info "数据将以UTC时间记录，与主控面板完美同步"
`;
}

module.exports = router;