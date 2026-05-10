#!/usr/bin/env node
process.stdout.write("Mock Codex CLI ready\r\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const value = chunk.toString();
  if (value.includes("\u0003") || value.trim() === "exit") {
    process.stdout.write("Mock session exiting\r\n");
    process.exit(0);
  }
  process.stdout.write(`mock> ${value.replace(/\r?\n/g, "\r\n")}`);
});
