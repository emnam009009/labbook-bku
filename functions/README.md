# LabBook BKU Cloud Functions

Firebase Cloud Functions (2nd generation, Node 20, TypeScript) cho AI module.

## Status

- **Round 106b**: Skeleton ✅
- **Round 106c**: Hello-world deploy + verify (next)
- **Round 106d**: Configure secrets
- **Round 107+**: Implement actual proxies

## Structure

```
functions/
├── package.json              # firebase-functions v7+, Node 20
├── tsconfig.json             # TypeScript strict partial (matching root)
├── .gitignore
├── .env.example              # Template for local emulator
├── README.md                 # This file
└── src/
    ├── index.ts              # Entry point — re-exports all functions
    ├── handlers/
    │   ├── hello.ts          # Hello-world (Round 106c)
    │   ├── claude-proxy.ts   # Round 111+
    │   ├── gemini-proxy.ts   # Round 111+
    │   ├── voyage-proxy.ts   # Round 121+
    │   ├── chandra-proxy.ts  # Round 117+
    │   └── python-bridge.ts  # Round 107+
    └── utils/
        ├── logger.ts         # Structured logger
        └── auth.ts           # Firebase Auth verification
```

## Deployment

### First-time setup

```bash
cd functions/
npm install
npm run build
```

### Deploy single function

```bash
npm run deploy:claude-proxy
# OR
firebase deploy --only functions:claudeProxy
```

### Deploy all functions

```bash
npm run deploy
# OR
firebase deploy --only functions
```

### Local emulator

```bash
# 1. Copy .env.example → .env và fill values
cp .env.example .env

# 2. Start emulator
npm run serve

# Functions sẽ chạy local tại:
# http://localhost:5001/lab-manager-268a6/asia-southeast1/[functionName]
```

## Secrets management

Production secrets dùng Firebase Functions secrets (preferred over functions config trong v2):

```bash
# Set secret (1 lần)
firebase functions:secrets:set ANTHROPIC_API_KEY
# (sẽ prompt nhập value)

# List secrets
firebase functions:secrets:access ANTHROPIC_API_KEY

# Trong code:
import { defineSecret } from "firebase-functions/params";
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

export const claudeProxy = onRequest(
  { secrets: [anthropicKey] },
  async (req, res) => {
    const apiKey = anthropicKey.value();  // Access at runtime
    // ...
  }
);
```

## Region

Tất cả functions deploy ở `asia-southeast1` (Singapore) — gần Việt Nam nhất, latency thấp.

## Logs

```bash
# Tail logs
firebase functions:log

# Specific function
firebase functions:log --only claudeProxy

# Last 50 entries
firebase functions:log -n 50
```

Hoặc xem trên Cloud Logging Console:
https://console.cloud.google.com/logs/query?project=lab-manager-268a6

## See also

- `/AI_ARCHITECTURE.md` Section 3 (Hybrid TS + Python)
- `/AI_ARCHITECTURE.md` Section 15 (Security & Privacy)
- [Firebase Functions docs](https://firebase.google.com/docs/functions/typescript)
