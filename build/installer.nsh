; Moon Explorer's additions to the electron-builder NSIS installer (picked up from build/installer.nsh).
; The pictures next to this file come from build/installer/*.svg (npm run icons).

; ---------------------------------------------------------------- welcome page

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Moon Explorer"
  !define MUI_WELCOMEPAGE_TEXT "Your files, calmly under the moon.$\r$\n$\r$\nThis sets up Moon Explorer ${VERSION}: tabs, two panes side by side, Quick Look, fast search and more, in the Moon night-sky look.$\r$\n$\r$\nNo administrator rights are needed when you install it for yourself.$\r$\n$\r$\nClick Next to continue."
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ---------------------------------------------------------------- finish page

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  ; Runs as the signed-in user even if the installer was elevated, so the registration lands in their HKCU.
  ; The app checks the registration a few seconds after it starts, so starting it at the same time is fine.
  Function SetAsDefaultFileManager
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "--set-default"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Moon Explorer is ready"
  !define MUI_FINISHPAGE_TEXT "Moon Explorer is installed. You find it in the Start menu and on the desktop.$\r$\n$\r$\nIt can also open folders, drives, This PC and Win+E instead of Windows Explorer. You can switch this on or off at any time in Settings."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Start Moon Explorer"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Use as default file manager"
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "SetAsDefaultFileManager"
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------------------------------------------------------------- uninstall

; Gives folders, drives, This PC and Win+E back to Windows Explorer before the app is removed, so a
; double-click on a folder doesn't end in an error. Not on an update: the new version keeps the registration.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --unset-default'
  ${endIf}
!macroend
