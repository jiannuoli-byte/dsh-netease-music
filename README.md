# NetEase Cloud Music for DSH

在 [DeepSeek Harness](https://deepseek.com) 的 Web UI 里听网易云音乐：搜索、歌单、歌词、循环模式、多档音质，
以及一个常驻在输入框上方的播放条——一边聊天一边听。

> 这是一个第三方插件，与网易云音乐官方无关。仅供个人使用，请遵守网易云音乐的服务条款与当地法律。

## 功能

- **发现音乐**：推荐歌单（可「换一批」）、新歌速递
- **我的歌单**：登录后同步你自己的网易云歌单（含每日推荐）
- **搜索**：歌曲搜索，点击即播
- **播放器**：播放/暂停、上一首/下一首、进度拖动、音量、滚动歌词
- **循环模式**：列表循环 / 单曲循环 / 随机播放（播放条与主页面都有）
- **音质**：标准 128k / 较高 192k / 极高 320k / 无损 FLAC / Hi-Res FLAC
- **两种播放通道**：默认在 DSH 页面内播放；取不到地址的曲目可一键交给已登录的网易云桌面客户端
- **免扫码登录**：读取本机网易云客户端已登录的账号（Windows），也支持手机号验证码与 Cookie 粘贴

## 环境要求

| 项目 | 要求 |
| --- | --- |
| DSH | Desktop `0.2.0-rc.2` 或更高 |
| Node | 自带运行时即可（DSH Electron 内置 Node ≥ 22） |
| 系统 | 任意（页面内播放）；**读取客户端登录态仅限 Windows** |
| 网络 | 能访问 `music.163.com` |

## 安装

DSH 的「插件 → 添加插件」对话框接受三种来源，任选其一：

| 来源 | 填什么 | 说明 |
| --- | --- | --- |
| npm 包名 | `dsh-netease-music` | 尚未发布到 npm；发布后依赖会自动安装 |
| GitHub 仓库 | `https://github.com/jiannuoli-byte/dsh-netease-music` | **需要本机已安装 git**（pnpm 走 git 协议拉取）；装完若提示缺少本地服务，进目录跑一次 `npm run setup` |
| 本地目录 | 插件目录的绝对路径 | 开发时用，改完刷新页面即可 |

命令行等价物（让 agent 执行同一个工具）：

```
install_bundle  target: <包名 | 仓库地址 | 绝对路径>
```

装好刷新页面（`Ctrl+R`），左侧边栏出现 **♪ 音乐** 图标。

### 关于本地音乐 API

插件依赖 `NeteaseCloudMusicApi@4.32.0`（已在 `dependencies` 里声明）。正常安装会自动拉取；
只有“本地目录 / 仓库源码”这种方式可能拿不到依赖，此时：

```bash
npm run setup     # 装进 vendor/ncm/，默认走 npmmirror
```

可用 `NCM_REGISTRY` 换源、`NCM_VERSION` 换版本；脚本会依次尝试 npm → pnpm → DSH 自带 pnpm。
缺依赖时面板不会静默失败：`/netease-music/ping` 返回 `vendorReady:false`，接口返回 503 并提示这条命令。

## 登录

三种方式，任选其一（弹窗里的三个页签）：

1. **客户端**（推荐，Windows）：读取本机网易云客户端已登录的账号，点一下即可，不需要扫码。
2. **手机号**：短信验证码登录。
3. **Cookie**：粘贴浏览器里 music.163.com 的完整 Cookie（含 `MUSIC_U=`）。

登录态只保存在**本机浏览器 localStorage**，不会上传到任何地方。

首次打开音乐面板时，如果本地还没有登录态，插件会自动尝试一次「客户端」方式，并在右下角提示结果。

## 音质

音频直接使用网易云返回的原始流，经插件同源转发（`/netease-music/audio`）**原样透传、不做转码**，
所以同一档位下与官方客户端听到的一致。播放器上的小徽标显示接口真实返回的格式与码率。

| 档位 | 实际返回（实测） |
| --- | --- |
| 标准 | mp3 128 kbps |
| 较高 | mp3 192 kbps |
| 极高（默认） | mp3 320 kbps |
| 无损 | FLAC ≈ 908 kbps |
| Hi-Res | FLAC ≈ 1677 kbps |

无损与 Hi-Res 需要账号本身有对应权益。

## 架构

```
DSH Web UI (浏览器)
  ├─ sidebar.panellist    ♪ 图标
  ├─ main                音乐页面（发现 / 歌单 / 搜索 / 播放器）
  └─ conversation.input.dock   输入框上方的播放条
        │  同源 fetch，无端口、无 CORS
        ▼
  Host 插件（index.js）
  ├─ /netease-music/api/*     转发到本地 NeteaseCloudMusicApi 子进程
  ├─ /netease-music/audio     音频代理（Range 透传，支持拖动）
  ├─ /netease-music/image     封面代理（避免防盗链）
  ├─ /netease-music/client-play   orpheus:// 深链，交给桌面客户端播放
  ├─ /netease-music/client-session 读取客户端登录态（Windows）
  └─ /netease-music/diag      最近请求与页面错误（排障用）
        ▼
  vendor/ncm  NeteaseCloudMusicApi 子进程（127.0.0.1:4123）
```

页面侧所有槽位组件各自携带样式表——DSH 的槽位是独立挂载/卸载的，不能假设其他组件还在。

## 隐私与安全

- Cookie 只写入本机浏览器存储；插件不含任何遥测、上报或远程请求（除网易云自身域名）。
- 「读取客户端登录态」在本机完成：从客户端 Chromium 的 `Cookies` 库解密 `MUSIC_U`，
  AES 密钥由 Windows DPAPI 保护、仅当前用户可解。可用配置 `clientSession: false` 关闭该能力。
- 音频与封面代理只允许 `*.126.net` / `*.163.com` 目标，避免被当作通用代理使用。

## 已知限制

- 部分曲目受版权/会员限制，取不到播放地址；此时可用「用客户端播放」兜底。
- 少数网络流的原生 seek 会失败，插件会自动把该曲完整缓冲成本地 Blob 后再跳转（首次会有短暂停顿）。
- 读取客户端登录态只在 Windows 有效（依赖 `%LOCALAPPDATA%\Netease\CloudMusic`）。
- 歌词只有原文，未做翻译/罗马音对齐。

## 开发

```bash
npm run check   # 语法检查（node --check）
```

改完 `client.js` 后刷新页面即可；改 `index.js` 需要在 DSH 里禁用再启用该插件。

## 许可

MIT，见 [LICENSE](./LICENSE)。使用本插件产生的任何版权与合规责任由使用者自行承担。
