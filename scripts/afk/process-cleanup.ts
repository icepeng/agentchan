import { existsSync } from "node:fs";

/**
 * Terminate processes that are descendants of this bun process AND
 * reference the given path in their CommandLine. Used before
 * `git worktree remove` to release lingering file handles inside the
 * worktree (claude / bun install spawn descendants on Windows).
 *
 * Earlier attempts matched CommandLine globally, which killed
 * explorer.exe / user shells when those had the path in their args.
 * The descendant-only filter scopes blast radius to processes we own.
 */
export async function terminateWindowsProcessesHoldingPath(
  path: string,
): Promise<void> {
  if (process.platform !== "win32" || !existsSync(path)) return;

  const script = String.raw`
$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path -LiteralPath $args[0]).Path.TrimEnd("\")
$bunPid = [int]$args[1]
$self = $PID

# Walk the process tree from the bun parent and collect all descendants.
$descendants = New-Object 'System.Collections.Generic.HashSet[int]'
$queue = New-Object 'System.Collections.Generic.Queue[int]'
$queue.Enqueue($bunPid)
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $parent" |
    ForEach-Object {
      $childPid = [int]$_.ProcessId
      if ($descendants.Add($childPid)) {
        $queue.Enqueue($childPid)
      }
    }
}

# Among descendants, target those whose CommandLine references the worktree.
$locked = @{}
Get-CimInstance Win32_Process |
  Where-Object {
    $descendants.Contains([int]$_.ProcessId) -and
    $_.ProcessId -ne $self -and
    $_.ProcessId -ne $bunPid -and
    $_.CommandLine -and
    $_.CommandLine.Contains($root)
  } |
  ForEach-Object {
    $locked[[int]$_.ProcessId] = "descendant command line"
  }

foreach ($id in $locked.Keys) {
  try {
    $proc = Get-Process -Id $id -ErrorAction Stop
    Write-Output ("stopping {0} ({1}) via {2}" -f $proc.ProcessName, $id, $locked[$id])
    Stop-Process -Id $id -Force -ErrorAction Stop
  } catch {}
}
`;

  const proc = Bun.spawn(
    [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
      path,
      String(process.pid),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (stdout.trim()) {
    console.log(`[worktree cleanup] ${stdout.trim().replace(/\r?\n/g, "; ")}`);
  }
  if (exitCode !== 0 && stderr.trim()) {
    console.warn(
      `[worktree cleanup] process scan failed (${exitCode}): ${stderr.trim().slice(0, 300)}`,
    );
  }
}
