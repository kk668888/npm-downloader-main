/**
 * Peer 储备合并工具 —— Phase 3
 *
 * 职责：
 *   把 Phase 2 `resolvePeerReserve` 产出的 `ResolvedPeerPackage[]` 合并进
 *   `processAll` 的 packages 数组，并提供配套的纯函数：
 *     1) 开关解析（includePeerReserve 宽松布尔解析）
 *     2) existingSpecs 构造（lockfile 已有包的去重集合）
 *     3) ResolvedPeerPackage → PackageInfo 转换（scope/name 拆分 + tarball 透传）
 *     4) 合并（不可变，不 mutate 入参 packages）
 *
 * 设计原则：
 *   - 全部为纯函数，无副作用，便于单测覆盖；
 *   - 严格 TS、零隐式 any；
 *   - immutability：始终构造新数组/新对象，绝不修改入参。
 *
 * 这些函数被 `lockfileController.processAll` 调用，
 * 将原本耦合在 controller 内的转换/合并逻辑抽离，提升可测性与可读性。
 */

import { parsePackage, type PackageInfo } from "@npm-downloader/core";
import type { ResolvedPeerPackage } from "../services/peerReserveService.js";

/**
 * 宽松解析 includePeerReserve 开关。
 *
 * 接受的“真”值：true / "true"（大小写不敏感） / "1"。
 * 其余（false / "false" / "0" / undefined / 任意字符串）一律视为 false。
 *
 * 与现有 `blockCritical`（`!== "false" && !== "0"`）的宽松解析风格保持一致：
 * 即便前端通过 multipart/form-data 传字符串，也能正确识别。
 *
 * @param raw 来自 req.body 的原始值（类型不确定，故用 unknown）
 * @returns 解析后的布尔值，默认 false
 */
export function parseIncludePeerReserveFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  // number 1 视为 true，其他 number 视为 false（防御性，multipart 一般是字符串）
  if (typeof raw === "number") {
    return raw === 1;
  }
  return false;
}

/**
 * 根据 packages 数组构造 existingSpecs 集合。
 *
 * spec 口径：`${全名}@${version}`，其中全名 = scope ? `${scope}/${name}` : name。
 * 这与 peerReserveService 内部的 `buildSpec` 完全一致，
 * 从而保证 service 内 visited 的初始去重口径与 lockfile packages 严格对齐。
 *
 * 不可变：基于入参 packages 只读创建新 Set，绝不修改入参数组或其元素。
 *
 * @param packages lockfile 解析出的 packages（只读）
 * @returns 新建的 Set<`${全名}@${version}`>
 */
export function buildExistingSpecs(
  packages: ReadonlyArray<PackageInfo>
): Set<string> {
  return new Set(
    packages.map((pkg) => {
      const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
      return `${fullName}@${pkg.version}`;
    })
  );
}

/**
 * 将单个 ResolvedPeerPackage 转换为 PackageInfo。
 *
 * 转换要点：
 *   - rp.name 是“含 scope 的全名”（如 `@types/node`），需要拆分为 scope + name
 *     以匹配 PackageInfo 的字段约定（scope 可选、name 不含 scope）；
 *   - 复用 core 的 `parsePackage(`${rp.name}@${rp.version}`)` 拿到 scope/name/version，
 *     与 lockfile 解析口径完全一致（single source of truth）；
 *   - 附加 tarball = rp.tarball，保证下载侧 `resolvePackageUrl` 优先用真实地址；
 *   - 失败保护：parsePackage 返回 null 时（理论上不会发生，rp.name/version 必然合法），
 *     抛出明确错误，避免静默丢包。
 *
 * 不可变：始终构造新对象，不修改入参 rp。
 *
 * @param rp service 解析出的单个 peer 储备包
 * @returns 等价的 PackageInfo（含 tarball）
 * @throws 当 parsePackage 无法解析 `${rp.name}@${rp.version}` 时抛出（防御性）
 */
export function resolvedPeerToPackageInfo(rp: ResolvedPeerPackage): PackageInfo {
  const spec = `${rp.name}@${rp.version}`;
  const parsed = parsePackage(spec);
  if (!parsed) {
    // 理论不可达：service 的 rp.name/version 来自 pacote.manifest，必然合法。
    // 但为了严格类型与不静默丢包，这里显式抛出。
    throw new Error(`无法解析 peer 储备包 spec: ${spec}`);
  }
  // 不可变构造：基于 parsed（已含 scope?/name/version）附加 tarball 字段
  return {
    ...parsed,
    tarball: rp.tarball,
  };
}

/**
 * 把 ResolvedPeerPackage[] 批量转换为 PackageInfo[]。
 *
 * 仅是 `resolvedPeerToPackageInfo` 的 map 包装，保留为一个独立导出函数：
 *   - 调用方语义更清晰（直接拿到数组）；
 *   - 单测可分别覆盖“单条转换”与“批量转换”。
 *
 * 不可变：返回新数组，不修改入参。
 *
 * @param resolved service 解析出的 peer 储备包列表
 * @returns 等价的 PackageInfo 列表
 */
export function mapResolvedToPackageInfos(
  resolved: ReadonlyArray<ResolvedPeerPackage>
): PackageInfo[] {
  return resolved.map(resolvedPeerToPackageInfo);
}

/**
 * 把 peer 储备包合并进原 packages 数组。
 *
 * 合并语义：
 *   - existingSpecs 已在 service 内保证 peer 储备包不与 lockfile 重复，
 *     因此此处直接“原 packages + peerPackages”拼接即可；
 *   - 不在此处再次去重 —— 若重复，意味着 service 的 visited 失效，
 *     应在 service 侧修复，而非在此处静默吞掉（避免掩盖 bug）。
 *
 * 不可变（关键）：始终返回新数组，绝不修改入参 `basePackages`。
 *
 * @param basePackages lockfile 解析出的原始 packages（只读）
 * @param peerPackages peer 储备转换后的 packages（只读）
 * @returns 合并后的新 packages 数组
 */
export function mergePeerReservePackages(
  basePackages: ReadonlyArray<PackageInfo>,
  peerPackages: ReadonlyArray<PackageInfo>
): PackageInfo[] {
  // 展开运算符构造新数组 —— 不 mutate 任一入参
  return [...basePackages, ...peerPackages];
}
