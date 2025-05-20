# Python環境セットアップガイド

CreAIteCodeを使用するには、Python環境と必要なライブラリが正しく設定されている必要があります。このガイドでは、必要な環境のセットアップ方法を説明します。

## 必要なもの

- Python 3.7以上
- 以下のPythonパッケージ:
  - numpy
  - pillow
  - opencv-python
  - torch

## 自動セットアップ

アプリケーションには、必要なパッケージを自動的にチェックしてインストールするスクリプトが含まれています。

### macOS / Linux

1. ターミナルを開く
2. アプリケーションのディレクトリに移動
3. 以下のコマンドを実行:

```bash
./scripts/check-and-setup-python.sh
```

### Windows

1. コマンドプロンプトまたはPowerShellを開く
2. アプリケーションのディレクトリに移動
3. 以下のコマンドを実行:

```
scripts\check-and-setup-python.bat
```

## 手動セットアップ

Python環境を手動でセットアップすることもできます。

### 1. Pythonのインストール

#### macOS

```bash
brew install python
```

または[Python公式サイト](https://www.python.org/downloads/)からインストーラーをダウンロード

#### Windows

[Python公式サイト](https://www.python.org/downloads/)からインストーラーをダウンロードし、インストール時に「Add Python to PATH」オプションを必ず選択してください。

#### Linux

```bash
sudo apt update
sudo apt install python3 python3-pip
```

### 2. 必要なパッケージのインストール

```bash
# macOS / Linux
python3 -m pip install numpy pillow opencv-python torch

# Windows
python -m pip install numpy pillow opencv-python torch
```

## トラブルシューティング

### Pythonが見つからない場合

- Pythonがインストールされていることを確認してください
-環境変数PATHにPythonのディレクトリが追加されていることを確認してください

### インストール中にエラーが発生する場合

- pipが最新であることを確認してください:
  ```bash
  # macOS / Linux
  python3 -m pip install --upgrade pip
  
  # Windows
  python -m pip install --upgrade pip
  ```

- プロキシ環境を使用している場合は、プロキシの設定が正しいことを確認してください

### アプリケーション実行中にPythonエラーが表示される場合

アプリケーションを起動すると、Python環境が不十分な場合には通知が表示されます。この通知に従って必要なパッケージをインストールしてください。

## 詳細情報

- [Python公式ドキュメント](https://docs.python.org/3/)
- [NumPy](https://numpy.org/)
- [Pillow](https://pillow.readthedocs.io/)
- [OpenCV](https://opencv.org/)
- [PyTorch](https://pytorch.org/)