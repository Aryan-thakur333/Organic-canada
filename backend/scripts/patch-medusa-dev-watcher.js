const path = require("path")

try {
  const chokidar = require("chokidar")
  const originalWatch = chokidar.watch.bind(chokidar)
  const ignoredUploadPath = path.normalize("uploads/digital")

  // Extensions and patterns that should never trigger a server restart
  const SCRATCH_EXTENSIONS = new Set([".cjs", ".mjs", ".log", ".tmp", ".pdf", ".zip"])
  const SCRATCH_PREFIXES   = ["_test", "inspect-", "fix-", "check-", "audit-", "deep-", "verify-", "find-", "final-"]

  function shouldIgnorePath(filePath) {
    if (!filePath) return false
    const normalized = path.normalize(String(filePath))
    // Always ignore digital uploads dir
    if (normalized.includes(ignoredUploadPath)) return true
    const base = path.basename(normalized)
    const ext  = path.extname(normalized).toLowerCase()
    // Ignore scratch file extensions
    if (SCRATCH_EXTENSIONS.has(ext)) return true
    // Ignore scratch file name prefixes
    if (SCRATCH_PREFIXES.some(p => base.startsWith(p))) return true
    return false
  }

  if (chokidar.FSWatcher?.prototype?.emit) {
    const originalEmit = chokidar.FSWatcher.prototype.emit
    chokidar.FSWatcher.prototype.emit = function emitWithoutScratchFiles(eventName, filePath, ...args) {
      if (["add", "change", "unlink", "addDir", "unlinkDir"].includes(eventName) && shouldIgnorePath(filePath)) {
        return false
      }
      return originalEmit.call(this, eventName, filePath, ...args)
    }
  }

  chokidar.watch = function watchWithScratchIgnore(paths, options = {}) {
    const originalIgnored = Array.isArray(options.ignored)
      ? options.ignored
      : options.ignored
        ? [options.ignored]
        : []

    return originalWatch(paths, {
      ...options,
      ignored: [
        ...originalIgnored,
        "uploads",
        "uploads/**",
        "uploads/digital",
        "uploads/digital/**",
        "**/*.log",
        ".backend-port",
        shouldIgnorePath,
      ],
    })
  }
} catch (error) {
  console.warn("[start-dev] Unable to patch Medusa watcher ignores:", error?.message || error)
}
