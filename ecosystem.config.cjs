module.exports = {
  apps: [
    {
      name: "hadazi",
      script: "server.js",
      cwd: "/var/www/hadazi",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      max_memory_restart: "300M",
      error_file: "/var/log/hadazi/error.log",
      out_file: "/var/log/hadazi/out.log",
      time: true
    }
  ]
};
