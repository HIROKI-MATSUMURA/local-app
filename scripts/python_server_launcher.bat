@echo off
REM Python実行ファイルを起動するためのバッチスクリプト

SET SCRIPT_DIR=%~dp0
SET APP_DIR=%SCRIPT_DIR%..

IF EXIST "%APP_DIR%\python_server_x64.exe" (
    "%APP_DIR%\python_server_x64.exe" %*
) ELSE IF EXIST "%APP_DIR%\python_server_x86.exe" (
    "%APP_DIR%\python_server_x86.exe" %*
) ELSE IF EXIST "%APP_DIR%\python_server.exe" (
    "%APP_DIR%\python_server.exe" %*
) ELSE (
    echo エラー: Python実行ファイルが見つかりません。
    exit /b 1
)
