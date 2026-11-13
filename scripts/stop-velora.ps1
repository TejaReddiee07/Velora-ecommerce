# Stops VELORA's own API and storefront started from this folder.
# Other Node programs on the computer are never touched.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')

# 1. Close the server windows opened by start-velora.bat (and everything running inside them).
foreach ($title in 'VELORA API*', 'VELORA Storefront*') {
  & taskkill.exe /F /T /FI "WINDOWTITLE eq $title" 2>$null | Out-Null
}

# 2. Stop any VELORA Node server still running (e.g. started another way).
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return $false }
  $inProject = ($cmd -like "*$root\backend*") -or ($cmd -like "*$root\frontend*")
  $isServer = ($cmd -like '*next*start*') -or ($cmd -like '*next*dev*') -or ($cmd -like '*dist\index.js*') -or ($cmd -like '*dist/index.js*') -or ($cmd -like '*tsx*')
  $inProject -and $isServer
})
# 3. A VELORA server started from inside the folder shows only "node dist/index.js" or
#    "next start" (no folder name), so also stop the Node server holding port 4000/3000.
$portPids = @()
foreach ($port in 4000, 3000) {
  $portPids += @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { $_.OwningProcess })
}
$known = @($procs | ForEach-Object { $_.ProcessId })
foreach ($procId in ($portPids | Sort-Object -Unique)) {
  if ($known -contains $procId) { continue }
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $p -or $p.Name -ne 'node.exe' -or -not $p.CommandLine) { continue }
  $cmd = $p.CommandLine
  if (($cmd -like '*next*start*') -or ($cmd -like '*next*dev*') -or ($cmd -like '*dist\index.js*') -or ($cmd -like '*dist/index.js*') -or ($cmd -like '*tsx*')) {
    $procs += $p
  }
}
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output ("       Stopped {0} old VELORA server process(es)." -f $procs.Count)
