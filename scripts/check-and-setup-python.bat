@echo off
REM Python環境チェックとセットアップスクリプト（Windows用）
REM アプリケーションと一緒に配布されるスクリプト

echo =========================================
echo      CreAIteCode Python環境セットアップ
echo =========================================
echo.

REM Pythonコマンドの確認
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Pythonが見つかりません。
    echo [INFO] Python 3.7以上をインストールしてください:
    echo   https://www.python.org/downloads/
    echo.
    echo インストール時に「Add Python to PATH」にチェックを入れてください。
    echo インストール後、このスクリプトを再実行してください。
    pause
    exit /b 1
)

REM Pythonバージョンの確認
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [INFO] %PYTHON_VERSION%

REM pipコマンドの確認
python -m pip --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] pip (Python パッケージマネージャ) が見つかりません。
    echo [INFO] 以下のコマンドを実行してpipをインストールしてください:
    echo   python -m ensurepip --upgrade
    pause
    exit /b 1
)

echo [INFO] 必要なライブラリをチェックしています...
echo.

REM 必要なパッケージのチェック
set MISSING_PACKAGES=

REM numpy
python -c "import numpy" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [MISSING] numpy
    set MISSING_PACKAGES=%MISSING_PACKAGES% numpy
) else (
    echo [OK] numpy
)

REM Pillow
python -c "import PIL" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [MISSING] pillow
    set MISSING_PACKAGES=%MISSING_PACKAGES% pillow
) else (
    echo [OK] pillow
)

REM OpenCV
python -c "import cv2" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [MISSING] opencv-python
    set MISSING_PACKAGES=%MISSING_PACKAGES% opencv-python
) else (
    echo [OK] opencv-python
)

REM PyTorch
python -c "import torch" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [MISSING] torch
    set MISSING_PACKAGES=%MISSING_PACKAGES% torch
) else (
    echo [OK] torch
)

REM 不足しているパッケージがある場合
if not "%MISSING_PACKAGES%"=="" (
    echo.
    echo [INFO] 以下のパッケージをインストールする必要があります:%MISSING_PACKAGES%
    echo.
    
    set /p ANSWER="これらのパッケージをインストールしますか？ [y/N] "
    if /i "%ANSWER%"=="y" (
        echo.
        echo [INFO] パッケージをインストールしています...
        python -m pip install%MISSING_PACKAGES%
        
        if %ERRORLEVEL% EQU 0 (
            echo.
            echo [SUCCESS] 必要なパッケージのインストールが完了しました！
        ) else (
            echo.
            echo [ERROR] パッケージのインストールに失敗しました。
            echo [INFO] 以下のコマンドを手動で実行してください:
            echo   python -m pip install%MISSING_PACKAGES%
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo [INFO] インストールをスキップしました。
        echo [INFO] アプリケーションを使用するには、以下のコマンドでパッケージをインストールしてください:
        echo   python -m pip install%MISSING_PACKAGES%
        pause
        exit /b 1
    )
) else (
    echo.
    echo [SUCCESS] すべての必要なパッケージがインストールされています！
)

echo.
echo [SUCCESS] CreAIteCodeで使用するPython環境の設定が完了しました！
echo [SUCCESS] アプリケーションを起動して、作業を開始できます。
pause
exit /b 0