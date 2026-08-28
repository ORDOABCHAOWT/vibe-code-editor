<p align="center"><img src="docs/store-preview.png" alt="代码编辑器功能预览"></p>

<h1 align="center">代码编辑器</h1>
<p align="center">一款为快速查看、搜索和修改本地文件而生的轻量 macOS 编辑器。</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-Native-111111" alt="Native macOS">
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-58A55C" alt="Local only">
  <img src="https://img.shields.io/badge/License-MIT-7AC143" alt="MIT License">
</p>

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
