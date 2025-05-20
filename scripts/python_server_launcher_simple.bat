@echo off
REM システム環境依存のPythonランチャースクリプト

SET SCRIPT_DIR=%~dp0
SET PYTHON_SCRIPT=%SCRIPT_DIR%python\python_server.py

REM システムPythonの確認
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo ======================================
  echo Pythonが見つかりません。
  echo Pythonをインストールしてください。
  echo https://www.python.org/downloads/
  echo ======================================
  exit /b 1
)

REM 必要パッケージの確認
python -c "import numpy; import PIL; import cv2" >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo ======================================
  echo 必要なPythonパッケージがインストールされていません。
  echo 以下のコマンドを実行してください：
  echo pip install numpy pillow opencv-python
  echo ======================================
  exit /b 1
)

REM スクリプト実行
echo Pythonスクリプトを実行: %PYTHON_SCRIPT%
python "%PYTHON_SCRIPT%" %*