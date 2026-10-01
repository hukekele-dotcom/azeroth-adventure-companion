param([Parameter(Mandatory=$true)][string]$KeyPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if (-not (Test-Path -LiteralPath $KeyPath)) {
    $vaultKey = New-Object byte[] 32
    $vaultRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $vaultRng.GetBytes($vaultKey) } finally { $vaultRng.Dispose() }
    $vaultProtected = [System.Security.Cryptography.ProtectedData]::Protect($vaultKey,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.File]::WriteAllBytes($KeyPath,$vaultProtected)
} else {
    $vaultProtected = [System.IO.File]::ReadAllBytes($KeyPath)
    $vaultKey = [System.Security.Cryptography.ProtectedData]::Unprotect($vaultProtected,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
}
# Sent only to the parent process pipe; never log or persist the plaintext key.
[Console]::Out.Write([Convert]::ToBase64String($vaultKey))
[Array]::Clear($vaultKey,0,$vaultKey.Length)
