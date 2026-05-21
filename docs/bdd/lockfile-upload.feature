Feature: Lockfile Upload and Download
  用户通过上传 pnpm-lock.yaml 文件批量下载 npm 依赖包

  Background:
    Given 服务器正在运行在端口 3002
    And 前端正在运行在端口 3001

  Scenario: 成功上传 lockfile 并下载所有依赖
    Given 用户在首页
    When 用户选择一个有效的 pnpm-lock.yaml 文件
    And 用户点击上传按钮
    Then 系统解析 lockfile 并显示包数量
    And 系统开始并发下载所有依赖包（最多 10 个并发）
    And 下载进度实时显示 "Downloading packages... (x/y)"
    When 所有包下载完成
    Then 系统将包打包为 ZIP 文件
    And 显示下载链接
    And 历史记录中出现一条 "lockfile" 类型的记录

  Scenario: 上传空文件
    When 用户选择一个空文件并点击上传
    Then 系统返回错误 "No file uploaded"

  Scenario: 上传无效的 lockfile
    When 用户选择一个非 pnpm-lock.yaml 格式的文件并上传
    Then 系统返回错误 "Failed to parse lockfile or no packages found"

  Scenario: 部分包下载失败
    Given 系统解析 lockfile 得到 100 个包
    When 其中 5 个包因网络问题下载失败
    Then 系统对失败的包进行最多 3 次重试（指数退避）
    And 日志中记录每个失败包的错误信息
    And 最终 ZIP 包含成功下载的包
    And 历史记录状态为 "completed"

  Scenario: 从 lockfile 下载的包不包含 peerDependencies
    Given lockfile 中某个包声明了 peerDependencies
    When 系统解析 lockfile
    Then 只下载 lockfile.packages 中列出的包
    And peerDependencies 不会被额外下载

  Scenario: 下载 ZIP 文件
    Given 存在一个已完成的任务 "1234567890"
    When 用户访问 GET /api/download/1234567890
    Then 返回对应的 ZIP 文件
    And Content-Type 为 application/zip

  Scenario: 下载不存在的任务 ZIP
    When 用户访问 GET /api/download/nonexistent
    Then 返回 404 状态码
    And 响应体为 { "error": "File not found" }

  Scenario: 单个包下载失败后重试
    Given 系统正在下载包 "lodash@4.17.21"
    When 第一次下载失败
    Then 系统等待 1 秒后重试
    When 第二次下载失败
    Then 系统等待 2 秒后重试
    When 第三次下载失败
    Then 日志记录 "✗ Failed lodash@4.17.21"
    And 继续下载其他包
