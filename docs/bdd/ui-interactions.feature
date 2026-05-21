Feature: UI Interactions
  前端界面的交互行为和视觉状态

  Background:
    Given 前端正在运行在端口 3001
    And 后端正在运行在端口 3002

  Scenario: 页面布局
    When 用户访问首页
    Then 页面分为左侧边栏（320px）和右侧主内容区
    And 左侧边栏包含 "Lockfile Upload" 卡片
    And 左侧边栏包含 "Single Package" 卡片
    And 左侧边栏包含 "Current Task" 卡片（仅当有活跃任务时）
    And 右侧主内容区显示 "Task History" 列表

  Scenario: 深色模式切换
    Given 用户在首页
    When 用户点击顶部导航栏的主题切换按钮
    Then 页面从浅色模式切换到深色模式
    And HTML 根元素添加 "dark" class
    And 偏好保存到 localStorage
    When 用户刷新页面
    Then 保持深色模式（从 localStorage 恢复）

  Scenario: 深色模式持久化
    Given 用户上次选择了深色模式
    When 用户重新访问页面
    Then 自动应用深色模式
    And 所有组件使用深色配色方案

  Scenario: Lockfile 上传交互
    When 用户点击文件选择区域
    Then 弹出文件选择对话框
    When 用户选择 pnpm-lock.yaml
    Then 显示文件名和上传按钮
    And 上传按钮变为可点击状态
    When 用户点击上传
    Then 按钮变为 loading 状态
    And 显示进度信息
    When 上传完成
    Then 显示下载 ZIP 按钮
    And 显示 "查看日志" 按钮

  Scenario: 包下载交互
    When 用户在输入框输入包名 "express"
    And 点击下载按钮
    Then 按钮变为 loading 状态
    And 显示状态消息
    When 下载完成
    Then 显示下载 ZIP 按钮

  Scenario: 当前活跃任务卡片
    Given 用户正在进行 lockfile 上传
    Then 左侧边栏显示 "Current Task" 卡片
    And 显示旋转箭头图标
    And 显示进度条
    And 显示 "查看日志" 和 "下载 ZIP" 按钮
    When 任务完成
    Then "Current Task" 卡片消失
    And 历史记录更新

  Scenario: 任务历史列表
    Given 系统有 3 条历史记录
    Then 右侧显示 3 张任务卡片
    And 每张卡片显示任务类型图标、时间、状态
    And 已完成的任务显示下载按钮
    And 每张卡片有删除按钮（红色）

  Scenario: Toast 通知
    When 用户上传文件成功
    Then 显示绿色 toast 通知
    When 用户上传文件失败
    Then 显示红色 toast 通知，包含错误信息
    When toast 超过 3 秒
    Then toast 自动消失

  Scenario: 前端错误处理
    When 后端不可达
    Then 历史列表显示错误提示 "Failed to load history"
    And 提供 "Refresh" 重试按钮
    When 用户点击 Refresh
    Then 重新尝试获取数据

  Scenario: 响应式布局
    When 浏览器窗口宽度足够
    Then 左右布局正常显示
    When 浏览器窗口缩窄
    Then 侧边栏可滚动

  Scenario: 健康检查端点
    When 用户访问 GET /health
    Then 返回 { "status": "ok" }

  Scenario: CORS 配置
    When 前端从 localhost:3001 访问后端 localhost:3002
    Then 后端允许跨域请求
    And Access-Control-Allow-Origin 设置为请求来源
    And Access-Control-Allow-Credentials 为 true
