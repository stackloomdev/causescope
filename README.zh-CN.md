<div align="center">

# CauseScope

**点击任意界面，追踪它为何出现。**

面向 React + Vite 的本地优先溯源检查器。选中一个元素，就能沿着真实证据回到 TSX、表达式、状态、Props、Store 和网络数据。

[快速开始](docs/getting-started.md) · [配置](docs/configuration.md) · [适配器](docs/adapters.md) · [隐私](docs/privacy.md) · [English](README.md)

</div>

![CauseScope 演示：从编辑后的 React 元素追踪到源码与状态](docs/assets/causescope-demo.gif)

## 为什么使用 CauseScope？

React DevTools 能告诉你组件里有什么；CauseScope 专注于另一个问题：**这块具体的 UI 为什么会这样显示？**

- 从页面元素精确定位到 TSX 文件、行和列。
- 查看 JSX 表达式、实时操作数、结果和真正决定分支的条件。
- 追踪真实发生过的 `useState` / `useReducer` 更新，不伪造历史。
- 将一层 Props 追溯到父组件的 JSX 调用位置。
- 把值关联到 Fetch、XHR、React Query、Zustand、LocalStorage 或 SessionStorage。
- 导出经过二次脱敏的 JSON 或 Markdown 调试证据。
- 在生产构建中完全移除检查器和插桩。

CauseScope 使用隔离在 Shadow DOM 内的 Preact 面板，不需要账号、API Key、浏览器扩展或远程服务。

## 快速开始

```bash
pnpm add -D causescope@beta
```

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
```

启动 Vite 开发服务，点击右下角的 **Inspect**，然后选择任意元素。也可以按住 <kbd>Option</kbd>/<kbd>Alt</kbd> 直接点击。

插件只在开发模式的 `vite serve` 中生效。生产包不会包含 CauseScope 插桩、面板、编辑器接口或调试属性。

## 可选数据适配器

请在 React 首次渲染前安装适配器，让初始缓存和 Store 值也能保留来源。

```ts
if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { reactQueryAdapter }, { zustandAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/react-query"),
    import("causescope/adapters/zustand"),
  ]);

  const runtime = getCauseScopeRuntime();
  runtime.installAdapter(reactQueryAdapter({ queryClient }));
  runtime.installAdapter(zustandAdapter({ stores: { editorStore } }));
}
```

React Query 来源包含 query key、status、fetch status 和更新时间。Zustand Store 需要显式传入；CauseScope 不会扫描无关 Store。

## 兼容性

| 集成 | 支持范围 |
| --- | --- |
| React | 18、19 |
| Vite | 5、6 |
| TypeScript | 一等支持；仓库源码和测试全部使用 TS/TSX |
| 包管理器 | 任意 npm 兼容客户端；仓库自身使用 pnpm |

[`examples/`](examples) 包含 React 18、React 19、React Query 和 Zustand 示例。React 19 Lab 覆盖多页面、多组件、多文件的 Playwright 端到端场景，另有独立的 React 18/Vite 5 冒烟用例端到端验证兼容性下限。

## 隐私与边界

CauseScope 本地运行，没有遥测和上传链路。网络与 Storage 追踪默认只在开发环境开启，也可以分别关闭。它只记录当前页面运行期间实际访问过的 Storage key，不会枚举浏览器存储。

Authorization、Cookie、API Key、Token、Password、Secret 等常见变体会在请求头、URL、对象、面板和导出结果中默认脱敏。记录量也有明确上限：默认 10,000 个 trace 节点、200 条时间线事件、单响应 1 MB、响应总量 20 MB。

在敏感业务中使用前，请阅读完整的[隐私与威胁模型](docs/privacy.md)。

## 开发

这是一个 pnpm Workspace + Turborepo 项目。

```bash
pnpm install
pnpm check
```

完整检查包含类型检查、单元测试、全部构建、生产包无残留扫描、独立 tarball 消费端验证和 Playwright 端到端测试。

欢迎提交 Issue 和 Pull Request。参与前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

项目采用 [MIT License](LICENSE)。
