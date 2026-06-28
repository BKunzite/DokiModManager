$Host.UI.RawUI.WindowTitle = 'Doki Doki Mod Manager Updater';
$art = @'
██████╗  ██████╗ ██╗  ██╗██╗    ██████╗  ██████╗ ██╗  ██╗██╗
██╔══██╗██╔═══██╗██║ ██╔╝██║    ██╔══██╗██╔═══██╗██║ ██╔╝██║
██║  ██║██║   ██║█████╔╝ ██║    ██║  ██║██║   ██║█████╔╝ ██║
██║  ██║██║   ██║██╔═██╗ ██║    ██║  ██║██║   ██║██╔═██╗ ██║
██████╔╝╚██████╔╝██║  ██╗██║    ██████╔╝╚██████╔╝██║  ██╗██║
╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝

███╗   ███╗ ██████╗ ██████╗
████╗ ████║██╔═══██╗██╔══██╗
██╔████╔██║██║   ██║██║  ██║
██║╚██╔╝██║██║   ██║██║  ██║
██║ ╚═╝ ██║╚██████╔╝██████╔╝
╚═╝     ╚═╝ ╚═════╝ ╚═════╝

███╗   ███╗ █████╗ ███╗   ██╗ █████╗  ██████╗ ███████╗██████╗
████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗
██╔████╔██║███████║██╔██╗ ██║███████║██║  ███╗█████╗  ██████╔╝
██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══██║██║   ██║██╔══╝  ██╔══██╗
██║ ╚═╝ ██║██║  ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
Updater
By // BKunzite
'@

$colors = @('Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta');
$lines = $art -split "`n";
$row = 0;

foreach ($line in $lines) {
    $col = 0;
    foreach ($char in $line.ToCharArray()) {
        $colorIndex = [math]::Floor(($row + $col / 3) % $colors.Length);
        Write-Host -NoNewline -ForegroundColor $colors[$colorIndex] $char;
        $col++;
    };
    Write-Host "";
    $row++;
};

Write-Output "Waiting for DDMM To Close... (3s)";
Start-Sleep 3;
Write-Output "Updating DDMM...";

if (Test-Path 'dokimodmanager-new.exe') {
    if (Test-Path 'dokimodmanager.exe') {
        Remove-Item 'dokimodmanager.exe' -Force -ErrorAction SilentlyContinue;
    }
    Rename-Item 'dokimodmanager-new.exe' 'dokimodmanager.exe';
};

Write-Output "Updated DDMM, Launching... (2s)";
Start-Sleep 2;

if (Test-Path 'dokimodmanager.exe') {
    $binDir = (Get-Location).Path;
    Start-Process '.\dokimodmanager.exe' -WorkingDirectory $binDir -WindowStyle Normal;
}