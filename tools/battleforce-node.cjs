// Local JSON bridge: Python calls the same JS used by the browser, without a shell.
const fs = require('node:fs');
global.window = global;
const v2 = require('../battleforce-v2.js');
require('../battleforce-runtime.js');
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  let result;
  if (request.action === 'validatePackage') result = v2.validatePackage(request.pkg);
  else if (request.action === 'validateArmy') {
    require('../dice-enums.js');
    require('../upgrade-faces.js');
    require('../rules-core.js');
    result = RulesCore.validateArmy(request.army, request.data);
  } else throw Error('未知的战斗部队操作');
  process.stdout.write(JSON.stringify({result}));
} catch (error) {
  process.stdout.write(JSON.stringify({error: error.message}));
  process.exitCode = 1;
}
