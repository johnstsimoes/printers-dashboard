// One-time Bambu Cloud sign-in. Stores only the resulting token in bambu-cloud.json,
// never the password.

const readline = require('readline');
const cloud = require('./cloud');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(hidden ? answer : answer.trim());
    });
    // The prompt has been written synchronously; swallow the echoed keystrokes.
    if (hidden) rl._writeToOutput = () => {};
  });
}

async function main() {
  const regionAnswer = (await ask('Region - global or china? [global]: ')).toLowerCase();
  const region = regionAnswer.startsWith('c') ? 'china' : 'global';
  const email = await ask('Bambu account email: ');
  const password = await ask('Password (leave blank to sign in with an emailed code): ', { hidden: true });

  let tokens;
  if (password) {
    tokens = await cloud.login(region, email, password);
  } else {
    tokens = { needs: 'code' };
  }

  if (tokens.needs === 'code') {
    await cloud.sendEmailCode(region, email);
    const code = await ask(`Verification code sent to ${email}: `);
    tokens = await cloud.loginWithCode(region, email, code);
  } else if (tokens.needs === 'tfa') {
    const code = await ask('Two-factor authentication code: ');
    tokens = await cloud.loginWithTfa(region, tokens.tfaKey, code);
  }

  const username = await cloud.getUsername(region, tokens.accessToken);
  const session = { region, username, ...tokens };
  const devices = await cloud.getDevices(session);
  cloud.saveSession(session);

  console.log(`\nSigned in. Found ${devices.length} printer${devices.length === 1 ? '' : 's'}:`);
  for (const d of devices) {
    console.log(`  - ${d.name} (${d.dev_product_name || 'unknown model'}, ${d.dev_id}) ${d.online ? 'online' : 'offline'}`);
  }
  console.log(`\nToken saved to ${cloud.SESSION_PATH}`);
  console.log(`Valid until about ${new Date(session.expiresAt).toLocaleDateString()}. Run "npm start" to open the dashboard.`);
}

main().catch((err) => {
  console.error(`\nSign-in failed: ${err.message}`);
  process.exit(1);
});
