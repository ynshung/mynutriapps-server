# MyNutriApps Server

## Environment Setup
```
PORT=3000
PROD_DATABASE_URL=pg://
TEST_DATABASE_URL=pg://

GEMINI_API=

S3_BUCKET_NAME=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_ACCESS_KEY=

BACKEND_AI_HOST=http://127.0.0.1:5001
```

## Docker
```bash
docker build -t ynshung/mna-server .
docker run -v $(pwd)/mynutriapps-service-account.json:/app/mynutriapps-service-account.json --env-file .env -p 3000:3000 ynshung/mna-server
```
