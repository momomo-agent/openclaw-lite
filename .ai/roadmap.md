# Paw — Roadmap

## 当前 Feature: F016 — release.sh 签名流程修复

### Phase 1: 修复 release.sh
- [ ] electron-builder 加 `--config.mac.identity=null` 彻底禁用内置签名
- [ ] DMG 制作改用 staging 目录（`cp -R $APP $STAGE/ && hdiutil -srcfolder $STAGE`）
- [ ] codesign 加 `--timestamp`
- [ ] docs/index.html 版本替换改为精确匹配（不全局 sed）

### Phase 2: 加验证步骤
- [ ] 签名验证: `codesign --verify --deep --strict --verbose=2`
- [ ] Gatekeeper 验证: `spctl -a -vv --type install`
- [ ] 公证验证: `xcrun stapler validate`
- [ ] 任一验证失败则脚本 exit 1

### Phase 3: 端到端测试
- [ ] 跑一次完整 release.sh，确认 DMG 可安装可运行
- [ ] 上传 GitHub Release，确认下载链接可用
