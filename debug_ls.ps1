$raw=[System.IO.File]::ReadAllText('components\AnkiExportModal.tsx')
$lines=$raw -split '\r?\n'
foreach ($i in 577..580) {
  $rawLine=$lines[$i-1]
  Write-Host ("L{0}: | {1} ({2} chars)" -f $i, $rawLine, $rawLine.Length)
}
