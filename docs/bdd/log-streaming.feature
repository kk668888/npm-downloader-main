Feature: Real-time Log Streaming (SSE)
  系统通过 Server-Sent Events 实时推送下载日志

  Background:
    Given 服务器正在运行
    And 存在任务 "1234567890"

  Scenario: 建立 SSE 连接
    When 用户连接 GET /api/logs/1234567890/stream
    Then 响应头 Content-Type 为 "text/event-stream"
    And 响应头 Cache-Control 为 "no-cache, no-transform"
    And 响应头 Connection 为 "keep-alive"
    And 响应头 X-Accel-Buffering 为 "no"

  Scenario: 接收历史日志
    Given 任务 "1234567890" 已有 5 条日志
    When 用户连接 SSE 流
    Then 首先收到 event: "history" 事件，包含 5 条日志
    And 日志格式为 { "taskId": "1234567890", "timestamp": 123456, "level": "info", "message": "..." }

  Scenario: 实时接收新日志
    Given 用户已连接 SSE 流
    When 后端产生新日志 addTaskLog("1234567890", "info", "✓ Downloaded lodash@4.17.21")
    Then 客户端收到 event: "log" 事件
    And 事件数据包含完整的 TaskLog 对象

  Scenario: 接收任务状态更新
    Given 用户已连接 SSE 流
    When 后端调用 setTaskStatus 更新状态
    Then 客户端收到 event: "status" 事件
    And 数据包含当前任务状态

  Scenario: 任务完成后连接自动关闭
    Given 用户已连接 SSE 流
    When 任务状态变为 "completed" 或 "failed"
    Then 客户端收到 event: "end" 事件，包含 { "done": true }
    And 1 秒后 SSE 连接关闭

  Scenario: 心跳保活
    Given 用户已连接 SSE 流
    Then 每 15 秒收到 ": heartbeat\n\n" 注释行
    And 保持连接活跃

  Scenario: 客户端断开连接清理
    Given 用户已连接 SSE 流
    When 用户关闭浏览器标签页
    Then 服务端检测到连接断开
    And 从活跃客户端列表中移除该连接

  Scenario: SSE 重连机制（前端）
    Given 用户已连接 SSE 流
    When 连接意外中断
    Then 前端等待 1 秒后尝试重连
    When 重连失败
    Then 前端等待 2 秒后再次重连
    When 重连失败
    Then 前端等待 4 秒后再次重连（指数退避）
    When 5 次重连均失败
    Then 显示错误 "Failed to connect. Please refresh."
    And 状态变为 "error"

  Scenario: 多客户端订阅同一任务
    Given 客户端 A 已连接 SSE 流
    And 客户端 B 连接同一任务的 SSE 流
    When 后端产生新日志
    Then 客户端 A 和客户端 B 都收到该日志

  Scenario: 日志级别
    Given 任务正在执行
    Then 产生 "info" 级别日志（正常下载进度）
    And 产生 "warn" 级别日志（重试提示 "Retry 1/2 for ..."）
    And 产生 "error" 级别日志（下载失败 "✗ Failed ..."）

  Scenario: 日志持久化到磁盘
    Given 系统产生日志 { taskId: "123", level: "info", message: "test" }
    Then 日志追加写入 data/logs/123.log
    And 每行一个 JSON 对象
    When 服务器重启
    And 内存中无该任务的日志
    Then 从文件加载历史日志

  Scenario: 日志数量限制
    Given 任务产生超过 100 条内存日志
    Then 内存中只保留最新的 100 条
    And 磁盘文件保留全部日志

  Scenario: 通过 HTTP 获取历史日志
    When 用户访问 GET /api/logs/1234567890
    Then 返回 { "logs": [...] }
    And 包含该任务的所有日志

  Scenario: 前端日志查看器
    Given 用户在首页
    When 用户点击任务的 "查看日志" 按钮
    Then 弹出全屏日志查看器 Modal
    And 日志按时间顺序显示
    And 每行显示时间戳、级别图标、消息内容

  Scenario: 日志过滤器
    Given 日志查看器已打开
    When 用户选择级别过滤 "Error"
    Then 只显示 error 级别的日志
    When 用户在搜索框输入 "lodash"
    Then 只显示包含 "lodash" 的日志

  Scenario: 日志统计
    Given 日志查看器中有 100 条 info、5 条 warn、2 条 error
    Then 显示统计面板 { total: 107, info: 100, warn: 5, error: 2 }

  Scenario: 日志自动滚动
    Given 日志查看器已打开且 autoScroll 开启
    When 新日志到达
    Then 自动滚动到底部
    When 用户手动向上滚动
    Then 自动滚动暂停（autoScroll 关闭）
    When 用户点击 "Auto-scroll" 按钮
    Then 恢复自动滚动

  Scenario: 按 ESC 关闭日志查看器
    Given 日志查看器已打开
    When 用户按下 Escape 键
    Then 日志查看器关闭
    And SSE 连接断开
