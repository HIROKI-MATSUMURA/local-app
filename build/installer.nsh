!macro preInit
  ; この部分はインストーラーが起動する前に実行される
  SetRegView 64
!macroend

!macro customInstall
  ; 実行ファイルの存在を確認
  IfFileExists "$INSTDIR\CreAIteCode.exe" CreateShortcuts 0
  DetailPrint "メインの実行ファイルが見つかりませんでした。バックアップ手順を実行します..."

  ; ソースからのコピーを試みる (Resources\app.asar.unpacked\dist からの可能性)
  CopyFiles "$INSTDIR\resources\app.asar.unpacked\dist\CreAIteCode.exe" "$INSTDIR\CreAIteCode.exe"

  ; exeファイルが存在するかもう一度確認
  IfFileExists "$INSTDIR\CreAIteCode.exe" CreateShortcuts 0
  MessageBox MB_OK|MB_ICONSTOP "警告: CreAIteCode.exeが見つかりませんでした。ショートカットは作成されません。"
  Goto ShortcutsDone

  CreateShortcuts:
    ; デスクトップへのショートカット作成
    CreateShortCut "$DESKTOP\CreAIteCode.lnk" "$INSTDIR\CreAIteCode.exe"

    ; スタートメニューへのショートカット作成
    CreateDirectory "$SMPROGRAMS\CreAIteCode"
    CreateShortCut "$SMPROGRAMS\CreAIteCode\CreAIteCode.lnk" "$INSTDIR\CreAIteCode.exe"

    ; デバッグ情報の表示
    DetailPrint "ショートカットが正常に作成されました"

  ShortcutsDone:
!macroend

!macro customUnInstall
  ; デスクトップショートカットの削除
  Delete "$DESKTOP\CreAIteCode.lnk"

  ; スタートメニューショートカットの削除
  Delete "$SMPROGRAMS\CreAIteCode\CreAIteCode.lnk"
  RMDir "$SMPROGRAMS\CreAIteCode"
!macroend
