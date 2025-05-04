@echo off
REM Python実行ファイルを起動するためのバッチスクリプト

SET SCRIPT_DIR=%~dp0

REM システムアーキテクチャを検出（表示なし）
IF "%PROCESSOR_ARCHITECTURE%" == "AMD64" (
    SET ARCH=x64
) ELSE IF "%PROCESSOR_ARCHITECTURE%" == "x86" (
    IF NOT "%PROCESSOR_ARCHITEW6432%" == "" (
        SET ARCH=x64
    ) ELSE (
        SET ARCH=x86
    )
) ELSE (
    SET ARCH=x64
)

REM 適切な実行ファイルを選択して実行（ログ表示なし）
IF "%ARCH%" == "x64" (
    IF EXIST "%SCRIPT_DIR%dist\python_server_x64.exe" (
        "%SCRIPT_DIR%dist\python_server_x64.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%python_server_x64.exe" (
        "%SCRIPT_DIR%python_server_x64.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%dist\python_server.exe" (
        "%SCRIPT_DIR%dist\python_server.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%python_server.exe" (
        "%SCRIPT_DIR%python_server.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE (
        echo No suitable Python server executable found, trying direct Python execution...
        echo Current directory: %CD%
        python "%SCRIPT_DIR%src\python\python_server.py" %*
        EXIT /B 0
    )
) ELSE (
    IF EXIST "%SCRIPT_DIR%dist\python_server_x86.exe" (
        "%SCRIPT_DIR%dist\python_server_x86.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%python_server_x86.exe" (
        "%SCRIPT_DIR%python_server_x86.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%dist\python_server.exe" (
        "%SCRIPT_DIR%dist\python_server.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE IF EXIST "%SCRIPT_DIR%python_server.exe" (
        "%SCRIPT_DIR%python_server.exe" %*
        EXIT /B %ERRORLEVEL%
    ) ELSE (
        echo No suitable Python server executable found, trying direct Python execution...
        echo Current directory: %CD%
        python "%SCRIPT_DIR%src\python\python_server.py" %*
        EXIT /B 0
    )
) 