const crypto = require('crypto');

// 生成API密钥
function generateAPIKey() {
    return crypto.randomBytes(32).toString('hex');
}

// 生成完整的Python客户端代码
function generateClientCode() {
    return `#!/usr/bin/env python3
"""
VPS网络测试客户端 - 增强版本
支持自动地理位置检测和ISP信息获取
"""

import asyncio
import aiohttp
import subprocess
import json
import time
import logging
import socket
import statistics
from datetime import datetime
from typing import Dict, List, Optional
import argparse
import sys
import os

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vps_monitor.log'),
        logging.StreamHandler()
    ]
)

class NetworkTester:
    def __init__(self, config_file: str = 'config.json'):
        """初始化网络测试器"""
        self.config = self.load_config(config_file)
        self.node_id = None
        self.session = None
        self.location_info = None
        
    def load_config(self, config_file: str) -> Dict:
        """加载配置文件"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 验证必要配置
            required_fields = ['node_info', 'api_endpoint', 'test_targets']
            for field in required_fields:
                if field not in config:
                    raise ValueError(f"配置文件缺少必要字段: {field}")
            
            return config
            
        except FileNotFoundError:
            logging.error(f"配置文件 {config_file} 不存在")
            sys.exit(1)
        except json.JSONDecodeError as e:
            logging.error(f"配置文件格式错误: {e}")
            sys.exit(1)

    def get_local_ip(self) -> str:
        """获取本机公网IP"""
        try:
            # 方法1: 使用多个公网IP检测服务
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
                    
                    # 验证IP格式
                    import ipaddress
                    ipaddress.ip_address(ip)
                    
                    logging.info(f"检测到公网IP: {ip} (来源: {service})")
                    return ip
                    
                except Exception as e:
                    logging.debug(f"IP检测服务 {service} 失败: {e}")
                    continue
            
            # 方法2: 通过连接外部服务器获取本地IP（可能是内网IP）
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                logging.warning(f"无法获取公网IP，使用本地IP: {local_ip}")
                return local_ip
                
        except Exception as e:
            logging.error(f"获取IP地址失败: {e}")
            return "127.0.0.1"

    async def get_location_info(self, ip_address: str) -> Dict:
        """获取IP地址的地理位置和ISP信息"""
        if self.location_info:
            return self.location_info
            
        location_services = [
            {
                'url': f'http://ip-api.com/json/{ip_address}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query',
                'parser': self._parse_ipapi_response
            },
            {
                'url': f'https://ipinfo.io/{ip_address}/json',
                'parser': self._parse_ipinfo_response
            },
            {
                'url': f'https://freegeoip.app/json/{ip_address}',
                'parser': self._parse_freegeoip_response
            }
        ]
        
        for service in location_services:
            try:
                async with self.session.get(service['url'], timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        location_info = service['parser'](data)
                        
                        if location_info and location_info.get('country'):
                            self.location_info = location_info
                            logging.info(f"地理位置检测成功: {location_info}")
                            return location_info
                            
            except Exception as e:
                logging.debug(f"地理位置服务 {service['url']} 失败: {e}")
                continue
        
        # 如果所有服务都失败，返回默认信息
        logging.warning("无法获取地理位置信息，使用默认值")
        return {
            'country': 'Unknown',
            'country_code': 'XX',
            'city': 'Unknown',
            'region': 'Unknown',
            'isp': 'Unknown ISP',
            'location_string': 'Unknown Location'
        }

    def _parse_ipapi_response(self, data: Dict) -> Optional[Dict]:
        """解析ip-api.com的响应"""
        try:
            if data.get('status') == 'success':
                return {
                    'country': data.get('country', 'Unknown'),
                    'country_code': data.get('countryCode', 'XX'),
                    'city': data.get('city', 'Unknown'),
                    'region': data.get('regionName', 'Unknown'),
                    'isp': data.get('isp', 'Unknown ISP'),
                    'org': data.get('org', ''),
                    'location_string': f"{data.get('city', 'Unknown')}, {data.get('country', 'Unknown')}"
                }
        except Exception as e:
            logging.debug(f"解析ip-api响应失败: {e}")
        return None

    def _parse_ipinfo_response(self, data: Dict) -> Optional[Dict]:
        """解析ipinfo.io的响应"""
        try:
            if 'country' in data:
                city = data.get('city', 'Unknown')
                country = data.get('country', 'Unknown')
                region = data.get('region', 'Unknown')
                org = data.get('org', 'Unknown ISP')
                
                return {
                    'country': country,
                    'country_code': data.get('country', 'XX'),
                    'city': city,
                    'region': region,
                    'isp': org,
                    'org': org,
                    'location_string': f"{city}, {country}"
                }
        except Exception as e:
            logging.debug(f"解析ipinfo响应失败: {e}")
        return None

    def _parse_freegeoip_response(self, data: Dict) -> Optional[Dict]:
        """解析freegeoip.app的响应"""
        try:
            if 'country_name' in data:
                return {
                    'country': data.get('country_name', 'Unknown'),
                    'country_code': data.get('country_code', 'XX'),
                    'city': data.get('city', 'Unknown'),
                    'region': data.get('region_name', 'Unknown'),
                    'isp': 'Unknown ISP',  # freegeoip不提供ISP信息
                    'org': '',
                    'location_string': f"{data.get('city', 'Unknown')}, {data.get('country_name', 'Unknown')}"
                }
        except Exception as e:
            logging.debug(f"解析freegeoip响应失败: {e}")
        return None

    async def register_node(self) -> bool:
        """注册VPS节点"""
        node_info = self.config['node_info'].copy()
        
        # 自动获取IP地址
        if node_info.get('ip_address') == 'auto':
            node_info['ip_address'] = self.get_local_ip()
        
        # 如果配置中的位置或提供商是Auto-detect，则自动检测
        if (node_info.get('location') == 'Auto-detect' or 
            node_info.get('provider') == 'Auto-detect' or
            not node_info.get('location') or 
            not node_info.get('provider')):
            
            logging.info("正在自动检测地理位置和ISP信息...")
            location_info = await self.get_location_info(node_info['ip_address'])
            
            if node_info.get('location') == 'Auto-detect' or not node_info.get('location'):
                node_info['location'] = location_info['location_string']
                
            if node_info.get('provider') == 'Auto-detect' or not node_info.get('provider'):
                node_info['provider'] = location_info['isp']
        
        logging.info(f"正在注册节点: {node_info['name']} ({node_info['ip_address']})")
        logging.info(f"位置: {node_info['location']}")
        logging.info(f"提供商: {node_info['provider']}")
        
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
                        logging.info(f"节点信息已更新，ID: {self.node_id}")
                    else:
                        logging.info(f"节点注册成功，ID: {self.node_id}")
                    
                    # 显示检测到的IP
                    detected_ip = result.get('detected_ip')
                    if detected_ip and detected_ip != node_info['ip_address']:
                        logging.info(f"服务器检测到的IP: {detected_ip}")
                    
                    return True
                else:
                    error_text = await response.text()
                    logging.error(f"节点注册失败: HTTP {response.status} - {error_text}")
                    return False
                    
        except Exception as e:
            logging.error(f"节点注册出错: {e}")
            return False

    def get_headers(self) -> Dict[str, str]:
        """获取HTTP请求头"""
        headers = {'Content-Type': 'application/json'}
        if self.config.get('api_key'):
            headers['Authorization'] = f"Bearer {self.config['api_key']}"
        return headers

    async def ping_test(self, target_ip: str, count: int = 10) -> Optional[Dict]:
        """执行ping测试"""
        try:
            # 构建ping命令
            if sys.platform.startswith('win'):
                cmd = ['ping', '-n', str(count), target_ip]
            else:
                cmd = ['ping', '-c', str(count), '-W', '5', target_ip]
            
            # 执行ping命令
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=60
            )
            
            if process.returncode != 0:
                logging.warning(f"Ping {target_ip} 失败: {stderr.decode()}")
                return None
            
            # 解析ping结果
            output = stdout.decode()
            return self.parse_ping_output(output, target_ip)
            
        except asyncio.TimeoutError:
            logging.warning(f"Ping {target_ip} 超时")
            return None
        except Exception as e:
            logging.error(f"Ping {target_ip} 出错: {e}")
            return None

    def parse_ping_output(self, output: str, target_ip: str) -> Dict:
        """解析ping输出结果"""
        lines = output.split('\\n')
        
        # 提取延迟数据
        latencies = []
        packet_loss = 100.0
        
        try:
            if sys.platform.startswith('win'):
                # Windows ping输出解析
                for line in lines:
                    if 'time=' in line or 'time<' in line:
                        try:
                            time_part = line.split('time')[1]
                            if '=' in time_part:
                                time_str = time_part.split('=')[1].split('ms')[0]
                            else:  # time<1ms
                                time_str = time_part.split('<')[1].split('ms')[0]
                            latencies.append(float(time_str))
                        except:
                            continue
                
                # 查找丢包率
                for line in lines:
                    if 'Lost' in line and '%' in line:
                        try:
                            loss_part = line.split('(')[1].split('%')[0]
                            packet_loss = float(loss_part)
                        except:
                            pass
            else:
                # Linux/Unix ping输出解析
                for line in lines:
                    if 'time=' in line:
                        try:
                            time_str = line.split('time=')[1].split(' ')[0]
                            latencies.append(float(time_str))
                        except:
                            continue
                
                # 查找丢包率
                for line in lines:
                    if 'packet loss' in line:
                        try:
                            loss_str = line.split(',')[2].strip().split('%')[0]
                            packet_loss = float(loss_str)
                        except:
                            pass
        except Exception as e:
            logging.warning(f"解析ping输出失败: {e}")
        
        # 计算统计信息
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
                'output': output[:500]  # 限制原始数据长度
            }
        }

    async def run_all_tests(self) -> List[Dict]:
        """运行所有测试"""
        all_results = []
        
        for isp_name, targets in self.config['test_targets'].items():
            logging.info(f"开始测试 {isp_name}")
            
            for target in targets:
                target_ip = target['ip']
                target_name = target.get('name', target_ip)
                
                logging.info(f"  测试目标: {target_name} ({target_ip})")
                
                # 只执行ping测试
                result = await self.ping_test(target_ip)
                
                if isinstance(result, dict):
                    result['isp_name'] = isp_name
                    result['target_name'] = target_name
                    all_results.append(result)
                elif isinstance(result, Exception):
                    logging.error(f"测试出错: {result}")
        
        return all_results

    async def submit_results(self, results: List[Dict]) -> bool:
        """提交测试结果到API服务器"""
        if not results:
            logging.warning("没有测试结果需要提交")
            return False
        
        payload = {
            'node_id': self.node_id,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            async with self.session.post(
                f"{self.config['api_endpoint']}/api/test-results",
                json=payload,
                headers=self.get_headers()
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    logging.info(f"测试结果提交成功，插入 {result.get('inserted', 0)} 条记录")
                    return True
                else:
                    logging.error(f"提交结果失败: HTTP {response.status}")
                    error_text = await response.text()
                    logging.error(f"错误详情: {error_text}")
                    return False
                    
        except Exception as e:
            logging.error(f"提交结果出错: {e}")
            return False

    async def send_heartbeat(self):
        """发送心跳信号"""
        if not self.node_id:
            return
            
        try:
            async with self.session.post(
                f"{self.config['api_endpoint']}/api/nodes/{self.node_id}/heartbeat",
                headers=self.get_headers()
            ) as response:
                if response.status == 200:
                    logging.debug("心跳发送成功")
                else:
                    logging.warning(f"心跳发送失败: HTTP {response.status}")
        except Exception as e:
            logging.error(f"发送心跳出错: {e}")

    async def run_test_cycle(self):
        """运行一次完整的测试周期"""
        logging.info("=" * 50)
        logging.info("开始新的测试周期")
        
        start_time = time.time()
        
        # 发送心跳信号
        await self.send_heartbeat()
        
        # 运行所有测试
        results = await self.run_all_tests()
        
        end_time = time.time()
        logging.info(f"测试完成，耗时 {end_time - start_time:.2f} 秒")
        logging.info(f"获得 {len(results)} 个测试结果")
        
        # 提交结果
        if results:
            success = await self.submit_results(results)
            if success:
                logging.info("测试周期完成")
            else:
                logging.error("测试结果提交失败")
        else:
            logging.warning("没有有效的测试结果")
            # 即使没有测试结果，也要发送心跳保持在线状态
            await self.send_heartbeat()

    async def run_daemon(self):
        """以守护进程模式运行"""
        # 创建HTTP会话
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        try:
            # 注册节点
            if not await self.register_node():
                logging.error("节点注册失败，退出程序")
                return
            
            # 主循环
            test_interval = self.config.get('test_interval', 300)  # 默认5分钟
            heartbeat_interval = min(120, test_interval // 3)  # 心跳间隔，最多2分钟
            
            logging.info(f"开始监控循环，测试间隔: {test_interval} 秒，心跳间隔: {heartbeat_interval} 秒")
            
            last_test_time = 0
            last_heartbeat_time = 0
            
            while True:
                try:
                    current_time = time.time()
                    
                    # 检查是否需要发送心跳
                    if current_time - last_heartbeat_time >= heartbeat_interval:
                        await self.send_heartbeat()
                        last_heartbeat_time = current_time
                    
                    # 检查是否需要运行测试
                    if current_time - last_test_time >= test_interval:
                        await self.run_test_cycle()
                        last_test_time = current_time
                        last_heartbeat_time = current_time  # 测试后也算是心跳
                    
                    # 短暂等待
                    await asyncio.sleep(10)  # 每10秒检查一次
                    
                except KeyboardInterrupt:
                    logging.info("接收到中断信号...")
                    break
                except Exception as e:
                    logging.error(f"主循环出错: {e}")
                    await asyncio.sleep(30)  # 出错后等待30秒再继续
                
        except KeyboardInterrupt:
            logging.info("程序被用户中断")
        except Exception as e:
            logging.error(f"守护进程出错: {e}")
        finally:
            # 发送最后一次状态更新，标记为离线
            if self.node_id:
                try:
                    async with self.session.post(
                        f"{self.config['api_endpoint']}/api/nodes/{self.node_id}/status",
                        json={'status': 'offline'},
                        headers=self.get_headers()
                    ) as response:
                        if response.status == 200:
                            logging.info("已通知服务器节点离线")
                except:
                    pass
            
            if self.session:
                await self.session.close()
                logging.info("程序已安全退出")

    async def run_once(self):
        """运行一次测试"""
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        try:
            # 注册节点
            if not await self.register_node():
                logging.error("节点注册失败")
                return
            
            # 运行测试
            await self.run_test_cycle()
            
        finally:
            if self.session:
                await self.session.close()

def main():
    parser = argparse.ArgumentParser(description='VPS网络质量测试客户端')
    parser.add_argument('--config', '-c', default='config.json', help='配置文件路径')
    parser.add_argument('--once', action='store_true', help='只运行一次测试')
    parser.add_argument('--daemon', action='store_true', help='以守护进程模式运行')
    
    args = parser.parse_args()
    
    # 如果没有指定模式，默认为守护进程模式
    if not args.once and not args.daemon:
        args.daemon = True
    
    try:
        tester = NetworkTester(args.config)
        
        if args.once:
            asyncio.run(tester.run_once())
        else:
            asyncio.run(tester.run_daemon())
            
    except KeyboardInterrupt:
        logging.info("程序被用户中断")
    except Exception as e:
        logging.error(f"程序出错: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()`;
}

module.exports = {
    generateAPIKey,
    generateClientCode
};