# Changelog

## [1.0.5](https://github.com/wooloo26/manhuagui-cli/compare/v1.0.4...v1.0.5) (2026-07-04)

### Bug Fixes

* **download:** catch [#next](https://github.com/wooloo26/manhuagui-cli/issues/next) selector timeout when button not present ([eed6e76](https://github.com/wooloo26/manhuagui-cli/commit/eed6e766fe50966edf129b06d85b2fb4fb638292))

## [1.0.4](https://github.com/wooloo26/manhuagui-cli/compare/v1.0.3...v1.0.4) (2026-07-04)

### Features

* **resume:** auto-select in-progress sections when resuming ([2b93b2d](https://github.com/wooloo26/manhuagui-cli/commit/2b93b2d1965bd5cc9f8ea2ba1170e08956fb96ce))

### Bug Fixes

* **cli:** read version from package.json instead of hardcoding ([9c714b6](https://github.com/wooloo26/manhuagui-cli/commit/9c714b645b26e03929064955b816c96aa3dde880))
* **download:** add visibility check and retry for click operations ([105f3a6](https://github.com/wooloo26/manhuagui-cli/commit/105f3a675369c0370b687c7cd537d2dccf549e6c))
* **download:** add visibility check and retry for click operations ([41596ee](https://github.com/wooloo26/manhuagui-cli/commit/41596eeab6a79c879f9e8f9b459bf0a0fb725fb5))
* **download:** record chapter as failed when image download errors ([e2df2a4](https://github.com/wooloo26/manhuagui-cli/commit/e2df2a4f1b321731eebf6951adc0f27b3baa4884))
* **overwrite:** overwrite only re-downloads unfinished (non-done) chapters, done chapters are always protected ([2e003c4](https://github.com/wooloo26/manhuagui-cli/commit/2e003c435ac9774eb14d26711e1c43f67d63366e))
* **progress:** allow resume of chapters with pending status ([3dd8427](https://github.com/wooloo26/manhuagui-cli/commit/3dd8427c9549ee9ea87bbbe3b8ba28cdb257fb3e))

## [1.0.3](https://github.com/wooloo26/manhuagui-cli/compare/v1.0.2...v1.0.3) (2026-07-04)

### Features

* **download:** add overwrite mode, CDN hash detection, and per-image resume ([1c75651](https://github.com/wooloo26/manhuagui-cli/commit/1c7565115bd4235de88ae03d8a30f4e9bdcad912))
* **progress:** add pending status to chapter progress tracking ([4a46c36](https://github.com/wooloo26/manhuagui-cli/commit/4a46c36170564a3a5f90c632bb07277c616efe5c))

## [1.0.2](https://github.com/wooloo26/manhuagui-cli/compare/v1.0.1...v1.0.2) (2026-07-03)

### Features

* **chapter:** report page count early and clarify progress labels ([078ca3c](https://github.com/wooloo26/manhuagui-cli/commit/078ca3c3723fa7e6784daf215460f809aa5da932))
* show pending section stats as initial title and add total ETA ([4873331](https://github.com/wooloo26/manhuagui-cli/commit/48733312ecfef6ea89db2c462ac36ec7b6f697a8))
* **ui:** show overall page count and use listing page count for initial chapter display ([37d789a](https://github.com/wooloo26/manhuagui-cli/commit/37d789abd43392ff77077920b3f230e1bf9b7f1f))

### Bug Fixes

* **config:** reduce default chapter delay range ([b35fadd](https://github.com/wooloo26/manhuagui-cli/commit/b35faddd859d2617802cfef40149e0646b15d677))

## [1.0.1](https://github.com/wooloo26/manhuagui-cli/compare/v1.0.0...v1.0.1) (2026-07-03)

### Features

* **config:** support config files and CLI args for configuration ([272bbd3](https://github.com/wooloo26/manhuagui-cli/commit/272bbd3fc468bb0b863772794e4be32243084db3))

### Bug Fixes

* **chapter:** strip URL fragment before comparing page URL in collectImageUrls ([d94849e](https://github.com/wooloo26/manhuagui-cli/commit/d94849e011d9642682d3ad791f18b2a4547d8fc0))
* **comic:** replace invalid cheerio.AnyNode type with domhandler Element ([094f84b](https://github.com/wooloo26/manhuagui-cli/commit/094f84bf2c1ea0c4cc485cc93b9d6428fabb0d7a))

## 1.0.0 (2026-07-03)
