/**
 * PM2 Ecosystem Configuration
 * Usage:
 *   npm run build          # build frontend
 *   pm2 start ecosystem.config.cjs  # start server with PM2
 *   pm2 save               # save process list
 *   pm2 startup            # auto-start on reboot
 */
module.exports = {
  apps: [
    {
      name: 'tayyorlovmarkaz',
      script: 'node_modules/.bin/tsx',
      args: 'server/index.ts',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
