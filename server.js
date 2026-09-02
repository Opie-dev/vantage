// Vantage — personal finance tracker. Run: npm start → http://localhost:8123
//
// Entry point only. The app itself is assembled in src/app.js:
//   src/routes       what exists, one router per resource
//   src/controllers  HTTP in, HTTP out
//   src/services     business logic and validation
//   src/models       all SQL
//   src/middleware   async wrapper, 404, error handler
const app = require('./src/app');
const config = require('./src/config');
const { init } = require('./src/db');

init()
  .then(() => app.listen(config.port, () => console.log(`Vantage running → http://localhost:${config.port}`)))
  .catch(e => {
    console.error(`Database unavailable: ${e.message}`);
    console.error('Is the devdata Postgres up?  docker start dev-postgres');
    process.exit(1);
  });
