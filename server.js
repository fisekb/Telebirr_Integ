const config = require('./src/config');
const { createDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const { sequelize, models } = createDatabase(config);
const app = createApp({ config, sequelize, models });

sequelize.authenticate()
  .then(() => {
    app.listen(config.port, () => {
      process.stdout.write(`Telebirr dashboard listening on port ${config.port}\n`);
    });
  })
  .catch(() => {
    process.stderr.write('Unable to connect to the configured database\n');
    process.exitCode = 1;
  });
