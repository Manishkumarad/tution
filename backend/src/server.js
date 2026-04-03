const app = require('./app');
const env = require('./config/env');
const { startReminderJobs } = require('./services/reminder-cron');

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
  startReminderJobs();
});
