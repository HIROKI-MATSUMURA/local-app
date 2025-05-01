@echo off
REM Python Server Launcher Script for Windows
REM アーキテクチャに基づいて適切なバイナリを実行します

echo Python Server Launcher を起動しています...

REM 現在の実行ディレクトリを取得
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM システムアーキテクチャの検出
for /f "tokens=2 delims= " %%A in ('wmic os get osarchitecture ^| find "bit"') do set "ARCH=%%A"

echo 検出されたアーキテクチャ: %ARCH%

REM x64と32ビット実行ファイルのパスを設定
set "X64_BINARY=%SCRIPT_DIR%\python_server_x64.exe"
set "X86_BINARY=%SCRIPT_DIR%\python_server_x86.exe"

REM アーキテクチャに基づいて適切な実行ファイルを選択
if "%ARCH%"=="64-bit" (
    echo x64バイナリを実行します: %X64_BINARY%

    REM x64バイナリが存在するか確認
    if exist "%X64_BINARY%" (
        "%X64_BINARY%" %*
    ) else (
        echo エラー: x64バイナリが見つかりません。
        exit /b 1
    )
) else (
    echo x86バイナリを実行します: %X86_BINARY%

    REM x86バイナリが存在するか確認
    if exist "%X86_BINARY%" (
        "%X86_BINARY%" %*
    ) else (
        echo エラー: x86バイナリが見つかりません。
        exit /b 1
    )
)

REM このコードは実行されません（正常に実行された場合）
echo エラー: 適切なバイナリを実行できませんでした
exit /b 1
