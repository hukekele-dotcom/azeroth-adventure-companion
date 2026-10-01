'use strict';
// Windows hidden launches of the extensionless CodeBuddy entry can exit 0
// without emitting events. Load it through a CommonJS entry instead. Preserve
// the CLI argv, stdin/stdout, login environment and exit status unchanged.
const path = require('path');
const cli = process.argv[2];
if (!cli || !path.isAbsolute(cli)) {
  process.stderr.write('WorkBuddy launcher requires an absolute CLI path.\n');
  process.exit(2);
}
process.argv.splice(1, 1);
require(cli);
