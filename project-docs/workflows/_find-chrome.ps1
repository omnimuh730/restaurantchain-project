$paths = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    Write-Output ("FOUND: " + $p)
  }
}
