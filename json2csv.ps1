Param(
    [Parameter(Mandatory=$true)][string]$InputFile,
    [string]$OutputFile = "",
    [string]$Delimiter = ";"
)

if (-not (Test-Path $InputFile)) { Write-Error "File non trovato: $InputFile"; exit 1 }

$json = Get-Content -Raw -Path $InputFile

try { $data = ConvertFrom-Json $json -ErrorAction Stop } catch { Write-Error "Errore parsing JSON: $_"; exit 1 }

if ($null -eq $data) { Write-Error "JSON vuoto"; exit 1 }

if ($data -isnot [System.Collections.IEnumerable] -or $data -is [System.Collections.Hashtable]) { $data = ,$data }

function Flatten-Object {
    param($obj, $prefix="")
    $ht = @{}
    if ($obj -eq $null) { return $ht }
    if ($obj -is [System.Collections.IDictionary]) {
        foreach ($k in $obj.Keys) {
            $v = $obj[$k]
            $key = if ($prefix -eq "") { $k } else { "$prefix.$k" }
            if ($v -is [System.Management.Automation.PSCustomObject] -or $v -is [System.Collections.IDictionary]) {
                $nested = Flatten-Object $v $key
                foreach ($nk in $nested.Keys) { $ht[$nk] = $nested[$nk] }
            } elseif ($v -is [System.Collections.IEnumerable] -and -not ($v -is [string])) {
                $ht[$key] = ($v | ForEach-Object { if ($_ -is [System.Management.Automation.PSCustomObject] -or $_ -is [System.Collections.IDictionary]) { ($_ | ConvertTo-Json -Compress) } else { $_.ToString() } }) -join ";"
            } else {
                $ht[$key] = $v
            }
        }
    } else {
        foreach ($p in $obj.psobject.properties) {
            $v = $p.Value
            $key = if ($prefix -eq "") { $p.Name } else { "$prefix.$($p.Name)" }
            if ($v -is [System.Management.Automation.PSCustomObject] -or $v -is [System.Collections.IDictionary]) {
                $nested = Flatten-Object $v $key
                foreach ($nk in $nested.Keys) { $ht[$nk] = $nested[$nk] }
            } elseif ($v -is [System.Collections.IEnumerable] -and -not ($v -is [string])) {
                $ht[$key] = ($v | ForEach-Object { if ($_ -is [System.Management.Automation.PSCustomObject] -or $_ -is [System.Collections.IDictionary]) { ($_ | ConvertTo-Json -Compress) } else { $_.ToString() } }) -join ";"
            } else {
                $ht[$key] = $v
            }
        }
    }
    return $ht
}

$allKeys = New-Object System.Collections.Generic.HashSet[string]
$rows = @()

# If input has top-level metadata and a `products` array, create one row per product
if ($data -is [System.Management.Automation.PSCustomObject] -and $data.PSObject.Properties.Name -contains 'products' -and ($data.products -is [System.Collections.IEnumerable])) {
    # collect scalar top-level fields (exclude 'products') to repeat for each product
    $globalFields = @{}
    foreach ($p in $data.psobject.properties) {
        if ($p.Name -eq 'products') { continue }
        $val = $p.Value
        if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) { continue }
        $globalFields[$p.Name] = $val
    }

    foreach ($prod in $data.products) {
        $flat = Flatten-Object $prod
        foreach ($k in $globalFields.Keys) { $flat[$k] = $globalFields[$k] }
        foreach ($k in $flat.Keys) { $allKeys.Add($k) | Out-Null }
        $rows += ,$flat
    }
} else {
    foreach ($item in $data) {
        $flat = Flatten-Object $item
        foreach ($k in $flat.Keys) { $allKeys.Add($k) | Out-Null }
        $rows += ,$flat
    }
}

$headers = $allKeys | Sort-Object

if ([string]::IsNullOrEmpty($OutputFile)) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
    $dir = [System.IO.Path]::GetDirectoryName((Resolve-Path $InputFile).Path)
    $OutputFile = Join-Path $dir ("$base.csv")
}

$objects = foreach ($r in $rows) {
    $props = @{}
    foreach ($h in $headers) {
        $val = $null
        if ($r.ContainsKey($h)) { $val = $r[$h] }
        $props[$h] = $val
    }
    New-Object PSObject -Property $props
}


# Generate CSV text and write with UTF-8 BOM so Excel on Windows recognizes encoding
$csvLines = $objects | ConvertTo-Csv -NoTypeInformation -Delimiter $Delimiter
$csvText = $csvLines -join "`r`n"
# create UTF8 encoding that emits BOM, then write
$enc = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($OutputFile, $csvText, $enc)

Write-Output "CSV scritto in $OutputFile (UTF-8 BOM, delimiter='$Delimiter')"
