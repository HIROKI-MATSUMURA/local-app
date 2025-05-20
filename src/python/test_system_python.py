#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
システム環境依存のPythonテストスクリプト
"""

import sys
import os
import platform

def main():
    """メイン関数"""
    print("=== System Python Test ===")
    print(f"Python version: {sys.version}")
    print(f"Platform: {platform.platform()}")
    print(f"Current directory: {os.getcwd()}")
    
    # パッケージの確認
    try:
        import numpy
        print(f"NumPy installed: {numpy.__version__}")
    except ImportError:
        print("NumPy not installed")
    
    try:
        import PIL
        print(f"Pillow installed: {PIL.__version__}")
    except ImportError:
        print("Pillow not installed")
    
    try:
        import cv2
        print(f"OpenCV installed: {cv2.__version__}")
    except ImportError:
        print("OpenCV not installed")
    
    try:
        import torch
        print(f"PyTorch installed: {torch.__version__}")
    except ImportError:
        print("PyTorch not installed")
    
    print("=== Test completed ===")
    return 0

if __name__ == "__main__":
    sys.exit(main())