/**
 * PowerShell script that drives classic Outlook for Windows through COM. It reads one JSON
 * request from a file (UTF-8) and prints one JSON line. Kept as a string so it ships inside
 * the bundle; it is written to userData at runtime.
 *
 * Actions:
 *   accounts            -> { ok, accounts: [{ email, name }] }
 *   send                -> { ok }            (to, subject, html, attachments[], sendId, account?)
 *   wasSent             -> { ok, found }     (sendId; searches Sent Items and Outbox)
 * Errors               -> { ok: false, code, detail, hresult }
 */
export const OUTLOOK_SCRIPT = String.raw`
param([Parameter(Mandatory = $true)][string]$InputPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Custom internet header stamped on each message (PS_INTERNET_HEADERS namespace).
$SendIdProperty = 'http://schemas.microsoft.com/mapi/string/{00020386-0000-0000-C000-000000000046}/x-leadmailer-send-id'

function Write-Result($value) {
  Write-Output ($value | ConvertTo-Json -Compress -Depth 5)
}

try {
  $req = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Write-Result @{ ok = $false; code = 'outlookError'; detail = 'bad request' }
  exit 0
}

try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  Write-Result @{ ok = $false; code = 'outlookUnavailable'; detail = $_.Exception.Message; hresult = $_.Exception.HResult }
  exit 0
}

try {
  $session = $outlook.GetNamespace('MAPI')

  switch ($req.action) {
    'accounts' {
      $accounts = @()
      foreach ($a in $session.Accounts) {
        $accounts += @{ email = [string]$a.SmtpAddress; name = [string]$a.DisplayName }
      }
      Write-Result @{ ok = $true; accounts = $accounts }
    }

    'send' {
      $mail = $outlook.CreateItem(0)
      if ($req.account) {
        foreach ($a in $session.Accounts) {
          if ([string]$a.SmtpAddress -ieq [string]$req.account) { $mail.SendUsingAccount = $a }
        }
      }
      $recipient = $mail.Recipients.Add([string]$req.to)
      [void]$recipient.Resolve()
      $mail.Subject = [string]$req.subject
      $mail.HTMLBody = [string]$req.html
      foreach ($path in $req.attachments) {
        [void]$mail.Attachments.Add([string]$path)
      }
      $mail.PropertyAccessor.SetProperty($SendIdProperty, [string]$req.sendId)
      $mail.Send()
      Write-Result @{ ok = $true }
    }

    'wasSent' {
      $id = ([string]$req.sendId) -replace "'", "''"
      $filter = '@SQL="' + $SendIdProperty + '" = ''' + $id + ''''
      $found = $false
      foreach ($folderId in @(5, 4)) {
        # 5 = Sent Items, 4 = Outbox (queued in Outlook counts as sent).
        $items = $session.GetDefaultFolder($folderId).Items.Restrict($filter)
        if ($items.Count -gt 0) { $found = $true }
      }
      Write-Result @{ ok = $true; found = $found }
    }

    default {
      Write-Result @{ ok = $false; code = 'outlookError'; detail = 'unknown action' }
    }
  }
} catch {
  Write-Result @{ ok = $false; code = 'outlookError'; detail = $_.Exception.Message; hresult = $_.Exception.HResult }
}
`
