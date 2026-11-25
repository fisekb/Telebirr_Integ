require('dotenv').config();

function databaseUrl(environment) {
  const requiredNames = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  if (environment === 'test') return process.env.TEST_DATABASE_URL;
  if (environment === 'production' || process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (requiredNames.some(name => !process.env[name])) return undefined;

  const url = new URL('postgres://localhost');
  url.hostname = process.env.DB_HOST;
  url.port = process.env.DB_PORT;
  url.username = process.env.DB_USER;
  url.password = process.env.DB_PASSWORD;
  url.pathname = `/${process.env.DB_NAME}`;
  return url.toString();
}

module.exports = {
  development: {
    url: databaseUrl('development'),
    dialect: 'postgres',
    logging: false
  },
  test: {
    url: databaseUrl('test'),
    dialect: 'postgres',
    logging: false
  },
  production: {
    url: databaseUrl('production'),
    dialect: 'postgres',
    logging: false
  }
};
