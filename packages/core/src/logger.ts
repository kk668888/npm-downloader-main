import pino from "pino";

// 创建一个 logger 实例
export const logger = pino({
  level: "info", // 设置最低日志级别
});
