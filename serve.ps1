# Bilgisayarda test için basit yerel sunucu: http://localhost:8080
# Çalıştırma: powershell -ExecutionPolicy Bypass -File serve.ps1
param([int]$Port = 8080)

$root = $PSScriptRoot
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "DriveTalk: http://localhost:$Port  (Ctrl+C = stop)"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
      $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq '') { $path = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $response.Headers.Add('Cache-Control', 'no-cache')
        $response.ContentLength64 = $bytes.Length
        if ($context.Request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $response.StatusCode = 404
      }
    } catch {
      Write-Host "Error: $($_.Exception.Message)"
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Stop()
}
