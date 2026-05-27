/**
 * 服务端打包脚本
 *
 * 使用 esbuild 将 Express 服务器及其所有依赖打包成单个 JS 文件
 * 这样 electron-builder 不需要处理 pnpm monorepo 的 node_modules 结构
 *
 * 打包产物：build/server/app.js（单个文件，包含所有运行时代码）
 */

const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const ROOT_DIR = path.resolve(__dirname, '../..')
const BUILD_DIR = path.resolve(__dirname, '../build/server')

/**
 * esbuild 插件：在 CJS 格式中模拟 import.meta.url
 *
 * 问题：esbuild 输出 CJS 格式时，import.meta 变成空对象 ({})，
 * 导致 fileURLToPath(import.meta.url) 报错。
 *
 * 方案：在 bundle 顶部注入一个用 __filename 构造的 import.meta 模拟对象，
 * 替换所有 import.meta 引用为该对象。
 */
const importMetaPlugin = {
  name: 'import-meta-shim',
  setup(build) {
    const { onLoad, onResolve } = build

    // 拦截所有 JS/TS 文件，将 import.meta 替换为模拟对象
    build.onLoad({ filter: /\.(js|ts|mjs)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8')

      // 如果文件不包含 import.meta，直接跳过
      if (!source.includes('import.meta')) {
        return { contents: source, loader: 'js' }
      }

      // 将 import.meta 替换为 __cjs_import_meta__
      const transformed = source.replace(
        /import\.meta\b/g,
        '__cjs_import_meta__'
      )

      return { contents: transformed, loader: 'js' }
    })
  }
}

async function build() {
  console.log('[bundle-server] Starting server bundling...')

  // 清理旧的构建产物
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true })

  const entryPoint = path.join(ROOT_DIR, 'server/dist/app.js')

  // 检查入口文件是否存在
  if (!fs.existsSync(entryPoint)) {
    console.error(`[bundle-server] Entry point not found: ${entryPoint}`)
    console.error('[bundle-server] Please run "pnpm -C packages/server build" first')
    process.exit(1)
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: path.join(BUILD_DIR, 'app.js'),
      plugins: [importMetaPlugin],
      // 排除不需要的模块（Koa 相关：我们只用 Express 驱动）
      external: [
        '@koa/cors',
        '@koa/router',
        'koa',
        'koa-bodyparser',
        'koa-multer',
        'node-gyp',
      ],
      // 不压缩（方便调试）
      minify: false,
      // 保留调试信息
      sourcemap: false,
      // 定义环境变量
      define: {
        'process.env.DESKTOP_MODE': '"true"',
      },
      // 在 bundle 顶部注入 import.meta 模拟对象
      // CJS 中 __filename 和 __dirname 是内置全局变量
      banner: {
        js: `// import.meta.url 模拟（CJS 格式下 esbuild 会将 import.meta 替换为空对象）
var __cjs_import_meta__ = { url: require("url").pathToFileURL(__filename).href };
`,
      },
      // 日志级别
      logLevel: 'info',
      // 处理 package.json 中的 sideEffects
      treeShaking: true,
    })

    if (result.errors.length > 0) {
      console.error('[bundle-server] Build errors:', result.errors)
      process.exit(1)
    }

    if (result.warnings.length > 0) {
      console.warn('[bundle-server] Build warnings:', result.warnings)
    }

    // 检查输出文件大小
    const stat = fs.statSync(path.join(BUILD_DIR, 'app.js'))
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2)
    console.log(`[bundle-server] Bundle created: ${sizeMB} MB`)
    console.log(`[bundle-server] Output: ${BUILD_DIR}/app.js`)
  } catch (err) {
    console.error('[bundle-server] Build failed:', err)
    process.exit(1)
  }
}

build()
