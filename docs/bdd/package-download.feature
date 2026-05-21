Feature: Single Package Download
  用户通过输入包名下载单个 npm 包及其依赖

  Scenario: 下载指定包名的最新版本
    When 用户在 "Single Package" 输入框中输入 "lodash"
    And 点击下载按钮
    Then 系统通过 pacote 解析 lodash@latest
    And 递归解析所有 dependencies
    And 显示解析到的包数量
    When 开始并发下载所有解析到的包（最多 10 个并发）
    Then 下载进度实时更新 "Downloading packages... (x/y)"
    When 所有包下载完成
    Then 系统打包为 ZIP 文件
    And 历史记录中出现一条 "package" 类型的记录，包含包名

  Scenario: 下载指定版本的包
    When 用户输入 "lodash@4.17.21"
    And 点击下载按钮
    Then 系统解析 lodash@4.17.21 的精确版本
    And 历史记录中 packageVersion 为 "4.17.21"

  Scenario: 下载带 scope 的包
    When 用户输入 "@vue/reactivity@3.5.0"
    Then 系统正确解析作用域包名和版本

  Scenario: 包名为空时下载
    When 用户不输入包名直接点击下载
    Then 系统返回错误 "Package name is required"

  Scenario: 不存在的包名
    When 用户输入 "nonexistent-package-xyz-12345"
    And 点击下载按钮
    Then 系统尝试解析但失败
    And 任务状态变为 "failed"

  Scenario: 下载过程中查看实时进度
    Given 系统正在下载一个包含 50 个依赖的包
    When 用户查看任务状态 GET /api/task/:taskId
    Then 返回当前进度 { "status": "processing", "message": "Downloading packages... (30/50)", "progress": { "current": 30, "total": 50 } }

  Scenario: 任务状态查询
    Given 存在任务 "1234567890" 状态为 "completed"
    When 用户访问 GET /api/task/1234567890
    Then 返回 { "status": "completed", "message": "Download and compression complete" }

  Scenario: 查询不存在的任务
    When 用户访问 GET /api/task/nonexistent
    Then 返回 404 状态码
    And 响应体为 { "error": "Task not found" }
