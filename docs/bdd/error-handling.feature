Feature: Error Handling
  系统的错误处理和恢复机制

  Scenario: 下载超时重试
    Given 系统正在下载包 "express@4.18.2"
    When 下载请求超时
    Then 系统在 1 秒后重试（第 1 次）
    When 再次超时
    Then 系统在 2 秒后重试（第 2 次）
    When 仍然超时
    Then 日志记录 "✗ Failed express@4.18.2: ..."
    And 继续处理其他包
    And failCount 加 1

  Scenario: 任务整体失败
    Given 用户上传了一个 lockfile
    When 下载过程中发生未捕获异常
    Then setTaskStatus(taskId, "failed", "Internal server error")
    And addTaskLog(taskId, "error", "Task failed: ...")
    And 历史记录状态更新为 "failed"
    And 返回 500 { "error": "Internal server error" }

  Scenario: 文件系统错误
    Given TEMP_DIR 磁盘空间不足
    When 系统尝试创建 ZIP 文件
    Then createZip 抛出错误
    And 任务状态变为 "failed"

  Scenario: ZIP 下载中断
    When 用户正在下载 ZIP 文件
    And 连接中断
    Then res.download 回调收到错误
    And 控制台输出 "Download error: ..."

  Scenario: Lockfile 解析错误
    Given 用户上传了一个格式损坏的 pnpm-lock.yaml
    When parseLockFile 尝试解析
    Then 返回 undefined
    And 抛出 ValidationError "Failed to parse lockfile or no packages found"

  Scenario: pacote 解析失败
    Given 用户请求下载不存在的包 "this-package-does-not-exist-xyz"
    When resolveDependencies 尝试获取 manifest
    Then pacote.manifest 抛出 404 错误
    And 错误被捕获并记录到控制台
    And allPackages Map 为空
    And 任务最终失败

  Scenario: 前端网络错误处理
    Given 前端调用 fetch 请求
    When 后端不可达
    Then catch 块捕获错误
    And 显示错误 toast 通知
    And loading 状态重置为 false
