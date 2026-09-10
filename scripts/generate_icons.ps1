# Generate Diffrex Application Icons (PNG & ICO) using .NET System.Drawing
Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot "..\assets"
if (!(Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

function Draw-DiffrexIcon([System.Drawing.Graphics]$g, [int]$size) {
    $scale = [float]$size / 512.0
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.ScaleTransform($scale, $scale)

    # Background Squircle
    $bgRect = New-Object System.Drawing.Rectangle(24, 24, 464, 464)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(512, 512)),
        [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
        [System.Drawing.Color]::FromArgb(255, 9, 13, 22)
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 160
    $path.AddArc(24, 24, $d, $d, 180, 90)
    $path.AddArc(488 - $d, 24, $d, $d, 270, 90)
    $path.AddArc(488 - $d, 488 - $d, $d, $d, 0, 90)
    $path.AddArc(24, 488 - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.FillPath($bgBrush, $path)

    # Border Glow
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 6)
    $g.DrawPath($borderPen, $path)

    # Left Pane (Base)
    $leftBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 2, 132, 199))
    $leftPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 51, 65, 85), 3)
    $g.FillRectangle($leftBrush, 72, 96, 174, 320)
    $g.DrawRectangle($leftPen, 72, 96, 174, 320)

    # Right Pane (Target)
    $rightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 16, 185, 129))
    $rightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 51, 65, 85), 3)
    $g.FillRectangle($rightBrush, 266, 96, 174, 320)
    $g.DrawRectangle($rightPen, 266, 96, 174, 320)

    # Code lines
    $codeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 100, 116, 139))
    $g.FillRectangle($codeBrush, 100, 136, 90, 12)
    $g.FillRectangle($codeBrush, 100, 164, 120, 12)
    $g.FillRectangle($codeBrush, 294, 136, 90, 12)
    $g.FillRectangle($codeBrush, 294, 164, 120, 12)

    # Left Diff (Red Minus)
    $redBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 248, 113, 113))
    $redPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 248, 113, 113), 2)
    $redBar = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 113, 113))
    $g.FillRectangle($redBg, 92, 200, 134, 56)
    $g.DrawRectangle($redPen, 92, 200, 134, 56)
    $g.FillRectangle($redBar, 110, 224, 32, 8)

    # Right Diff (Green Plus)
    $greenBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 74, 222, 128))
    $greenPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 74, 222, 128), 2)
    $greenBar = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 74, 222, 128))
    $g.FillRectangle($greenBg, 286, 200, 134, 88)
    $g.DrawRectangle($greenPen, 286, 200, 134, 88)
    $g.FillRectangle($greenBar, 308, 218, 8, 28)
    $g.FillRectangle($greenBar, 298, 228, 28, 8)

    # Dotted center line
    $dashPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 71, 85, 105), 4)
    $dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $g.DrawLine($dashPen, 256, 80, 256, 432)

    # AI Star
    $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 204, 21))
    $starPoints = @(
        (New-Object System.Drawing.Point(256, 44)),
        (New-Object System.Drawing.Point(262, 64)),
        (New-Object System.Drawing.Point(282, 70)),
        (New-Object System.Drawing.Point(262, 76)),
        (New-Object System.Drawing.Point(256, 96)),
        (New-Object System.Drawing.Point(250, 76)),
        (New-Object System.Drawing.Point(230, 70)),
        (New-Object System.Drawing.Point(250, 64))
    )
    $g.FillPolygon($starBrush, $starPoints)

    # Badge DIFFREX
    $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $badgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 2)
    $g.FillRectangle($badgeBrush, 196, 362, 120, 32)
    $g.DrawRectangle($badgePen, 196, 362, 120, 32)

    $font = New-Object System.Drawing.Font("Arial", 12, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("DIFFREX", $font, $textBrush, (New-Object System.Drawing.RectangleF(196, 362, 120, 32)), $sf)

    $g.ResetTransform()
}

Write-Host "Rendering icon.png (256x256)..."
$bmp256 = New-Object System.Drawing.Bitmap(256, 256)
$g256 = [System.Drawing.Graphics]::FromImage($bmp256)
Draw-DiffrexIcon $g256 256
$pngPath = Join-Path $assetsDir "icon.png"
$bmp256.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created: $pngPath"

Write-Host "Rendering icon.ico..."
$icoPath = Join-Path $assetsDir "icon.ico"
$hIcon = $bmp256.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
Write-Host "Created: $icoPath"

$bmp256.Dispose()
$g256.Dispose()
Write-Host "Application icons successfully generated!"
