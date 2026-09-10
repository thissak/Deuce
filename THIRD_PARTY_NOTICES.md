# 외부 의존성

Deuce의 Apache-2.0 라이선스는 외부 라이브러리와 런타임의 라이선스를 대체하지 않습니다.
패키지별 LICENSE/NOTICE와 Electron 배포물의 Chromium 고지를 함께 보존합니다.

현재 잠금 파일의 production 의존성은 다음 명령으로 확인할 수 있습니다.

```bash
pnpm licenses list --prod
```

2026-09-08 조사에서 MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC,
BlueOak-1.0.0, Python-2.0 표기가 확인됐습니다. 이 목록은 패키지 메타데이터 기준이며,
Electron에 포함된 Chromium 등 네이티브 구성요소의 고지까지 대신하는 목록은 아닙니다.
의존성을 추가하거나 앱을 재배포할 때 해당 패키지와 배포물의 고지를 확인합니다.

## Microsoft Fluent Emoji

메시지 반응에 Microsoft의 Fluent Emoji 3D PNG 자산 40개를 사용합니다.
원본: https://github.com/microsoft/fluentui-emoji (조회 커밋 `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`)
라이선스: MIT. 배포 자산과 함께 `apps/web/public/fluent-emoji/LICENSE`에 원문을 보존합니다.
