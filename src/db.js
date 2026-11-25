const { Sequelize } = require('sequelize');
const { defineModels } = require('./models');

function createDatabase(config) {
  const sequelize = new Sequelize(config.databaseUrl, {
    dialect: 'postgres',
    logging: false,
    pool: { max: 10, min: 0, idle: 10000 }
  });
  const models = defineModels(sequelize);
  return { sequelize, models };
}

module.exports = { createDatabase };

