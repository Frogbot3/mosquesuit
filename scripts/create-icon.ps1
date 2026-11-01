$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\build'))
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
$bitmap = New-Object Drawing.Bitmap 256,256
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::FromArgb(16,88,76))
$ivory = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(247,244,231))
$gold = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(218,181,97))
$green = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(16,88,76))
$graphics.FillRectangle($ivory,60,123,136,86)
$dome = New-Object Drawing.Drawing2D.GraphicsPath
$dome.AddBezier(60,123,62,90,113,82,128,48)
$dome.AddBezier(128,48,143,82,194,90,196,123)
$dome.CloseFigure()
$graphics.FillPath($ivory,$dome)
$graphics.FillRectangle($gold,34,81,13,128)
$graphics.FillRectangle($gold,209,81,13,128)
$graphics.FillEllipse($gold,34,63,13,18)
$graphics.FillEllipse($gold,209,63,13,18)
$graphics.FillPie($green,106,137,44,48,180,180)
$graphics.FillRectangle($green,106,161,44,48)
$graphics.FillRectangle($gold,34,214,188,6)
$pngPath = Join-Path $assetRoot 'icon.png'
$bitmap.Save($pngPath,[Drawing.Imaging.ImageFormat]::Png)
$png = [IO.File]::ReadAllBytes($pngPath)
$stream = [IO.File]::Create((Join-Path $assetRoot 'icon.ico'))
$writer = New-Object IO.BinaryWriter $stream
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$png.Length); $writer.Write([UInt32]22); $writer.Write($png)
$writer.Dispose(); $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
$ivory.Dispose(); $gold.Dispose(); $green.Dispose(); $dome.Dispose()
Write-Output 'Created original Mosque Suite testing icon (256px PNG/ICO).'
