param([switch]$BuildOnly, [switch]$DeliveryFaultReview)
$ErrorActionPreference = 'Stop'
$previewRoot = Split-Path -Parent $PSScriptRoot
$previewVersion = (Get-Content -LiteralPath (Join-Path $previewRoot 'package.json') -Raw | ConvertFrom-Json).version
$previewBrandingPattern = '^branding/[^/]+-v' + [regex]::Escape($previewVersion) + '\.png$'
$previewSettingsFile = Join-Path $previewRoot 'tmp/report-qa/shared-staging/preview-settings.json'
$previewSettings = Get-Content -LiteralPath $previewSettingsFile -Raw | ConvertFrom-Json
if ($previewSettings.projectRef -cne 'darbakmabpbkikisadop' -or
    $previewSettings.url -cne 'https://darbakmabpbkikisadop.supabase.co' -or
    $previewSettings.publishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
    throw 'Expected the approved staging project and a publishable key.'
}
$previewOutput = Join-Path $previewRoot 'tmp/report-qa/shared-staging/preview'
New-Item -ItemType Directory -Force -Path $previewOutput | Out-Null
$previewTrackedFiles = & git -C $previewRoot ls-files
if ($LASTEXITCODE -ne 0) { throw 'Could not inventory tracked application assets.' }
$previewFiles = @($previewTrackedFiles | Where-Object {
    ($_ -match '^[^/]+\.(js|css|svg)$') -or ($_ -in @('index.html','manifest.json')) -or
    ($_ -match '^ledger-report/[^.].*\.(html|js|css|woff2|svg|png)$') -or
    ($_ -match $previewBrandingPattern)
})
# A review build may not be committed yet; include only its five known immutable icons.
foreach ($icon in @('app-icon-192','app-icon-512','apple-touch-icon','favicon-32','favicon-16')) {
    $asset = "branding/$icon-v$previewVersion.png"
    if (!(Test-Path -LiteralPath (Join-Path $previewRoot $asset))) { throw 'Current release branding is missing.' }
    if ($asset -notin $previewFiles) { $previewFiles += $asset }
}
$previewAllowed = @($previewFiles) + @('staging-sign-in.html','delivery-fault-panel.js')
foreach ($previewExisting in Get-ChildItem -LiteralPath $previewOutput -Recurse -File) {
    $previewRelative = $previewExisting.FullName.Substring($previewOutput.Length + 1).Replace('\','/')
    if ($previewRelative -notin $previewAllowed) { throw 'Unexpected file in isolated preview folder; refusing to serve it.' }
}
foreach ($previewFile in $previewFiles) {
    $previewDestination = Join-Path $previewOutput $previewFile
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $previewDestination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $previewRoot $previewFile) -Destination $previewDestination
}
$previewConfig = @{
    url = $previewSettings.url
    anonKey = $previewSettings.publishableKey
    accountAuth = @{ enabled = $true; environment = 'staging'; expectedProjectRef = $previewSettings.projectRef }
} | ConvertTo-Json -Depth 5 -Compress
$previewUtf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $previewOutput 'supabase-config.js'), "window.__DYE_SUPABASE_CONFIG__ = $previewConfig;", $previewUtf8)
$previewHtml = Get-Content -LiteralPath (Join-Path $previewOutput 'index.html') -Raw -Encoding UTF8
$previewHtml = $previewHtml.Replace('<title>The Dye Ledger</title>','<title>STAGING - The Dye Ledger</title>')
$previewBanner = '<div role="status" style="background:#ffe08a;color:#162b20;padding:12px;text-align:center;font:600 16px system-ui">STAGING TEST - separate test data | <a href="staging-sign-in.html">Sign in to staging</a></div>'
$previewHtml = $previewHtml -replace '(<body\b[^>]*>)', ('$1' + $previewBanner)
if ($DeliveryFaultReview) {
    $previewReviewSource = Join-Path $previewRoot 'supabase/proposals/shared-score-rpc-v31.0.77/staging/delivery-fault-panel.js'
    $previewReviewHash = (Get-FileHash -LiteralPath $previewReviewSource -Algorithm SHA256).Hash.Substring(0,12).ToLowerInvariant()
    Copy-Item -LiteralPath $previewReviewSource -Destination (Join-Path $previewOutput 'delivery-fault-panel.js')
    $previewReviewTag = '<script src="delivery-fault-panel.js?rev=' + $previewReviewHash + '"></script><script src="identity-security.js'
    $previewHtml = $previewHtml.Replace('<script src="identity-security.js', $previewReviewTag)
} else {
    $previewReviewAsset = Join-Path $previewOutput 'delivery-fault-panel.js'
    if (Test-Path -LiteralPath $previewReviewAsset) { Remove-Item -LiteralPath $previewReviewAsset }
}
[System.IO.File]::WriteAllText((Join-Path $previewOutput 'index.html'), $previewHtml, $previewUtf8)
Copy-Item -LiteralPath (Join-Path $previewRoot 'supabase/proposals/shared-score-rpc-v31.0.77/staging/staging-sign-in.html') -Destination (Join-Path $previewOutput 'staging-sign-in.html')
Write-Host 'Isolated staging preview prepared at http://127.0.0.1:5087/staging-sign-in.html'
if (!$BuildOnly) {
    & python -m http.server 5087 --bind 127.0.0.1 --directory $previewOutput
    if ($LASTEXITCODE -ne 0) { throw 'Local preview server stopped with an error.' }
}
