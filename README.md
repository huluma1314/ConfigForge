# ConfigForge

ConfigForge 是一个纯前端代理配置转换器，目标是完成 Quantumult X / Surge / Clash 三种格式之间的完整互转。当前仓库已经交付了一个可运行、可打包、可继续迭代的第一版，并能输出单个 HTML 文件离线使用。

## 当前能力

- QX / Surge / Clash 三种格式自动检测或手动指定
- 粘贴文本与本地文件导入
- 6 条转换路径的基础闭环
- 节点 / 策略组 / 规则的常见结构转换
- 保留并输出常见高级字段：`uuid`、`username`、`password`、`cipher`、`network/obfs`、`sni`、`host`、`path`、`tls`、`udp`
- Clash `proxy-providers` 与 `use` 可近似映射到 QX / Surge 的 `policy-path`
- 复制输出、下载输出、基础语法校验
- 远程资源展开开关、拉取失败提示，以及规则/节点远程内容并入 IR 的基础能力
- 单 HTML 构建产物

## 技术修正

- 保留了 Alma 文档建议的 `TypeScript + Vite + vite-plugin-singlefile` 路线，因为它适合快速产出单 HTML。
- 第一版优先完成常见配置的可运行闭环，不承诺所有协议冷门字段都 100% 保真。
- `file://` 下远程拉取受浏览器 CORS 限制，UI 会提示限制；这不是本项目代码独有问题。
- 未明确映射的规则或策略组会通过注意事项暴露，而不是静默丢弃。

## 当前已知边界

- 远程资源展开受浏览器网络权限和 CORS 影响，在 `file://` 双击打开时成功率低于本地 HTTP 预览。
- 已实现远程 provider / policy-path 的基础并入，但还没有覆盖所有社区变体格式。
- 节点协议已经具备统一 IR 和常见字段传递能力，但 Hysteria / Hysteria2 / TUIC 等协议仍需要更多真实样本来继续细化。
- 输出校验当前是“格式有效性”校验，不等于“目标客户端语义一定完全一致”。

## 目录结构

```text
src/domain       IR、图校验、合并逻辑
src/parsers      QX / Surge / Clash 解析器
src/generators   三种格式生成器与 provider 映射
src/remote       远程拉取与并入逻辑
src/main.ts      前端入口
test/fixtures    配置样本
test             回归测试
```

## 开发

```bash
npm install
npm run dev
```

默认会启动本地开发服务器。推荐通过浏览器打开终端输出里的 `http://127.0.0.1:PORT/` 地址进行调试。

## 构建单文件

```bash
npm run build
```

构建完成后打开 `dist/index.html` 即可使用。

## 测试

```bash
npm test
```

当前测试覆盖：

- 3 种格式自动检测
- 6 条转换路径基础闭环
- `FINAL / MATCH` 终结规则语义
- Clash provider 到 QX policy-path 的近似映射
- 常见高级节点字段输出
- 远程规则资源并入转换链路

## 下一步建议

- 扩大真实配置 fixture，尤其是复杂策略组和更多协议
- 细化 Hysteria / Hysteria2 / TUIC / VLESS 专属字段映射
- 增强 QX / Surge / Clash 社区变体兼容性
- 增加真实客户端导入验收记录
