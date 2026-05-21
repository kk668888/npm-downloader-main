Feature: History Management
  系统管理和展示下载任务的历史记录

  Background:
    Given 服务器已启动并加载历史记录文件

  Scenario: 查看历史记录列表
    When 用户访问 GET /api/history
    Then 返回 { "items": [...] }
    And 列表按 createdAt 降序排列（最新在前）

  Scenario: 历史记录最大保存 50 条
    Given 系统已有 50 条历史记录
    When 新建一条任务记录
    Then 最旧的记录被移除
    And 总数仍为 50 条

  Scenario: 删除单条历史记录
    Given 存在历史记录 "1234567890"
    When 用户发送 DELETE /api/history/1234567890
    Then 返回 204 状态码
    And 该记录从列表中移除
    And 历史文件更新到磁盘

  Scenario: 删除不存在的历史记录
    When 用户发送 DELETE /api/history/nonexistent
    Then 抛出错误 "History item not found"

  Scenario: 上传任务自动创建历史记录
    When 用户成功上传 lockfile 并创建任务 "111"
    Then 历史记录新增一条 { "taskId": "111", "type": "lockfile", "status": "processing" }
    When 任务完成
    Then 该记录状态更新为 { "status": "completed", "zipUrl": "/api/download/111" }

  Scenario: 包下载任务自动创建历史记录
    When 用户下载包 "lodash" 并创建任务 "222"
    Then 历史记录新增一条 { "taskId": "222", "type": "package", "packageName": "lodash", "status": "pending" }
    When 解析完成发现 3 个包
    Then 该记录更新 { "packagesCount": 3 }
    When 下载完成
    Then 该记录更新 { "status": "completed" }

  Scenario: 服务器重启后恢复历史记录
    Given 历史文件 data/history.json 中有 10 条记录
    When 服务器重启
    Then 从磁盘加载历史记录
    And 控制台输出 "Loaded 10 history items from disk"

  Scenario: 历史记录持久化使用原子写入
    When 系统保存历史记录
    Then 先写入 history.json.tmp
    Then 重命名为 history.json
    And 防止写入中断导致文件损坏

  Scenario: 前端轮询刷新历史记录
    Given 前端设置了 5 秒轮询间隔
    Then 每 5 秒自动调用 GET /api/history
    And 页面显示最新历史列表
    When 用户手动点击刷新按钮
    Then 立即获取最新数据

  Scenario: 前端删除历史项
    Given 历史列表中有一项任务 "123"
    When 用户点击该项的删除按钮（红色）
    Then 弹出确认提示
    When 用户确认删除
    Then 调用 DELETE /api/history/123
    And 列表中移除该项
    And 显示成功 toast 通知
