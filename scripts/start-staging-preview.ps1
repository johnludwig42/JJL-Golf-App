param([switch]$BuildOnly, [switch]$DeliveryFaultReview, [switch]$Netlify)
$ErrorActionPreference = 'Stop'
if ($Netlify -and (!$BuildOnly -or $DeliveryFaultReview)) {
    throw 'Netlify output requires BuildOnly and excludes the delivery fault panel.'
}
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
if ($Netlify) {
    $hostedRoot = Join-Path $previewRoot 'tmp/report-qa/shared-staging/wp-sm-01'
    $hostedOutput = Join-Path $hostedRoot 'netlify'
    $hostedFileList = Join-Path $hostedRoot 'netlify-files.json'
    if ((Test-Path -LiteralPath $hostedOutput) -or (Test-Path -LiteralPath $hostedFileList)) {
        throw 'Hosted output already exists. Preserve the prior build and file list.'
    }
    # Keep an incomplete or refused build outside the designated upload folder.
    $previewOutput = Join-Path $hostedRoot ('build-' + [guid]::NewGuid().ToString('N'))
}
New-Item -ItemType Directory -Force -Path $previewOutput | Out-Null
$previewTrackedFiles = & git -C $previewRoot ls-files
if ($LASTEXITCODE -ne 0) { throw 'Could not inventory tracked application assets.' }
$previewFiles = @($previewTrackedFiles | Where-Object {
    ($_ -match '^[^/]+\.(js|css|svg)$') -or ($_ -in @('index.html','manifest.json')) -or
    ($_ -match '^ledger-report/[^.].*\.(html|js|css|woff2|svg|png)$') -or
    ($_ -match $previewBrandingPattern)
})
if ($Netlify) {
    $previewFiles = @($previewFiles | Where-Object { $_ -notin @('supabase-config.js','eslint.config.js') })
}
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
if ($Netlify) {
    $manifestPath = Join-Path $previewOutput 'manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -cne ('v' + $previewVersion)) { throw 'Staging manifest version mismatch.' }
    $manifest.name = 'Dye Ledger STAGING'
    $manifest.short_name = 'Dye Ledger STAGING'
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 10), $previewUtf8)
    foreach ($page in Get-ChildItem -LiteralPath $previewOutput -Recurse -File -Filter '*.html') {
        $html = [IO.File]::ReadAllText($page.FullName, $previewUtf8)
        if ($html -match '<head\b[^>]*>') {
            $html = $html -replace '(<head\b[^>]*>)', '$1<meta name="robots" content="noindex">'
        } elseif ($page.FullName -eq (Join-Path $previewOutput 'ledger-report\shell.html') -and
            $html -match '^<meta charset="utf-8">') {
            # Ledger's shell starts with an implicit head and its charset.
            $html = $html -replace '^(<meta charset="utf-8">)', '$1<meta name="robots" content="noindex">'
        } else {
            throw 'Expected a head element in hosted HTML.'
        }
        [IO.File]::WriteAllText($page.FullName, $html, $previewUtf8)
    }
    [IO.File]::WriteAllText((Join-Path $previewOutput 'robots.txt'), "User-agent: *`nDisallow: /`n", $previewUtf8)

    $productionConfig = [IO.File]::ReadAllText((Join-Path $previewRoot 'supabase-config.js'))
    $productionKeys = [regex]::Matches($productionConfig, 'sb_publishable_[A-Za-z0-9_-]+')
    if ($productionKeys.Count -ne 1) { throw 'Could not identify the production publishable key for isolation checking.' }
    $files = @(Get-ChildItem -LiteralPath $previewOutput -Recurse -File | ForEach-Object {
        $bytes = [IO.File]::ReadAllBytes($_.FullName)
        # Project refs and publishable keys are ASCII. Removing NULs also
        # exposes the same markers in UTF-16 LE/BE, at either byte alignment.
        $scan = [Text.Encoding]::ASCII.GetString($bytes).Replace([string][char]0, '')
        if ($scan.IndexOf('ueallqqmdyzwdlmoyxfo', [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
            $scan.Contains($productionKeys[0].Value)) {
            throw 'Hosted staging isolation check rejected production material.'
        }
        foreach ($project in [regex]::Matches($scan, '(?i)https?://([a-z0-9]+)\.supabase\.co\b')) {
            if ($project.Groups[1].Value -cne 'darbakmabpbkikisadop') { throw 'Hosted staging isolation check rejected a foreign Supabase project.' }
        }
        [ordered]@{
            path = $_.FullName.Substring($previewOutput.Length + 1).Replace('\','/')
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    } | Sort-Object { $_.path })
    $fileList = [ordered]@{ version = $manifest.version; files = $files } | ConvertTo-Json -Depth 4
    [IO.Directory]::Move($previewOutput, $hostedOutput)
    [IO.File]::WriteAllText($hostedFileList, $fileList + "`n", $previewUtf8)
    Write-Host "Hosted staging isolation passed. $($files.Count) files at $hostedOutput"
    return
}
Write-Host 'Isolated staging preview prepared at http://127.0.0.1:5087/staging-sign-in.html'
if (!$BuildOnly) {
    & python -m http.server 5087 --bind 127.0.0.1 --directory $previewOutput
    if ($LASTEXITCODE -ne 0) { throw 'Local preview server stopped with an error.' }
}
