<p align="center"><img src="docs/store-preview.png" alt="代码编辑器功能预览"></p>

<h1 align="center">代码编辑器</h1>
<p align="center">一款为快速查看、搜索和修改本地文件而生的轻量 macOS 编辑器。</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-Native-111111" alt="Native macOS">
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-58A55C" alt="Local only">
  <img src="https://img.shields.io/badge/License-MIT-7AC143" alt="MIT License">
</p>

## 功能一览

### 文件和文件夹，随手打开

左侧资源管理器把常用入口放在最顺手的位置。

<p align="center"><img src="docs/feature-files.png" alt="代码编辑器的文件与文件夹入口" width="900"></p>

### 从一个文件开始，也能打开完整项目

新建、打开文件与打开文件夹都支持按钮和键盘快捷键。

<p align="center"><img src="docs/feature-start.png" alt="代码编辑器的欢迎页与快捷入口" width="900"></p>

### 需要查看时，安心只读

安全模式会明确标记只读状态，降低浏览陌生项目时的误改风险。

<p align="center"><img src="docs/feature-readonly.png" alt="代码编辑器的安全只读模式" width="900"></p>

## 亮点

- 打开单个文件或完整文件夹。
- 资源管理器、全文搜索与常用编辑操作集中在一个窗口。
- 安全只读模式降低误改风险。
- 深色界面与清晰的文件状态提示。
- 文件始终留在本机，不上传代码或文档。

## 安装

从 [GitHub Releases](https://github.com/ORDOABCHAOWT/vibe-code-editor/releases) 下载“代码编辑器.app”，拖入“应用程序”。客户端可独立运行，不需要保留源码。

## 开发与验证

```bash
npm test
npm run build
```

`npm test` 运行原生工程静态检查；`npm run build` 构建 macOS App。Monaco Editor 等组件的授权信息见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。

## License

[MIT](LICENSE) © ORDOABCHAOWT
