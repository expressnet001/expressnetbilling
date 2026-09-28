# k6 traffic simulation

This directory is intentionally separate from the application. The script models authenticated tenant traffic with read-only requests for login, dashboard, customers, packages, payments, invoices, vouchers, tasks, and MikroTik settings.

## Configure

Use a dedicated test tenant and test account. Do not use a real customer account or real payment endpoints.

```powershell
$env:K6_BASE_URL = "https://your-production-host.example"
$env:K6_LOGIN_EMAIL = "load-test@example.com"
$env:K6_LOGIN_PASSWORD = "use-a-dedicated-password"
$env:K6_ALLOW_PRODUCTION = "YES"
$env:K6_TARGET_VUS = "2500"
$env:K6_RAMP_MINUTES = "15"
```

The normal login flow may require email verification. The test script will stop instead of bypassing that protection. For a high-volume run, use a test environment with its own approved login policy or provide a short-lived `K6_AUTH_TOKEN` for the tenant pages after validating login separately.

## Run a smoke test first

```powershell
$env:K6_BASE_URL = "http://127.0.0.1:8000"
$env:K6_TARGET_VUS = "2"
$env:K6_DURATION = "30s"
k6 run .\loadtests\k6-tenant-traffic.js
```

## Run the 2,500-user test

Only run this during an approved maintenance window after confirming monitoring, database capacity, queue capacity, email/SMS provider limits, and a rollback/stop procedure.

```powershell
k6 run --out json=loadtests/results.json .\loadtests\k6-tenant-traffic.js
```

The default ramp is controlled by `K6_RAMP_MINUTES` and reaches `K6_TARGET_VUS`. Set `K6_DURATION` for a fixed steady-state test. The script does not create customers, payments, vouchers, invoices, or router changes.
