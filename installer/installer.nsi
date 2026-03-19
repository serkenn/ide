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

  ; Port label + field
  ${NSD_CreateLabel} 0 4u 100u 12u "ポート番号 (1–65535):"
  Pop $0
  ${NSD_CreateNumber} 108u 2u 60u 14u "8787"
  Pop $PortField

  ; Separator
  ${NSD_CreateHLine} 0 24u 100% 1u
  Pop $0

  ; Auto-start checkbox
  ${NSD_CreateCheckbox} 0 34u 100% 14u "Windows ログイン時に自動起動する"
  Pop $AutoStartCheck

  ; Open-browser checkbox
  ${NSD_CreateCheckbox} 0 54u 100% 14u "起動時にブラウザを自動で開く"
  Pop $OpenBrowserCheck
  ${NSD_SetState} $OpenBrowserCheck ${BST_CHECKED}

  ; Note
  ${NSD_CreateLabel} 0 76u 100% 20u "これらの設定は後から「deckide config」コマンドで変更できます。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetText}  $PortField       $PortValue
  ${NSD_GetState} $AutoStartCheck  $AutoStartValue
  ${NSD_GetState} $OpenBrowserCheck $OpenBrowserValue

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

  ; ── Extract app archive ──────────────────────────────────────
  SetOutPath "$INSTDIR"
  File "${STAGING_DIR}\app.zip"
  nsExec::ExecToLog 'powershell -NoProfile -Command "Expand-Archive -LiteralPath \"$INSTDIR\app.zip\" -DestinationPath \"$INSTDIR\" -Force"'
  Delete "$INSTDIR\app.zip"

  ; ── Install Node.js runtime ──────────────────────────────────
  SetOutPath "$INSTDIR\node"
  File "${STAGING_DIR}\node.exe"

  ; ── Create launcher batch ────────────────────────────────────
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\deckide.bat" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"%~dp0node\node.exe" "%~dp0bin\deckide.js" %*$\r$\n'
  FileClose $0

  ; ── Write settings.json ──────────────────────────────────────
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

  ; ── Auto-start task ──────────────────────────────────────────
  ${If} $AutoStartValue == ${BST_CHECKED}
    nsExec::ExecToLog 'schtasks /create /tn "DeckIDE" /tr "\"$INSTDIR\deckide.bat\" start --no-open" /sc onlogon /rl limited /f'
  ${EndIf}

  ; ── Start Menu shortcuts ─────────────────────────────────────
  CreateDirectory "$SMPROGRAMS\DeckIDE"
  CreateShortcut "$SMPROGRAMS\DeckIDE\DeckIDE.lnk" \
    "$INSTDIR\deckide.bat" "start" "" "" SW_HIDE "" "Deck IDE を起動する"
  CreateShortcut "$SMPROGRAMS\DeckIDE\DeckIDE をアンインストール.lnk" \
    "$INSTDIR\Uninstall.exe"

  ; ── Desktop shortcut ─────────────────────────────────────────
  CreateShortcut "$DESKTOP\DeckIDE.lnk" \
    "$INSTDIR\deckide.bat" "start" "" "" SW_HIDE "" "Deck IDE を起動する"

  ; ── Uninstaller ──────────────────────────────────────────────
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "DisplayName"      "DeckIDE"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "DisplayVersion"   "${VERSION}"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "Publisher"        "tako0614"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "URLInfoAbout"     "https://github.com/tako0614/ide"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckIDE" \
    "NoRepair"  1
SectionEnd

; ── Uninstall section ────────────────────────────────────────────
Section "Uninstall"
  ; Stop running server
  nsExec::ExecToLog '"$INSTDIR\deckide.bat" stop'

  ; Remove auto-start task (ignore error if not present)
  nsExec::ExecToLog 'schtasks /delete /tn "DeckIDE" /f'

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
