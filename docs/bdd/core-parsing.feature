Feature: Core Package Parsing
  Core 包的 lockfile 解析和包信息提取

  Scenario: 解析 pnpm-lock.yaml 中的普通包
    Given pnpm-lock.yaml 包含 "lodash@4.17.21"
    When parsePackage 解析该字符串
    Then 返回 { name: "lodash", version: "4.17.21", scope: undefined }

  Scenario: 解析作用域包
    Given pnpm-lock.yaml 包含 "@babel/core@7.24.0"
    When parsePackage 解析该字符串
    Then 返回 { scope: "@babel", name: "core", version: "7.24.0" }

  Scenario: 解析带预发布版本的包
    Given pnpm-lock.yaml 包含 "typescript@5.0.0-beta.1"
    When parsePackage 解析该字符串
    Then 返回 { name: "typescript", version: "5.0.0-beta.1" }

  Scenario: 生成 tgz 下载 URL
    Given 包信息 { name: "lodash", version: "4.17.21", scope: undefined }
    When parsePackageTgzUrl 生成 URL
    Then 返回 "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"

  Scenario: 生成作用域包的 tgz 下载 URL
    Given 包信息 { scope: "@types", name: "node", version: "18.0.0" }
    When parsePackageTgzUrl 生成 URL
    Then 返回 "https://registry.npmjs.org/@types/node/-/node-18.0.0.tgz"

  Scenario: 解析完整的 lockfile
    Given 存在 pnpm-lock.yaml 文件
    When parseLockFile 解析文件
    Then 使用 @pnpm/lockfile-file 读取 lockfile
    And 提取 lockfile.packages 中的所有包
    And 对每个包调用 parsePackage
    And 过滤掉解析失败的包
    And 返回 PackageInfo 数组

  Scenario: lockfile 不存在
    When parseLockFile 接收到不存在的路径
    Then 返回 undefined
    And 日志记录 "Error reading lockfile"
