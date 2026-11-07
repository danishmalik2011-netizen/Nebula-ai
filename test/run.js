"use strict";
/* Cross-version, cross-platform test entry (node --test globbing differs between Node 18/20/22). */
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).map(f => path.join(__dirname, f));
process.exit(spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" }).status || 0);
