#!/bin/bash
# npm-downloader 项目打包脚本
# 用于将项目打包以便在其他环境部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# 输出文件名
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="${PROJECT_DIR}/../${PROJECT_NAME}-${TIMESTAMP}.tar.gz"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  npm-downloader 项目打包工具${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 要排除的目录和文件
EXCLUDES=(
    # 依赖目录
    "node_modules"
    "packages/*/node_modules"
    # 构建产物
    "packages/*/dist"
    "packages/client/.nuxt"
    "packages/client/.output"
    # 测试相关
    "packages/client/playwright-report"
    "packages/client/test-results"
    "packages/client/tests"
    "packages/*/__test__"
    "packages/core/__test__/*.js"
    "packages/core/__test__/*.d.ts"
    "packages/core/__test__/*.map"
    # 运行时目录
    "/logs"
    "data"
    ".pids"
    "temp"
    "downloads"
    "uploads"
    "packages/server/temp"
    "packages/server/uploads"
    # 文件
    "*.log"
    "*.zip"
    "*.tgz"
    # Git 和工具
    ".git"
    ".claude"
    "dockerData"
    ".turbo"
)

# 构建 tar 排除参数
EXCLUDE_ARGS=""
for item in "${EXCLUDES[@]}"; do
    EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$item"
done

echo -e "${YELLOW}[信息]${NC} 项目目录: $PROJECT_DIR"
echo -e "${YELLOW}[信息]${NC} 排除项:"
for item in "${EXCLUDES[@]}"; do
    echo -e "       - $item"
done
echo ""

# 切换到项目父目录
cd "$PROJECT_DIR/.."

# 打包
echo -e "${YELLOW}[步骤]${NC} 正在打包..."
tar -czvf "$OUTPUT_FILE" $EXCLUDE_ARGS "$PROJECT_NAME"

if [ $? -eq 0 ]; then
    # 获取文件大小
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  打包完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "  文件: ${CYAN}$OUTPUT_FILE${NC}"
    echo -e "  大小: ${CYAN}$FILE_SIZE${NC}"
    echo ""
    echo -e "  部署方法:"
    echo -e "  ${YELLOW}1.${NC} 拷贝到目标机器"
    echo -e "  ${YELLOW}2.${NC} 解压: ${CYAN}tar -xzvf ${PROJECT_NAME}-${TIMESTAMP}.tar.gz${NC}"
    echo -e "  ${YELLOW}3.${NC} 进入目录: ${CYAN}cd ${PROJECT_NAME}${NC}"
    echo -e "  ${YELLOW}4.${NC} 启动服务: ${CYAN}./npm-downloader.ps1 start${NC} (Windows)"
    echo -e "            或 ${CYAN}./start.sh${NC} (Linux/Mac)"
    echo ""
else
    echo -e "${RED}[错误]${NC} 打包失败"
    exit 1
fi
