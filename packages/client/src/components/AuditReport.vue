<template>
  <Teleport to="body">
    <!-- 遮罩 -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && report"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />
    </Transition>

    <!-- 居中弹窗 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open && report"
        class="fixed inset-0 z-50 flex items-center justify-center p-6"
      >
        <div class="flex flex-col rounded-xl border border-base-700/60 bg-base-950 shadow-2xl shadow-black/50 overflow-hidden"
          style="width: 1400px; height: 800px; max-width: calc(100vw - 48px); max-height: calc(100vh - 48px);"
        >
          <!-- 头部 -->
          <div class="px-6 py-4 border-b border-base-800/60 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center"
                  :class="headerIconBg"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5"
                    :class="headerIconColor"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <template v-if="isBlocked">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </template>
                    <template v-else-if="isRisky">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </template>
                    <template v-else-if="isUnavailable">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </template>
                    <template v-else>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </template>
                  </svg>
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-base-100">安全审计报告</h3>
                  <p class="text-[11px] text-base-500 mt-0.5">
                    {{ headerSubtitle }}
                  </p>
                </div>
              </div>
              <button
                class="p-1.5 rounded-md text-base-500 hover:text-base-200 hover:bg-base-800/50 transition-colors"
                @click="$emit('cancel')"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <!-- unavailable 警告横幅 -->
            <div v-if="isUnavailable" class="mt-3 px-3 py-2 rounded-md bg-orange-500/10 border border-orange-500/20">
              <p class="text-[11px] text-orange-400">
                漏洞数据库不可用（{{ report.reason === 'audit_timeout' ? '审计超时' : '网络错误' }}），未能完成有效安全审计。继续下载可能存在安全风险。
              </p>
            </div>

            <!-- 跳过依赖提示横幅 -->
            <div v-if="hasSkippedDeps" class="mt-3 px-3 py-2 rounded-md bg-accent/10 border border-accent/20">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] text-accent font-medium">
                  {{ report.skippedDeps!.length }} 个依赖未包含在下载中
                </span>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span
                  v-for="(count, reason) in skippedReasonSummary"
                  :key="reason"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-base-800/50 text-base-400"
                >
                  {{ skippedReasonLabel(reason as string) }}: {{ count }}
                </span>
              </div>
            </div>

            <!-- 摘要统计 -->
            <div class="flex items-center gap-3 mt-3">
              <div v-if="report.summary.critical > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-danger/10 text-danger text-[11px] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-danger" />
                严重 {{ report.summary.critical }}
              </div>
              <div v-if="report.summary.high > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-500/10 text-orange-400 text-[11px] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-orange-400" />
                高危 {{ report.summary.high }}
              </div>
              <div v-if="report.summary.moderate > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent/10 text-accent text-[11px] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-accent" />
                中危 {{ report.summary.moderate }}
              </div>
              <div v-if="report.summary.low > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-400/10 text-blue-400 text-[11px] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-400" />
                低危 {{ report.summary.low }}
              </div>
              <div v-if="isSafe" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-success/10 text-success text-[11px] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-success" />
                全部安全
              </div>
            </div>
          </div>

          <!-- 内容区域 -->
          <div class="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-thin">
            <!-- 漏洞表格（risky / blocked 状态） -->
            <div v-if="isRisky || isBlocked" class="space-y-3">
              <div
                v-for="item in vulnerableItems"
                :key="`${item.packageName}@${item.version}`"
                class="rounded-lg border border-base-800/60 p-4 bg-base-900/30"
              >
                <div class="flex items-center gap-2.5 mb-3">
                  <span class="text-sm font-mono font-medium text-base-200">{{ item.packageName }}</span>
                  <span class="text-[10px] font-mono text-base-500 bg-base-800/50 px-1.5 py-0.5 rounded">v{{ item.version }}</span>
                  <span v-if="item.deprecated" class="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">已弃用</span>
                </div>

                <div v-if="item.deprecated && item.deprecationMessage" class="text-[11px] text-orange-400/80 mb-3 pl-3 border-l-2 border-orange-400/30">
                  {{ item.deprecationMessage }}
                </div>

                <div class="space-y-2">
                  <div v-for="(vuln, idx) in item.vulnerabilities" :key="idx"
                    class="ml-4 pl-4 py-2 rounded-r-md"
                    :class="severityRowClass(vuln.severity)"
                  >
                    <div class="flex items-center gap-2.5">
                      <span
                        class="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                        :class="severityClass(vuln.severity)"
                      >
                        {{ severityLabel(vuln.severity) }}
                      </span>
                      <span class="text-xs text-base-300">{{ vuln.title }}</span>
                      <a v-if="vuln.url" :href="vuln.url" target="_blank"
                        class="text-[10px] text-accent hover:underline ml-auto"
                      >
                        详情
                      </a>
                    </div>
                    <div v-if="vuln.patchedVersions" class="text-[10px] text-base-500 mt-1.5">
                      修复版本: <span class="text-success font-mono">{{ vuln.patchedVersions }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 弃用但无漏洞的包 -->
              <template v-for="item in deprecatedOnlyItems" :key="`dep-${item.packageName}@${item.version}`">
                <div class="rounded-lg border border-orange-400/20 p-4 bg-orange-400/5">
                  <div class="flex items-center gap-2.5">
                    <span class="text-sm font-mono font-medium text-base-200">{{ item.packageName }}</span>
                    <span class="text-[10px] font-mono text-base-500 bg-base-800/50 px-1.5 py-0.5 rounded">v{{ item.version }}</span>
                    <span class="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">已弃用</span>
                  </div>
                  <div v-if="item.deprecationMessage" class="text-[11px] text-orange-400/80 mt-2 pl-3 border-l-2 border-orange-400/30">
                    {{ item.deprecationMessage }}
                  </div>
                </div>
              </template>
            </div>

            <!-- safe 状态：无漏洞 -->
            <div v-if="isSafe" class="flex flex-col items-center justify-center h-full text-base-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mb-4 text-success/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p class="text-sm text-base-400">所有包均未发现已知安全漏洞</p>
              <p class="text-[11px] text-base-600 mt-1 font-mono">{{ report.auditedPackages }} / {{ report.totalPackages }} 个包已扫描</p>
            </div>

            <!-- unavailable 状态：审计不可用 -->
            <div v-if="isUnavailable" class="flex flex-col items-center justify-center h-full text-base-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mb-4 text-orange-400/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p class="text-sm text-orange-400">未能完成安全审计</p>
              <p class="text-[11px] text-base-600 mt-1">
                {{ report.reason === 'audit_timeout' ? '审计请求超时（30秒）' : '漏洞数据库连接失败' }}
              </p>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="px-6 py-4 border-t border-base-800/60 flex-shrink-0 flex items-center justify-between">
            <span class="text-[11px] text-base-500">
              {{ footerMessage }}
            </span>
            <div class="flex items-center gap-2.5">
              <button
                class="px-5 py-2 text-xs font-medium rounded-md text-base-400 hover:text-base-200 hover:bg-base-800/50 transition-colors"
                @click="$emit('cancel')"
              >
                {{ isBlocked ? '关闭' : '取消' }}
              </button>
              <button
                v-if="!isBlocked"
                class="px-5 py-2 text-xs font-medium rounded-md transition-colors"
                :class="confirmButtonClass"
                @click="$emit('confirm')"
              >
                {{ confirmButtonText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { AuditReport, PackageAuditResult, AuditSeverity, SkippedDep } from "@npm-downloader/types";

const props = defineProps<{
  open: boolean;
  report: AuditReport | null;
}>();

defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const isSafe = computed(() => props.report?.auditStatus === "safe");
const isRisky = computed(() => props.report?.auditStatus === "risky");
const isBlocked = computed(() => props.report?.auditStatus === "blocked");
const isUnavailable = computed(() => props.report?.auditStatus === "unavailable");

const headerIconBg = computed(() => {
  if (isBlocked.value) return "bg-danger/20";
  if (isRisky.value) return "bg-danger/15";
  if (isUnavailable.value) return "bg-orange-400/15";
  return "bg-success/15";
});

const headerIconColor = computed(() => {
  if (isBlocked.value) return "text-danger";
  if (isRisky.value) return "text-danger";
  if (isUnavailable.value) return "text-orange-400";
  return "text-success";
});

const headerSubtitle = computed(() => {
  if (!props.report) return "";
  if (isBlocked.value) return `发现 ${props.report.summary.critical} 个严重漏洞，下载已被阻止`;
  if (isUnavailable.value) return "审计不可用，未完成有效扫描";
  return `已扫描 ${props.report.auditedPackages} 个包`;
});

const footerMessage = computed(() => {
  if (!props.report) return "";
  if (isBlocked.value) return "存在严重安全漏洞，下载已被系统阻止";
  if (isUnavailable.value) return "审计不可用，继续下载需自行承担风险";
  if (isRisky.value) return `${props.report.vulnerablePackages} 个包存在风险`;
  return "未发现安全风险";
});

const confirmButtonText = computed(() => {
  if (isBlocked.value) return "";
  if (isUnavailable.value) return "仍然下载";
  if (isRisky.value) return "仍然继续下载";
  return "开始下载";
});

const confirmButtonClass = computed(() => {
  if (isBlocked.value) return "";
  if (isUnavailable.value) return "bg-orange-400/15 text-orange-400 hover:bg-orange-400/25";
  if (isRisky.value) return "bg-danger/15 text-danger hover:bg-danger/25";
  return "bg-success/15 text-success hover:bg-success/25";
});

const vulnerableItems = computed(() => {
  if (!props.report) return [];
  return props.report.results.filter((r) => r.vulnerabilities.length > 0);
});

const deprecatedOnlyItems = computed(() => {
  if (!props.report) return [];
  return props.report.results.filter(
    (r) => r.deprecated && r.vulnerabilities.length === 0
  );
});

/** 是否存在被跳过的非 registry 依赖 */
const hasSkippedDeps = computed(() => {
  return props.report?.skippedDeps && props.report.skippedDeps.length > 0;
});

/** 按原因分类统计跳过的依赖 */
const skippedReasonSummary = computed(() => {
  if (!props.report?.skippedDeps) return {} as Record<string, number>;
  return props.report.skippedDeps.reduce((acc, dep) => {
    acc[dep.reason] = (acc[dep.reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
});

/** 跳过原因的中文标签 */
const skippedReasonLabel = (reason: string): string => {
  const labels: Record<string, string> = {
    workspace: "工作区",
    file: "本地文件",
    link: "符号链接",
    git: "Git 仓库",
    alias: "别名",
    catalog: "目录协议",
    unknown: "其他",
  };
  return labels[reason] || reason;
};

const severityClass = (severity: AuditSeverity): string => {
  switch (severity) {
    case "critical": return "bg-danger/15 text-danger";
    case "high": return "bg-orange-400/15 text-orange-400";
    case "moderate": return "bg-accent/15 text-accent";
    case "low": return "bg-blue-400/15 text-blue-400";
    default: return "bg-base-800/50 text-base-400";
  }
};

/** 每条漏洞行的背景色 + 左边框 */
const severityRowClass = (severity: AuditSeverity): string => {
  switch (severity) {
    case "critical": return "border-l-2 border-danger/50 bg-danger/5";
    case "high": return "border-l-2 border-orange-400/50 bg-orange-400/5";
    case "moderate": return "border-l-2 border-accent/50 bg-accent/5";
    case "low": return "border-l-2 border-blue-400/50 bg-blue-400/5";
    default: return "border-l border-base-700/50 bg-base-800/20";
  }
};

const severityLabel = (severity: AuditSeverity): string => {
  switch (severity) {
    case "critical": return "严重";
    case "high": return "高危";
    case "moderate": return "中危";
    case "low": return "低危";
    default: return "信息";
  }
};
</script>
