@echo off
REM PowerShellで&&演算子が使用できない問題を回避するためのバッチファイル
echo === Python開発サーバー起動 ===
cd src\python
python python_server.py
pause 