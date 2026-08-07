# Timer Desktop Release 빌드

`Timer.Desktop`을 Windows 실행 파일(`.exe`)로 빌드하는 방법을 설명합니다.

## 빌드 목적

Release 구성과 .NET apphost를 사용해 실행 가능한 `Timer.Desktop.exe`를 생성합니다.

## 사전 조건

- Windows 환경이어야 합니다.
- .NET 8 SDK가 설치되어 있어야 합니다.
- `Timer.Desktop` 앱이 실행 중이면 빌드 전에 스크립트가 강제 종료합니다.

강제 종료 시 저장되지 않은 초안은 유실될 수 있습니다.

## 빌드 방법

PowerShell에서 프로젝트 루트로 이동한 뒤 스크립트를 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-release.ps1
```

명령은 프로젝트 루트(`Readme.md`와 `build-release.ps1`가 있는 폴더)에서 실행합니다.

스크립트는 다음 작업을 순서대로 수행합니다.

1. `Timer.Desktop\Timer.Desktop.csproj`를 확인합니다.
2. 동일한 Release 실행 파일로 실행 중인 `Timer.Desktop` 프로세스를 강제 종료합니다.
3. Release 구성으로 프로젝트를 빌드합니다.
4. 실행 가능한 apphost를 생성합니다.
5. `.exe` 생성 여부를 확인합니다.
6. 빌드된 `Timer.Desktop.exe`를 실행합니다.

## 산출물 경로

빌드가 성공하면 다음 경로에 실행 파일이 생성됩니다.

```text
Timer.Desktop\bin\Release\net8.0-windows\Timer.Desktop.exe
```

같은 폴더에 실행에 필요한 다음 파일도 함께 생성됩니다.

- `Timer.Desktop.dll`
- `Timer.Desktop.deps.json`
- `Timer.Desktop.runtimeconfig.json`

## self-test 실행

빌드된 실행 파일의 핵심 상태 전이를 확인할 수 있습니다.

```powershell
& '.\Timer.Desktop\bin\Release\net8.0-windows\Timer.Desktop.exe' --self-test
```

정상 결과는 `SELF-TEST PASS`로 시작합니다.

빌드 스크립트는 self-test를 자동 실행하지 않습니다. self-test가 필요하면 앱을 종료한 뒤 위 명령을 별도로 실행합니다.

## 관련 파일

- [build-release.ps1](build-release.ps1): Release `.exe` 빌드 스크립트
- [Timer.Desktop.csproj](Timer.Desktop/Timer.Desktop.csproj): .NET Windows Forms 프로젝트 설정
