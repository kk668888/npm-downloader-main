Feature: Deployment and Configuration
  项目在不同环境下的部署和配置

  Background:
    Given 项目源码已准备就绪

  Scenario: Windows PowerShell 脚本启动
    Given Windows 11 上已安装 Node.js 20+
    When 用户执行 .\npm-downloader.ps1 start
    Then 检查 Node.js 和 pnpm 是否已安装
    When pnpm 未安装
    Then 自动执行 npm install -g pnpm
    When node_modules 不存在
    Then 自动执行 pnpm install
    Then 自动执行 pnpm run build
    Then 启动后端服务（最小化窗口）
    Then 等待 3 秒检查后端健康状态
    Then 启动前端服务（最小化窗口）
    Then 等待 2 秒
    Then 提示打开浏览器

  Scenario: PowerShell 脚本停止服务
    When 用户执行 .\npm-downloader.ps1 stop
    Then 通过端口 3001 和 3002 查找并终止进程
    And 通过窗口标题 "npm-downloader*" 终止进程
    And 清理 PID 文件

  Scenario: PowerShell 脚本查看状态
    When 用户执行 .\npm-downloader.ps1 status
    Then 检查后端 http://localhost:3002/health
    And 检查前端端口 3001 是否在监听
    And 显示各服务运行状态和 PID

  Scenario: PowerShell 脚本查看日志
    When 用户执行 .\npm-downloader.ps1 logs server
    Then 显示后端日志最近 50 行
    When 用户执行 .\npm-downloader.ps1 logs client
    Then 显示前端日志最近 50 行
    When 用户执行 .\npm-downloader.ps1 logs
    Then 列出所有日志文件

  Scenario: Windows 批处理脚本启动
    When 用户双击 start.bat
    Then 脚本设置 UTF-8 编码（chcp 65001）
    Then 检查并安装 Node.js 和 pnpm
    Then 构建 项目
    Then 在新窗口启动后端（最小化）
    Then 在新窗口启动前端（最小化）
    Then 自动打开浏览器

  Scenario: Linux Shell 脚本启动
    When 用户执行 ./start.sh
    Then 后台启动 node packages/server/dist/app.js
    And 后台启动 serve packages/client/dist -p 3001 -s
    And 等待任一进程退出

  Scenario: Docker 部署
    When 用户执行 docker-compose up -d --build
    Then 使用 Node 20 Alpine 构建镜像
    And 安装 pnpm
    And 执行 pnpm install --frozen-lockfile
    And 执行 pnpm run build
    And 启动后端和前端
    And 暴露端口 3001 和 3002
    And 挂载 volumes: downloads, data, uploads
    And 设置自动重启策略 unless-stopped

  Scenario: 打包发布
    When 用户执行 ./pack.sh
    Then 排除 node_modules, dist, .nuxt, .output
    And 排除 logs, data, temp, uploads
    And 排除 tests, __test__
    And 排除 .git, .claude, dockerData
    And 排除 *.log, *.zip, *.tgz, *.tar.gz
    And 包含 src/components/logs/ 日志组件
    And 生成 tar.gz 到项目上级目录
    And 显示文件大小和部署说明

  Scenario: 环境变量配置
    Given 默认配置
    Then TEMP_DIR = ./temp (临时文件目录)
    And DATA_DIR = ./data (数据持久化目录)
    And UPLOAD_DIR = ./packages/server/uploads (上传目录)
    And PORT = 3002 (后端端口)
    And SERVER_BASE_URL = http://localhost:3002
    When 设置环境变量 TEMP_DIR=/custom/path
    Then 使用自定义路径作为临时目录

  Scenario: 开发模式启动
    When 用户执行 .\npm-downloader.ps1 dev
    Then 后端使用 tsx watch 热重载
    And 前端使用 Vite HMR
    And 代码修改后自动重载
