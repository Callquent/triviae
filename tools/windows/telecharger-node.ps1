$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Télécharge Node.js (le moteur qui fait tourner les applications) dans le dossier runtime, une seule fois.
# Le fichier est vérifié avec la somme de contrôle publiée par nodejs.org avant d'être utilisé.
$version = 'v22.23.4'
$base = "https://nodejs.org/dist/$version"
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$tmp = Join-Path $dir 'node.exe.part'

try {
  Write-Host "Téléchargement de Node.js $version (environ 85 Mo), une seule fois..."
  Invoke-WebRequest -UseBasicParsing -Uri "$base/win-x64/node.exe" -OutFile $tmp
  $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
  $line = $sums -split "`n" | Where-Object { $_ -match ' win-x64/node\.exe\s*$' } | Select-Object -First 1
  if (-not $line) { throw 'somme de contrôle introuvable sur nodejs.org' }
  $expected = ($line.Trim() -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $tmp).Hash.ToLower()
  if ($actual -ne $expected) { throw 'fichier corrompu (somme de contrôle différente)' }
  Move-Item -Force $tmp (Join-Path $dir 'node.exe')
  Write-Host 'Node.js est installé.'
} catch {
  Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  Write-Host ('Échec du téléchargement : ' + $_.Exception.Message)
  exit 1
}
