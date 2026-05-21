Feature: File Cleanup
  系统定时清理过期的临时文件

  Scenario: 定时清理任务
    Given 服务器已运行
    Then 每小时执行一次清理任务
    When 清理任务运行
    Then 扫描 TEMP_DIR 目录下的所有文件
    And 删除修改时间超过 1 小时的文件
    And 控制台输出 "Running cleanup task..."
    When 删除成功
    Then 控制台输出 "Deleted expired file: {filename}"
    When 删除失败
    Then 控制台输出 "Failed to delete {filename}"
    When TEMP_DIR 不存在
    Then 跳过清理

  Scenario: 上传过程中的临时文件清理
    Given 用户上传了一个 lockfile 文件
    When 解析完成
    Then 删除上传的原始文件
    And 删除临时 lockfile 目录
    When 任务失败
    Then also 清理所有临时文件和目录

  Scenario: 并发下载过程中的文件管理
    Given 系统创建了任务目录 temp/1234567890/
    When 所有包下载完成
    Then 系统将目录打包为 ZIP 文件 temp/1234567890.zip
    And 任务目录 temp/1234567890/ 可被定时清理任务回收
