; DeckIDE Windows Installer
; Requires NSIS 3.x (https://nsis.sourceforge.io/)
;
; Build command (run from repo root):
;   makensis /DVERSION=v1.2.3 /DSTAGING_DIR=staging installer\installer.nsi

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ── Defines ──────────────────────────────────────────────────────
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef STAGING_DIR
  !define STAGING_DIR "staging"
!endif

Unicode True
Name "DeckIDE ${VERSION}"
OutFile "DeckIDE-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\DeckIDE"
InstallDirRegKey HKLM "Software\DeckIDE" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; ── Variables ────────────────────────────────────────────────────
Var Dialog
Var PortField
Var PortValue
Var AutoStartCheck
Var AutoStartValue
Var OpenBrowserCheck
Var OpenBrowserValue
Var DesktopShortcutCheck
Var DesktopShortcutValue
Var StartMenuCheck
Var StartMenuValue
Var AddToPathCheck
Var AddToPathValue
Var LaunchAfterInstallCheck
Var LaunchAfterInstallValue

; ── MUI Settings ─────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "DeckIDE ${VERSION} のインストール"
!define MUI_WELCOMEPAGE_TEXT "ブラウザベースの IDE、DeckIDE をインストールします。$\r$\n$\r$\nNode.js ランタイムと DeckIDE サーバーが一緒にインストールされます。"

; ── Pages ────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
Page custom OptionsPage OptionsLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "DeckIDE のインストールが完了しました。$\r$\n$\r$\nスタートメニューまたはデスクトップのショートカットから起動できます。"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Japanese"

; ── Options dialog ───────────────────────────────────────────────
Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "インストールオプション" "DeckIDE の動作を設定してください"

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; ポート
  ${NSD_CreateLabel} 0 2u 100u 12u "ポート番号 (1-65535):"
  Pop $0
  ${NSD_CreateNumber} 104u 0u 60u 14u "8787"
  Pop $PortField

  ; 起動設定
  ${NSD_CreateCheckbox} 0 18u 100% 12u "Windows ログイン時に自動起動する"
  Pop $AutoStartCheck
  ${NSD_CreateCheckbox} 0 32u 100% 12u "起動時にブラウザを自動で開く"
  Pop $OpenBrowserCheck
  ${NSD_SetState} $OpenBrowserCheck ${BST_CHECKED}

  ; ショートカット
  ${NSD_CreateCheckbox} 0 48u 100% 12u "デスクトップにショートカットを作成する"
  Pop $DesktopShortcutCheck
  ${NSD_SetState} $DesktopShortcutCheck ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 62u 100% 12u "スタートメニューにショートカットを作成する"
  Pop $StartMenuCheck
  ${NSD_SetState} $StartMenuCheck ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 76u 100% 12u "システム PATH に deckide コマンドを追加する"
  Pop $AddToPathCheck

  ; インストール後
  ${NSD_CreateCheckbox} 0 92u 100% 12u "インストール完了後に DeckIDE を起動する"
  Pop $LaunchAfterInstallCheck
  ${NSD_SetState} $LaunchAfterInstallCheck ${BST_CHECKED}

  ; Note
  ${NSD_CreateLabel} 0 108u 100% 12u "設定は後から「deckide config」で変更できます。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetText}  $PortField              $PortValue
  ${NSD_GetState} $AutoStartCheck         $AutoStartValue
  ${NSD_GetState} $OpenBrowserCheck       $OpenBrowserValue
  ${NSD_GetState} $DesktopShortcutCheck   $DesktopShortcutValue
  ${NSD_GetState} $StartMenuCheck         $StartMenuValue
  ${NSD_GetState} $AddToPathCheck         $AddToPathValue
  ${NSD_GetState} $LaunchAfterInstallCheck $LaunchAfterInstallValue

  ; Default to 8787 if empty
  ${If} $PortValue == ""
    StrCpy $PortValue "8787"
  ${EndIf}

  ; Validate port range
  IntOp $0 $PortValue + 0
  StrCpy $PortValue $0
  ${If} $0 < 1
    MessageBox MB_OK|MB_ICONEXCLAMATION "ポート番号には 1 以上の値を入力してください。"
    Abort
  ${EndIf}
  ${If} $0 > 65535
    MessageBox MB_OK|MB_ICONEXCLAMATION "ポート番号には 65535 以下の値を入力してください。"
    Abort
  ${EndIf}
FunctionEnd

; ── Main section ─────────────────────────────────────────────────
Section "DeckIDE (必須)" SecMain
  SectionIn RO
  SetDetailsPrint both

  ; ── Extract app archive ──────────────────────────────────────
  ; ── Extract app archive ──────────────────────────────────────
  DetailPrint "アプリケーションアーカイブをコピー中..."
  SetOutPath "$INSTDIR"
  File "${STAGING_DIR}\app.zip"
  DetailPrint "アーカイブを展開中... (しばらくお待ちください)"
  nsExec::ExecToLog 'powershell -NoProfile -Command "Expand-Archive -LiteralPath \"$INSTDIR\app.zip\" -DestinationPath \"$INSTDIR\" -Force; Write-Host \"展開完了\""'
  Pop $0
  DetailPrint "一時ファイルを削除中..."
  Delete "$INSTDIR\app.zip"
  DetailPrint "アプリケーションファイルの展開が完了しました。"

  ; ── Install Node.js runtime ──────────────────────────────────
  DetailPrint "Node.js ランタイムをインストール中..."
  SetOutPath "$INSTDIR\node"
  File "${STAGING_DIR}\node.exe"
  DetailPrint "Node.js のインストールが完了しました。"

  ; ── Create launcher batch ────────────────────────────────────
  DetailPrint "起動スクリプトを作成中..."
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\deckide.bat" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"%~dp0node\node.exe" "%~dp0bin\deckide.js" %*$\r$\n'
  FileClose $0
  DetailPrint "起動スクリプトを作成しました: $INSTDIR\deckide.bat"

  ; ── Write settings.json ──────────────────────────────────────
  DetailPrint "設定ファイルを書き込み中..."
  CreateDirectory "$PROFILE\.deckide"

  StrCpy $1 "false"
  ${If} $OpenBrowserValue == ${BST_CHECKED}
    StrCpy $1 "true"
  ${EndIf}

  FileOpen $0 "$PROFILE\.deckide\settings.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 "  $\"port$\": $PortValue,$\r$\n"
  FileWrite $0 "  $\"openBrowser$\": $1$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0
  DetailPrint "設定ファイルを書き込みました: $PROFILE\.deckide\settings.json"
  DetailPrint "  ポート: $PortValue"
  DetailPrint "  ブラウザ自動起動: $1"

  ; ── Auto-start task ──────────────────────────────────────────
  ${If} $AutoStartValue == ${BST_CHECKED}
    DetailPrint "自動起動タスクを登録中..."
    nsExec::ExecToLog 'schtasks /create /tn "DeckIDE" /tr "\"$INSTDIR\deckide.bat\" start --no-open" /sc onlogon /rl limited /f'
    Pop $0
    DetailPrint "自動起動タスクを登録しました。"
  ${Else}
    DetailPrint "自動起動: スキップ"
  ${EndIf}

  ; ── Start Menu shortcuts ─────────────────────────────────────
  ${If} $StartMenuValue == ${BST_CHECKED}
    DetailPrint "スタートメニューにショートカットを作成中..."
    CreateDirectory "$SMPROGRAMS\DeckIDE"
    CreateShortcut "$SMPROGRAMS\DeckIDE\DeckIDE.lnk" \
      "$INSTDIR\deckide.bat" "start" "" "" SW_SHOWMINIMIZED "" "Deck IDE を起動する"
    CreateShortcut "$SMPROGRAMS\DeckIDE\DeckIDE をアンインストール.lnk" \
      "$INSTDIR\Uninstall.exe"
    DetailPrint "スタートメニューのショートカットを作成しました。"
  ${Else}
    DetailPrint "スタートメニュー: スキップ"
  ${EndIf}

  ; ── Desktop shortcut ─────────────────────────────────────────
  ${If} $DesktopShortcutValue == ${BST_CHECKED}
    DetailPrint "デスクトップにショートカットを作成中..."
    CreateShortcut "$DESKTOP\DeckIDE.lnk" \
      "$INSTDIR\deckide.bat" "start" "" "" SW_SHOWMINIMIZED "" "Deck IDE を起動する"
    DetailPrint "デスクトップのショートカットを作成しました。"
  ${Else}
    DetailPrint "デスクトップショートカット: スキップ"
  ${EndIf}

  ; ── Add to PATH ───────────────────────────────────────────────
  ${If} $AddToPathValue == ${BST_CHECKED}
    DetailPrint "システム PATH に追加中..."
    nsExec::ExecToLog 'powershell -NoProfile -Command "\
      $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(\"SYSTEM\CurrentControlSet\Control\Session Manager\Environment\", $true);\
      $old = $key.GetValue(\"Path\", \"\", \"DoNotExpandEnvironmentNames\");\
      if ($old -notlike \"*$INSTDIR*\") { $key.SetValue(\"Path\", $old + \";$INSTDIR\", \"ExpandString\"); Write-Host \"PATH に追加しました\" } else { Write-Host \"既に PATH に含まれています\" };\
      $key.Close()"'
    Pop $0
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    DetailPrint "PATH への追加が完了しました。"
  ${Else}
    DetailPrint "PATH 追加: スキップ"
  ${EndIf}

  ; ── Uninstaller ──────────────────────────────────────────────
  DetailPrint "アンインストーラーを作成中..."
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  DetailPrint "レジストリに登録中..."
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "DisplayName"      "DeckIDE"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "DisplayVersion"   "${VERSION}"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "Publisher"        "serkenn"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "URLInfoAbout"     "https://github.com/serkenn/ide"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "NoRepair"  1
  DetailPrint "レジストリへの登録が完了しました。"

  ; ── Launch after install ──────────────────────────────────────
  ${If} $LaunchAfterInstallValue == ${BST_CHECKED}
    Exec '"$INSTDIR\deckide.bat" start'
  ${EndIf}
SectionEnd

; ── Uninstall section ────────────────────────────────────────────
Section "Uninstall"
  ; Stop running server
  nsExec::ExecToLog '"$INSTDIR\deckide.bat" stop'

  ; Remove auto-start task (ignore error if not present)
  nsExec::ExecToLog 'schtasks /delete /tn "DeckIDE" /f'

  ; Remove from PATH if it was added
  nsExec::ExecToLog 'powershell -NoProfile -Command "\
    $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(\"SYSTEM\CurrentControlSet\Control\Session Manager\Environment\", $true);\
    $old = $key.GetValue(\"Path\", \"\", \"DoNotExpandEnvironmentNames\");\
    $new = ($old -split \";\") | Where-Object { $_ -ne \"$INSTDIR\" } | Join-String -Separator \";\";\
    $key.SetValue(\"Path\", $new, \"ExpandString\");\
    $key.Close()"'
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ; Remove shortcuts
  Delete "$SMPROGRAMS\DeckIDE\DeckIDE.lnk"
  Delete "$SMPROGRAMS\DeckIDE\DeckIDE をアンインストール.lnk"
  RMDir  "$SMPROGRAMS\DeckIDE"
  Delete "$DESKTOP\DeckIDE.lnk"

  ; Remove install directory
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE"
  DeleteRegKey HKLM "Software\DeckIDE"
SectionEnd
