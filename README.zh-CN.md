# ComfyUI RectumFire

**语言：** [English](README.md) | **简体中文**

RectumFire 是一个面向日常工作流痛点的 ComfyUI 小型实用节点包。

这不是一组只适合单一场景的小技巧。
它解决的是那些反复出现、真正影响使用体验的问题：
- 导入别人的工作流后直接坏掉
- 模型选择丢失或路径不匹配
- 路由节点越来越乱
- 看不到运行时间
- 子图里的预览信息很难往外显示

这也是它叫 `RectumFire` 的原因。

## 包含内容

- `Fire Resolve`
- `Fire Copy`
- `Fire Note`
- `Fire Banner`
- `Fire Switch`
- `Fire Timer`
- `Fire Done`
- `Fire Label`

## 安装

把这个仓库放进 `ComfyUI/custom_nodes/`。

如果你使用 git：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/vladgohn/ComfyUI-RectumFire.git
```

然后重启 ComfyUI。

## RectumFire 的核心

RectumFire 一开始就是为了解决一个非常常见的问题：
打开别人分享的工作流后，因为模型缺失、重命名或路径不同，整个工作流无法正常工作。

如果没有工具，这种修复过程很慢，也很烦。
RectumFire 把它变成一个简单流程：

1. 先尝试自动修复
2. 提取缺失信息
3. 把修复信息直接留在图里

## Fire Resolve

快捷键：`Shift + Alt + R`

`Fire Resolve` 是修复导入工作流最直接的工具。

选中一个节点，按下快捷键。
如果你本地其实有对应模型，只是名称或路径不一致，它会尝试自动重新匹配。

好处很直接：
- 少手动搜索
- 少手动输入
- 少做重复又无聊的修复工作

## Fire Copy

快捷键：`Shift + Alt + C`

如果 `Fire Resolve` 无法自动修复，`Fire Copy` 会把这个节点里真正有用的信息提取出来。

通常是模型文件名。
如果提取不到，就回退为简洁的节点 JSON 快照。

重点是：
即使自动修复失败，你也能立刻拿到正确的信息，不用手动翻工作流文件。

## Fire Note

粘贴快捷键：`Shift + Alt + V`

`Fire Note` 用来承载修复上下文。

复制之后，粘贴会在光标附近创建一个 note，并把收集到的信息直接插入工作流。
已找到的模型会标记为 `✅`，缺失的模型会标记为 `❌`。

这样下一步会快很多：
- 一眼看到本地已有的模型
- 一眼看到缺失的模型
- 可以直接复制缺失文件名去模型站搜索

这三个节点本来就是一套工作流。
它们是整个包的基础。

## Fire Banner

![Fire Banner](screens/fire_banner.png)

`Fire Banner` 是这个包里的 killer feature。

ComfyUI 的子图在可用性上一直有一个很大的问题：
子图内部的视觉预览信息，很难以实用的方式显示到外层。

`Fire Banner` 就是为了解决这个问题。
它能把预览信息往外带出来，让子图更容易观察、更容易调试。

这不只是好看。
如果你经常用模块化或嵌套工作流，这个功能会非常实用。

## Fire Switch

![Fire Switch](screens/fire_switch.png)

`Fire Switch` 是一个用于可互换分支的 `ANY` 切换节点。

类似思路的节点别的包里也有，但这个版本修掉了一个很烦的问题：
断开或重接之后留下来的 ghost inputs。

它的价值不在“新奇”，而在于行为更干净，图不会越来越脏。

当前已知限制：
这个节点目前是按索引切换。
它还没有完全复现 `Switch (Any)` 的行为，也就是当某一路被 mute 之后，自动切到下一个可用输入。

这个行为已经确认需要做，但目前还没有实现。

## 日常体验增强节点

## Fire Timer

![Fire Timer](screens/fire_timer.png)

`Fire Timer` 是一个你会愿意一直放在画布上的运行计时器。

它能立即告诉你工作流正在运行，执行结束后还会保留最终耗时，而且界面做得比普通调试小工具更有风格。

这种节点一旦开始用，就很难再离开。

## Fire Done

![Fire Done](screens/fire_done.png)

`Fire Done` 是一个简单的完成提示节点。

它存在的意义很明确：
“队列结束”不一定等于“我关心的那条分支真的跑完了”。
把它放在真正重要的终点位置，它就会给你一个可见且可听的完成信号。

如果你已经熟悉 `Custom Scripts` 里的 `PlaySound`，那么可以把它理解为相近用途的替代方案。
区别在于 `Fire Done` 更简单、更轻、更直接，而且默认声音也不同。

这个版本刻意保持简单。
没有臃肿的声音选择 UI，也没有多余设计。
如果你想换声音，直接替换 `js/assets/done.wav` 即可。

## Fire Label

![Fire Label](screens/fire_label.png)

`Fire Label` 可以直接在图里做哥特风标题。

它不追求更多功能，而是让大型工作流更清晰、更好看。
它风格明显、足够轻量，而且不依赖额外安装字体。

## 说明

- 这个包导出的后端节点包括 `Fire Timer`、`Fire Done`、`Fire Note`、`Fire Switch`、`Fire Banner`
- `Fire Label`、`Fire Copy`、`Fire Resolve` 属于前端工具 / 扩展
- `fire_route.py` 存在于仓库中，但目前没有作为正式节点导出

## 故障排查

### 节点没有出现

- 确认仓库位于 `ComfyUI/custom_nodes/` 下
- 完全重启 ComfyUI
- 查看 ComfyUI 控制台是否有导入错误

### Fire Done 没有声音

- 确认节点实际执行到了
- 确认 `enable` 已开启
- 如果浏览器拦截自动播放，先与标签页交互一次

### Fire Resolve 没有反应

- 先选中节点
- 使用 `Shift + Alt + R`
- 它只能自动修复那些已经存在于你本地可选项中的模型

### Fire Banner 没有显示预览

- 确认已经连接图像输入
- 确认对应分支实际执行过
- 确认 ComfyUI 的临时输出目录可写

## 许可证

本仓库使用 [Apache-2.0](LICENSE) 许可证。
作者署名信息会通过许可证和 [NOTICE](NOTICE) 文件保留。

## 支持项目

如果 RectumFire 为你节省了时间，你可以通过 GitHub Sponsors 支持这个项目：

- [GitHub Sponsors](https://github.com/sponsors/vladgohn)

如果你需要付费帮助，最匹配的方向是：
- ComfyUI 工作流修复
- 工作流整理与图形 UX 优化
- 子图可观测性 / 实用节点集成
