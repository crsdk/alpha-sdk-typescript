import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

// POST /api/browse — open native OS folder picker dialog
export async function POST() {
  try {
    let selectedPath = "";

    if (process.platform === "darwin") {
      // macOS: use osascript to open folder picker
      const result = execSync(
        `osascript -e 'set theFolder to choose folder with prompt "Select save destination"' -e 'return POSIX path of theFolder'`,
        { timeout: 60000, encoding: "utf-8" }
      ).trim();
      selectedPath = result;
    } else if (process.platform === "win32") {
      // Windows: use PowerShell folder browser
      const result = execSync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select save destination'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }"`,
        { timeout: 60000, encoding: "utf-8" }
      ).trim();
      selectedPath = result;
    } else {
      // Linux: try zenity
      try {
        const result = execSync(
          `zenity --file-selection --directory --title="Select save destination"`,
          { timeout: 60000, encoding: "utf-8" }
        ).trim();
        selectedPath = result;
      } catch {
        // Fallback to home directory
        selectedPath = homedir();
      }
    }

    if (selectedPath && existsSync(selectedPath)) {
      return NextResponse.json({ success: true, path: selectedPath });
    }

    return NextResponse.json({ success: false, message: "No folder selected" });
  } catch {
    return NextResponse.json({ success: false, message: "Dialog cancelled or failed" });
  }
}
