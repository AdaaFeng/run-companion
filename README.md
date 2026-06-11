# 跑跑陪你

一个为 iPhone 做的轻量语音陪跑 PWA：

- 快走 15 分钟到 Inverleith Park
- 跑 400 米 + 走 200 米，共 5 组
- 慢走回家
- GPS 自动计距，也支持手动完成每段
- 每段开始、过半和剩余 50 米时语音提醒
- 内置 Zephyr(Sports) ElevenLabs 中文陪跑语音
- 可暂停、恢复，并在意外刷新后找回进度
- 支持添加到 iPhone 主屏幕和离线打开

## 本地打开

需要通过 HTTP 服务打开，不能直接双击 `index.html`。任何静态文件服务器都可以。

## GitHub Pages

仓库的 Pages 来源选择默认分支根目录即可。发布后在 iPhone Safari 打开链接，
点击“分享”，再选“添加到主屏幕”。

## ElevenLabs 自定义声音

不要把 ElevenLabs API key 写进网页或提交到 GitHub。官方文档明确要求 API key
不得暴露在浏览器或客户端代码中。

本项目采用预生成语音包：在可信电脑上设置 `ELEVENLABS_API_KEY` 和
`ELEVENLABS_VOICE_ID`，运行：

```powershell
node scripts/generate-voice-pack.mjs
```

生成的 MP3 和 `audio/voice-pack.json` 可以安全公开；API key 不会写入文件。

没有语音包时，应用会自动使用 iPhone 自带中文语音。

## 使用提醒

网页 GPS 在锁屏或 Safari 被系统挂起后可能停止更新。训练时请把应用放在前台；
应用会在浏览器支持时自动保持屏幕唤醒。GPS 读数会有误差，尤其在树木或建筑物附近。
