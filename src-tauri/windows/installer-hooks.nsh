!macro NSIS_HOOK_PREINSTALL
  ; Stop a running copy before replacing the executable. Otherwise the tray
  ; process keeps the old window/version alive after an overwrite install.
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM ryjs-deskgrid.exe'
!macroend
